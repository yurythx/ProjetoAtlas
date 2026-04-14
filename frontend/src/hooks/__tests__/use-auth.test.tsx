import { renderHook, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useAuth } from '../use-auth'
import { api } from '@/lib/axios'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

// Mock axios instance
vi.mock('@/lib/axios', () => ({
    api: {
        get: vi.fn()
    }
}))

const createWrapper = () => {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: {
                retry: false,
            },
        },
    })
    return ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client= { queryClient } > { children } </QueryClientProvider>
  )
}

describe('useAuth hook', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        localStorage.clear()
    })

    it('should return null if no access token is present', async () => {
        const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() })

        await waitFor(() => expect(result.current.isLoading).toBe(false))
        expect(result.current.user).toBeNull()
        expect(result.current.isAuthenticated).toBe(false)
    })

    it('should return user data when token is present and API succeeds', async () => {
        localStorage.setItem('accessToken', 'valid-token')
        const mockUser = { id: 1, username: 'tester', email: 'test@test.com' }
        vi.mocked(api.get).mockResolvedValueOnce({ data: mockUser })

        const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() })

        await waitFor(() => expect(result.current.user).toEqual(mockUser))
        expect(result.current.isAuthenticated).toBe(true)
        expect(api.get).toHaveBeenCalledWith('/api/accounts/users/me/')
    })

    it('should return null if API fails (e.g. 401)', async () => {
        localStorage.setItem('accessToken', 'invalid-token')
        vi.mocked(api.get).mockRejectedValueOnce(new Error('Unauthorized'))

        const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() })

        await waitFor(() => expect(result.current.isLoading).toBe(false))
        expect(result.current.user).toBeNull()
        expect(result.current.isAuthenticated).toBe(false)
    })
})
