import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/axios'
import { clearClientSession, ensureHasSessionCookie } from '@/lib/session'
import { User } from '@/types'

export function useAuth() {
    const queryClient = useQueryClient()

    const effectiveCompany =
        typeof window === 'undefined'
            ? process.env.NEXT_PUBLIC_COMPANY_SLUG || 'unknown'
            : localStorage.getItem('companySlug') || process.env.NEXT_PUBLIC_COMPANY_SLUG || 'unknown'

    const { data: user, isLoading, error } = useQuery<User | null>({
        queryKey: ['auth', 'user', effectiveCompany],
        queryFn: async () => {
            if (typeof window === 'undefined') return null
            const token = localStorage.getItem('accessToken')
            if (!token) return null
            ensureHasSessionCookie()

            try {
                const res = await api.get<User>('/api/accounts/users/me/')
                return res.data
            } catch (e) {
                const status =
                    typeof e === 'object' && e !== null && 'response' in e
                        ? (e as { response?: { status?: unknown } }).response?.status
                        : undefined
                if (status === 401 || status === 403) {
                    clearClientSession()
                }
                return null
            }
        },
        staleTime: 30_000,
        retry: false
    })

    useEffect(() => {
        if (typeof window === 'undefined') return
        const handler = () => {
            queryClient.invalidateQueries({ queryKey: ['auth', 'user'] })
        }
        window.addEventListener('app-company-changed', handler)
        return () => window.removeEventListener('app-company-changed', handler)
    }, [queryClient])

    return {
        user: user || null,
        isLoading,
        isAuthenticated: !!user,
        error
    }
}
