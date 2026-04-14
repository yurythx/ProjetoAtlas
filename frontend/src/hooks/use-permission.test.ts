import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { usePermission } from '@/hooks/use-permission'

// Mock useAuth to control user state in tests
vi.mock('@/hooks/use-auth', () => ({
    useAuth: vi.fn(),
}))

import { useAuth } from '@/hooks/use-auth'
const mockUseAuth = vi.mocked(useAuth)

import type { User } from '@/types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const buildUser = (overrides: Record<string, any> = {}): User => ({
    id: 1,
    username: 'testuser',
    email: 'test@example.com',
    is_superuser: false,
    is_staff: false,
    status: 'active',
    groups: [],
    role_details: {
        id: 1,
        name: 'Editor',
        is_system_role: false,
        permissions: ['articles.article_view', 'articles.article_create'],
    },
    ...overrides,
} as unknown as User)


describe('usePermission', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    describe('hasPermission', () => {
        it('returns false when user is not authenticated', () => {
            mockUseAuth.mockReturnValue({ user: null, isLoading: false, isAuthenticated: false, error: null })
            const { result } = renderHook(() => usePermission())
            expect(result.current.hasPermission('articles.article_view')).toBe(false)
        })

        it('returns true for superuser regardless of permissions', () => {
            mockUseAuth.mockReturnValue({
                user: buildUser({ is_superuser: true, role_details: null }),
                isLoading: false,
                isAuthenticated: true,
                error: null,
            })
            const { result } = renderHook(() => usePermission())
            expect(result.current.hasPermission('admin.user_manage')).toBe(true)
            expect(result.current.hasPermission('any.permission.at.all')).toBe(true)
        })

        it('returns true when user has the required permission', () => {
            mockUseAuth.mockReturnValue({
                user: buildUser(),
                isLoading: false,
                isAuthenticated: true,
                error: null,
            })
            const { result } = renderHook(() => usePermission())
            expect(result.current.hasPermission('articles.article_view')).toBe(true)
            expect(result.current.hasPermission('articles.article_create')).toBe(true)
        })

        it('returns false when user lacks the required permission', () => {
            mockUseAuth.mockReturnValue({
                user: buildUser(),
                isLoading: false,
                isAuthenticated: true,
                error: null,
            })
            const { result } = renderHook(() => usePermission())
            expect(result.current.hasPermission('articles.article_publish')).toBe(false)
            expect(result.current.hasPermission('admin.user_manage')).toBe(false)
        })

        it('returns false when user has no role_details', () => {
            mockUseAuth.mockReturnValue({
                user: buildUser({ role_details: null }),
                isLoading: false,
                isAuthenticated: true,
                error: null,
            })
            const { result } = renderHook(() => usePermission())
            expect(result.current.hasPermission('articles.article_view')).toBe(false)
        })

        it('returns false when role has empty permissions array', () => {
            mockUseAuth.mockReturnValue({
                user: buildUser({ role_details: { id: 1, name: 'Viewer', permissions: [] } }),
                isLoading: false,
                isAuthenticated: true,
                error: null,
            })
            const { result } = renderHook(() => usePermission())
            expect(result.current.hasPermission('articles.article_view')).toBe(false)
        })
    })

    describe('hasRole', () => {
        it('returns false when user is not authenticated', () => {
            mockUseAuth.mockReturnValue({ user: null, isLoading: false, isAuthenticated: false, error: null })
            const { result } = renderHook(() => usePermission())
            expect(result.current.hasRole('Editor')).toBe(false)
        })

        it('returns true for superuser on any role check', () => {
            mockUseAuth.mockReturnValue({
                user: buildUser({ is_superuser: true }),
                isLoading: false,
                isAuthenticated: true,
                error: null,
            })
            const { result } = renderHook(() => usePermission())
            expect(result.current.hasRole('Admin')).toBe(true)
            expect(result.current.hasRole('Anything')).toBe(true)
        })

        it('returns true when role name matches exactly', () => {
            mockUseAuth.mockReturnValue({
                user: buildUser(),
                isLoading: false,
                isAuthenticated: true,
                error: null,
            })
            const { result } = renderHook(() => usePermission())
            expect(result.current.hasRole('Editor')).toBe(true)
        })

        it('returns false when role name does not match', () => {
            mockUseAuth.mockReturnValue({
                user: buildUser(),
                isLoading: false,
                isAuthenticated: true,
                error: null,
            })
            const { result } = renderHook(() => usePermission())
            expect(result.current.hasRole('Admin')).toBe(false)
            expect(result.current.hasRole('editor')).toBe(false)  // case sensitive
        })
    })

    describe('userRole', () => {
        it('returns the role details when authenticated', () => {
            const role = { id: 1, name: 'Editor', permissions: ['articles.article_view'] }
            mockUseAuth.mockReturnValue({
                user: buildUser({ role_details: role }),
                isLoading: false,
                isAuthenticated: true,
                error: null,
            })
            const { result } = renderHook(() => usePermission())
            expect(result.current.userRole).toEqual(role)
        })

        it('returns undefined when user has no role', () => {
            mockUseAuth.mockReturnValue({
                user: buildUser({ role_details: null }),
                isLoading: false,
                isAuthenticated: true,
                error: null,
            })
            const { result } = renderHook(() => usePermission())
            expect(result.current.userRole).toBeNull()
        })
    })
})
