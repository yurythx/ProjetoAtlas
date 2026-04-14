/**
 * Integration-style tests for the toast-helpers module.
 * Tests that the correct toast is called with the correct content
 * for different API error structures.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AxiosError } from 'axios'
import { showApiError } from '@/lib/toast-helpers'

// Mock the toast hook
vi.mock('@/hooks/use-toast', () => ({
    toast: vi.fn(),
}))

import { toast } from '@/hooks/use-toast'
const mockToast = vi.mocked(toast)

function makeAxiosError(status: number, data: unknown): AxiosError {
    const error = new AxiosError('Request failed')
    error.response = {
        status,
        data,
        headers: {},
        config: {} as never,
        statusText: String(status),
    }
    return error
}

describe('showApiError', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('shows detail field from API error', () => {
        const err = makeAxiosError(400, { detail: 'Email already in use.' })
        showApiError(err)
        expect(mockToast).toHaveBeenCalledWith(
            expect.objectContaining({ description: 'Email already in use.', variant: 'destructive' })
        )
    })

    it('shows message field when no detail field', () => {
        const err = makeAxiosError(400, { message: 'Something went wrong' })
        showApiError(err)
        expect(mockToast).toHaveBeenCalledWith(
            expect.objectContaining({ description: 'Something went wrong', variant: 'destructive' })
        )
    })

    it('shows first field validation error', () => {
        const err = makeAxiosError(400, {
            errors: {
                email: ['This field is required.', 'Must be a valid email.'],
                name: ['Too short.'],
            },
        })
        showApiError(err)
        expect(mockToast).toHaveBeenCalledWith(
            expect.objectContaining({ description: 'This field is required.', variant: 'destructive' })
        )
    })

    it('shows non_field_errors when present', () => {
        const err = makeAxiosError(400, {
            non_field_errors: ['Unable to log in with provided credentials.'],
        })
        showApiError(err)
        expect(mockToast).toHaveBeenCalledWith(
            expect.objectContaining({
                description: 'Unable to log in with provided credentials.',
                variant: 'destructive',
            })
        )
    })

    it('falls back to axios err.message when response body has no known fields', () => {
        // When data is {} the helper reaches the err.message branch (AxiosError always has a message)
        const err = makeAxiosError(500, {})
        showApiError(err)
        expect(mockToast).toHaveBeenCalledWith(
            expect.objectContaining({ title: 'Erro de conex\u00e3o', variant: 'destructive' })
        )
    })

    it('uses fallback message for non-AxiosError, non-Error values', () => {
        // null / plain object / string → last else branch
        showApiError(null as unknown as Error, 'Ocorreu um erro')
        expect(mockToast).toHaveBeenCalledWith(
            expect.objectContaining({ description: 'Ocorreu um erro', variant: 'destructive' })
        )
    })


    it('handles plain Error objects', () => {
        const err = new Error('Network Error')
        showApiError(err)
        expect(mockToast).toHaveBeenCalledWith(
            expect.objectContaining({ description: 'Network Error', variant: 'destructive' })
        )
    })

    it('handles unknown errors with fallback', () => {
        showApiError('unexpected string error', 'Fallback message')
        expect(mockToast).toHaveBeenCalledWith(
            expect.objectContaining({ description: 'Fallback message', variant: 'destructive' })
        )
    })

    it('prioritizes detail over message', () => {
        const err = makeAxiosError(400, {
            detail: 'Detail wins',
            message: 'Message loses',
        })
        showApiError(err)
        expect(mockToast).toHaveBeenCalledWith(
            expect.objectContaining({ description: 'Detail wins' })
        )
    })
})
