/**
 * Tests for the Axios API client instance.
 * Covers: request interceptor (auth headers) and response interceptor (token refresh).
 *
 * NOTE: We test the interceptor behavior by using axios-mock-adapter to intercept
 * HTTP calls without hitting a real server.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import axios from 'axios'
import MockAdapter from 'axios-mock-adapter'
import { api } from '@/lib/axios'

// The mock adapter wraps the shared api instance
const mock = new MockAdapter(api)
// Also mock the raw axios used inside the refresh token call
const rawMock = new MockAdapter(axios)

describe('api interceptor — request headers', () => {
    afterEach(() => {
        mock.reset()
        rawMock.reset()
        localStorage.clear()
    })

    it('attaches Authorization header when accessToken is set', async () => {
        localStorage.setItem('accessToken', 'my-access-token')
        mock.onGet('/api/test/').reply(200, { ok: true })

        const response = await api.get('/api/test/')
        const requestConfig = mock.history.get[0]

        expect(requestConfig.headers?.Authorization).toBe('Bearer my-access-token')
        expect(response.data).toEqual({ ok: true })
    })

    it('attaches X-Company-Slug header when companySlug is set', async () => {
        localStorage.setItem('accessToken', 'token')
        localStorage.setItem('companySlug', 'my-company')
        mock.onGet('/api/test/').reply(200, {})

        await api.get('/api/test/')
        const requestConfig = mock.history.get[0]

        expect(requestConfig.headers?.['X-Company-Slug']).toBe('my-company')
    })

    it('does not attach Authorization when no token', async () => {
        mock.onGet('/api/test/').reply(200, {})

        await api.get('/api/test/')
        const requestConfig = mock.history.get[0]

        expect(requestConfig.headers?.Authorization).toBeUndefined()
    })

    it('does not attach X-Company-Slug when no company', async () => {
        localStorage.setItem('accessToken', 'token')
        mock.onGet('/api/test/').reply(200, {})

        await api.get('/api/test/')
        const requestConfig = mock.history.get[0]

        expect(requestConfig.headers?.['X-Company-Slug']).toBeUndefined()
    })
})

describe('api interceptor — 401 refresh flow', () => {
    const API_URL = 'http://localhost:8005'
    const originalLocation = window.location

    const setMockLocation = (pathname: string) => {
        const locationMock = { href: '', pathname } as unknown as Location
        Object.defineProperty(window, 'location', {
            value: locationMock,
            configurable: true,
            writable: true,
        })
        return locationMock
    }

    beforeEach(() => {
        setMockLocation('/dashboard')
    })

    afterEach(() => {
        mock.reset()
        rawMock.reset()
        localStorage.clear()
        vi.restoreAllMocks()
        Object.defineProperty(window, 'location', {
            value: originalLocation,
            configurable: true,
            writable: true,
        })
    })

    it('refreshes token on 401 and retries the original request', async () => {
        localStorage.setItem('accessToken', 'expired')
        localStorage.setItem('refreshToken', 'valid-refresh')
        localStorage.setItem('companySlug', 'co')

        // First call → 401; after retry → 200
        let callCount = 0
        mock.onGet('/api/protected/').reply(() => {
            callCount++
            return callCount === 1 ? [401, {}] : [200, { result: 'ok' }]
        })

        // Raw axios call for token refresh
        rawMock.onPost(`${API_URL}/api/accounts/token/refresh/`).reply(200, {
            access: 'fresh-token',
        })

        const response = await api.get('/api/protected/')
        expect(response.data).toEqual({ result: 'ok' })
        expect(localStorage.getItem('accessToken')).toBe('fresh-token')
    })

    it('clears tokens and redirects when no refresh token on 401', async () => {
        localStorage.setItem('accessToken', 'expired')
        // No refreshToken
        const locationMock = setMockLocation('/dashboard')

        mock.onGet('/api/protected/').reply(401, {})

        try {
            await api.get('/api/protected/')
        } catch {
            // Expected rejection
        }

        expect(locationMock.href).toBe('/login')
    })
})
