"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import useWebSocket from 'react-use-websocket';

import { ensureFreshAccessToken } from '@/lib/ws-auth';
import { isJwtExpired } from '@/lib/jwt';

export type UserStatus = 'online' | 'busy' | 'offline';

interface UserPresenceContextValue {
    onlineUsers: Set<number>;
    userStatuses: Map<number, UserStatus>;
    updateStatus: (status: UserStatus) => void;
}

const UserPresenceContext = createContext<UserPresenceContextValue>({
    onlineUsers: new Set(),
    userStatuses: new Map(),
    updateStatus: () => { },
});

export function UserPresenceProvider({ children }: { children: React.ReactNode }) {
    const [userStatuses, setUserStatuses] = useState<Map<number, UserStatus>>(new Map());
    const [socketUrl, setSocketUrl] = useState<string | null>(null);
    const refreshAttemptRef = useRef(0);

    const computeSocketUrl = useCallback(async (): Promise<string | null> => {
        if (typeof window === 'undefined') return null;

        // Check if user is on a public page (no auth required)
        const path = window.location.pathname;
        const PUBLIC_PATHS = ['/', '/login', '/register', '/forgot-password', '/reset-password', '/accept-invite'];
        const isPublic = PUBLIC_PATHS.some(p => path === p || path.startsWith(p + '/')) || path.startsWith('/p/');
        if (isPublic) return null;

        let token = localStorage.getItem('accessToken');
        if (!token) return null;
        if (isJwtExpired(token)) {
            try {
                const fresh = await ensureFreshAccessToken();
                if (fresh) token = fresh;
            } catch {
                return null;
            }
        }

        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8005';
        const isSecure = apiUrl.startsWith('https') || window.location.protocol === 'https:';
        const protocol = isSecure ? 'wss:' : 'ws:';
        const host = apiUrl.replace(/^https?:\/\//, '');

        const companySlug = localStorage.getItem('companySlug');
        const envCompany = process.env.NEXT_PUBLIC_COMPANY_SLUG;
        const effectiveCompany = companySlug || envCompany || undefined;

        const qs = `token=${encodeURIComponent(token)}${effectiveCompany ? `&company_slug=${encodeURIComponent(effectiveCompany)}` : ''}`;
        return `${protocol}//${host}/ws/presence/?${qs}`;
    }, []);

    useEffect(() => {
        let active = true;
        const refresh = () => {
            computeSocketUrl().then((url) => {
                if (active) setSocketUrl(url);
            });
        };

        refresh();

        const onCompanyChanged = () => refresh();
        const onLogin = () => refresh();
        const onStorage = (e: StorageEvent) => {
            if (!e.key) return;
            if (e.key === 'accessToken' || e.key === 'companySlug') refresh();
        };

        window.addEventListener('app-company-changed', onCompanyChanged);
        window.addEventListener('app-login', onLogin);
        window.addEventListener('storage', onStorage);

        return () => {
            active = false;
            window.removeEventListener('app-company-changed', onCompanyChanged);
            window.removeEventListener('app-login', onLogin);
            window.removeEventListener('storage', onStorage);
        };
    }, [computeSocketUrl]);

    const websocketOptions = useMemo(() => ({
        shouldReconnect: () => {
            // Don't reconnect if there's no token (user logged out)
            if (typeof window === 'undefined') return false;
            return !!localStorage.getItem('accessToken');
        },
        reconnectAttempts: 10,
        reconnectInterval: 3000,
        share: true,
        onClose: async () => {
            if (typeof window === 'undefined') return;
            const token = localStorage.getItem('accessToken');
            if (!token || !isJwtExpired(token)) return;
            if (refreshAttemptRef.current >= 2) return;
            refreshAttemptRef.current += 1;
            try {
                const fresh = await ensureFreshAccessToken();
                if (!fresh) return;
                const url = await computeSocketUrl();
                setSocketUrl(url);
            } catch {
                return;
            }
        },
        onMessage: (event: MessageEvent) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === 'presence_update') {
                    const user_id = data.user_id as number;
                    const status = data.status as UserStatus;

                    setUserStatuses((prev) => {
                        const currentStatus = prev.get(user_id);
                        if (currentStatus === status) return prev; // No change, keep stable

                        const next = new Map(prev);
                        if (status === 'offline') {
                            next.delete(user_id);
                        } else {
                            next.set(user_id, status);
                        }
                        return next;
                    });
                }
            } catch (err) {
                console.error("[UserPresence] WS message parse error", err);
            }
        },
    }), [computeSocketUrl]);

    const { sendJsonMessage, readyState } = useWebSocket(socketUrl, websocketOptions);

    const updateStatus = useCallback((status: UserStatus) => {
        if (socketUrl) {
            sendJsonMessage({ type: 'set_status', status });
        }
    }, [sendJsonMessage, socketUrl]);

    // ── Heartbeat ──────────────────────────────────────────────────────────
    // Best Practice: Send a heartbeat every 30s to keep the Redis TTL (60s) alive.
    // This allows the system to detect "dirty" disconnects automatically.
    React.useEffect(() => {
        if (readyState !== 1) return; // 1 = OPEN

        const interval = setInterval(() => {
            if (document.visibilityState === 'visible') {
                sendJsonMessage({ type: 'heartbeat' });
            }
        }, 30000); // 30 seconds

        return () => clearInterval(interval);
    }, [sendJsonMessage, readyState]);
    // ───────────────────────────────────────────────────────────────────────

    // Derived state: only recreate Set if Map changes
    const onlineUsers = useMemo(() => new Set(userStatuses.keys()), [userStatuses]);

    const contextValue = useMemo(() => ({
        onlineUsers,
        userStatuses,
        updateStatus
    }), [onlineUsers, userStatuses, updateStatus]);

    return (
        <UserPresenceContext.Provider value={contextValue}>
            {children}
        </UserPresenceContext.Provider>
    );
}

export function useUserPresence(): UserPresenceContextValue {
    const context = useContext(UserPresenceContext);
    if (!context) {
        throw new Error("useUserPresence must be used within a UserPresenceProvider");
    }
    return context;
}

