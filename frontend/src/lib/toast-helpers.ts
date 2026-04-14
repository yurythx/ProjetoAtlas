import { toast } from '@/hooks/use-toast'
import { AxiosError } from 'axios'

interface ApiError {
    message?: string
    detail?: string
    errors?: Record<string, string[]>
    non_field_errors?: string[]
}

/**
 * Helper to display API errors in toast notifications
 * Handles Axios errors and extracts meaningful messages
 */
export function showApiError(err: unknown, fallbackMessage = 'Ocorreu um erro') {
    if (err instanceof AxiosError) {
        const data = err.response?.data
        const apiErr = data as ApiError | undefined

        // Priority: detail > message > errors > non_field_errors > fallback
        if (apiErr?.detail) {
            toast({
                title: 'Erro',
                description: apiErr.detail,
                variant: 'destructive',
            })
        } else if (apiErr?.message) {
            toast({
                title: 'Erro',
                description: apiErr.message,
                variant: 'destructive',
            })
        } else if (apiErr?.errors) {
            // Handle validation errors (field-level)
            const firstField = Object.keys(apiErr.errors)[0]
            const firstError = apiErr.errors[firstField]?.[0]
            toast({
                title: 'Erro de validação',
                description: firstError || fallbackMessage,
                variant: 'destructive',
            })
        } else if (data && typeof data === 'object' && !Array.isArray(data)) {
            const entries = Object.entries(data as Record<string, unknown>)
            const firstFieldError = entries.find(([, v]) => Array.isArray(v) && typeof v[0] === 'string')
            if (firstFieldError) {
                const [field, msgs] = firstFieldError as [string, string[]]
                toast({
                    title: 'Erro de validação',
                    description: msgs[0] || `${field}: ${fallbackMessage}`,
                    variant: 'destructive',
                })
            } else if (err.message) {
                toast({
                    title: 'Erro de conexão',
                    description: err.message,
                    variant: 'destructive',
                })
            } else {
                toast({
                    title: 'Erro',
                    description: fallbackMessage,
                    variant: 'destructive',
                })
            }
        } else if (apiErr?.non_field_errors) {
            toast({
                title: 'Erro',
                description: apiErr.non_field_errors[0] || fallbackMessage,
                variant: 'destructive',
            })
        } else if (err.message) {
            toast({
                title: 'Erro de conexão',
                description: err.message,
                variant: 'destructive',
            })
        } else {
            toast({
                title: 'Erro',
                description: fallbackMessage,
                variant: 'destructive',
            })
        }
    } else if (err instanceof Error) {
        toast({
            title: 'Erro',
            description: err.message,
            variant: 'destructive',
        })
    } else {
        toast({
            title: 'Erro',
            description: fallbackMessage,
            variant: 'destructive',
        })
    }

    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.error('API Error:', err)
    }
}

/**
 * Toast helper functions with consistent styling
 */
export const toastHelpers = {
    success: (message: string, description?: string) => {
        toast({
            title: message,
            description,
            variant: 'default',
        })
    },

    error: (message: string, description?: string) => {
        toast({
            title: message,
            description,
            variant: 'destructive',
        })
    },

    apiError: showApiError,
}
