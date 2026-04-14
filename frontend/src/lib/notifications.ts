import { toast } from "sonner"

/**
 * Utilitário centralizado para notificações (Toasts).
 * Garante que todas as mensagens sigam o padrão i18n e visual premium.
 */
export const notify = {
    success: (message: string, description?: string) => {
        toast.success(message, {
            description,
        })
    },

    error: (message: string, error?: unknown) => {
        // Trata erros comuns de API se necessário
        const description = (() => {
            if (typeof error === 'object' && error !== null) {
                const err = error as { response?: { data?: { detail?: string } }; message?: string }
                return err.response?.data?.detail || err.message || "Ocorreu um erro inesperado."
            }
            return "Ocorreu um erro inesperado."
        })()

        toast.error(message, {
            description,
        })
    },

    info: (message: string, description?: string) => {
        toast.info(message, {
            description,
        })
    },

    warning: (message: string, description?: string) => {
        toast.warning(message, {
            description,
        })
    },

    promise: (promise: Promise<unknown>, messages: { loading: string; success: string; error: string }) => {
        return toast.promise(promise, {
            loading: messages.loading,
            success: messages.success,
            error: messages.error,
        })
    }
}
