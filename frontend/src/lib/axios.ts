import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { isJwtExpired } from './jwt';
import { clearClientSession } from './session';

const isServer = typeof window === 'undefined';
const API_URL = isServer
  ? (process.env.API_URL_INTERNAL || process.env.NEXT_PUBLIC_API_URL || 'http://atlas_backend:8005')
  : (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8005');

export const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interface for the queue of failed requests
interface FailedRequest {
  resolve: (token: string) => void;
  reject: (error: unknown) => void;
}

let isRefreshing = false;
let failedQueue: FailedRequest[] = [];
let isRedirectingToLogin = false;

// Public routes that should never trigger auth redirects
const PUBLIC_PATHS = ['/', '/login', '/register', '/forgot-password', '/reset-password', '/accept-invite', '/servicos', '/404', '/500'];
const isPublicRoute = (pathname: string) => {
  if (!pathname) return true;
  return PUBLIC_PATHS.some(p => pathname === p || pathname.startsWith('/p/'));
};

const processQueue = (error: unknown, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token!);
    }
  });

  failedQueue = [];
};

api.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    const url = config.url || ''
    const isPublicApiRequest =
      url.includes('/api/articles/public/') ||
      url.includes('/api/pages/public/') ||
      url.includes('/api/core/companies/public_list/')

    const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
    const companySlug = typeof window !== 'undefined' ? localStorage.getItem('companySlug') : null;
    const envCompany = process.env.NEXT_PUBLIC_COMPANY_SLUG;
    const effectiveCompany = companySlug || envCompany || null;

    const isAuthEndpoint = Boolean(config.url?.includes('/api/accounts/token/'));
    const refreshToken = typeof window !== 'undefined' ? localStorage.getItem('refreshToken') : null;

    if (!isPublicApiRequest && !isAuthEndpoint && token && isJwtExpired(token) && refreshToken) {
      if (isRefreshing) {
        const newToken = await new Promise<string>((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        });
        config.headers.Authorization = `Bearer ${newToken}`;
      } else {
        isRefreshing = true;
        try {
          const response = await axios.post(`${API_URL}/api/accounts/token/refresh/`, {
            refresh: refreshToken,
          }, {
            headers: effectiveCompany ? { 'X-Company-Slug': effectiveCompany } : {}
          });

          const { access, refresh: newRefresh } = response.data as { access: string; refresh?: string };
          if (typeof window !== 'undefined') {
            localStorage.setItem('accessToken', access);
            if (newRefresh) localStorage.setItem('refreshToken', newRefresh);
          }
          api.defaults.headers.common['Authorization'] = `Bearer ${access}`;
          processQueue(null, access);
          config.headers.Authorization = `Bearer ${access}`;
        } catch (err) {
          processQueue(err, null);
        } finally {
          isRefreshing = false;
        }
      }
    } else if (!isPublicApiRequest && token && !config.headers.Authorization) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    const existingCompanyHeader =
      (config.headers['X-Company-Slug'] as string | undefined) ||
      (config.headers['x-company-slug'] as string | undefined);

    if (!existingCompanyHeader && effectiveCompany && !isPublicApiRequest) {
      config.headers['X-Company-Slug'] = effectiveCompany;
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Call this on successful login to re-enable future redirects
export function resetAuthState() {
  isRedirectingToLogin = false;
  isRefreshing = false;
  failedQueue = [];
}

api.interceptors.response.use(
  (response) => {
    return response;
  },
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    if (error.response?.status === 403 && typeof window !== 'undefined' && !isPublicRoute(window.location.pathname)) {
      const data = error.response.data as unknown
      let message = 'Acesso negado.'
      if (data && typeof data === 'object') {
        const obj = data as Record<string, unknown>
        if (typeof obj.message === 'string' && obj.message.trim()) message = obj.message
        else if (typeof obj.detail === 'string' && obj.detail.trim()) message = obj.detail
      }
      window.dispatchEvent(new CustomEvent('app-unauthorized', { detail: { message } }))
    }

    if (error.response?.status === 401 && !originalRequest._retry) {
      // Do not intercept authentication requests
      if (originalRequest.url?.includes('/api/accounts/token/')) {
        return Promise.reject(error);
      }

      // Never trigger auth redirect flows from public routes — just reject silently
      if (typeof window !== 'undefined' && isPublicRoute(window.location.pathname)) {
        return Promise.reject(error);
      }

      if (isRefreshing) {
        return new Promise(function (resolve, reject) {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return api(originalRequest);
          })
          .catch((err) => {
            return Promise.reject(err);
          });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const refreshToken = typeof window !== 'undefined' ? localStorage.getItem('refreshToken') : null;

      if (!refreshToken) {
        // No refresh token — clear storage and redirect once
        if (typeof window !== 'undefined') {
          clearClientSession();
          isRefreshing = false;
          if (!isRedirectingToLogin && !isPublicRoute(window.location.pathname)) {
            isRedirectingToLogin = true;
            window.location.href = '/login';
          }
        }
        return Promise.reject(error);
      }

      try {
        // Use a separate axios instance or manual headers to avoid interceptor recursion
        const companySlug = typeof window !== 'undefined' ? localStorage.getItem('companySlug') : null;
        const envCompany = process.env.NEXT_PUBLIC_COMPANY_SLUG;
        const effectiveCompany = companySlug || envCompany || null;

        const response = await axios.post(`${API_URL}/api/accounts/token/refresh/`, {
          refresh: refreshToken,
        }, {
          headers: effectiveCompany ? { 'X-Company-Slug': effectiveCompany } : {}
        });

        // ROTATE_REFRESH_TOKENS=True: backend returns both new access AND new refresh token.
        // We MUST save both — the old refresh is blacklisted after rotation.
        const { access, refresh: newRefresh } = response.data;

        if (typeof window !== 'undefined') {
          localStorage.setItem('accessToken', access);
          if (newRefresh) {
            localStorage.setItem('refreshToken', newRefresh);
          }
        }

        api.defaults.headers.common['Authorization'] = `Bearer ${access}`;
        processQueue(null, access);

        originalRequest.headers.Authorization = `Bearer ${access}`;
        return api(originalRequest);
      } catch (err) {
        processQueue(err, null);

        // Logout on refresh fail - Only if it's REALLY a 401/403 (invalid refresh token)
        if (typeof window !== 'undefined') {
          const isAuthError = axios.isAxiosError(err) && (err.response?.status === 401 || err.response?.status === 403);

          if (isAuthError) {
            clearClientSession();
            // Only redirect once and never from public routes
            if (!isRedirectingToLogin && !isPublicRoute(window.location.pathname)) {
              isRedirectingToLogin = true;
              window.location.href = '/login';
            }
          }
        }
        return Promise.reject(err);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);
