import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/axios'
import { TenantModule } from '@/types'
import { ensureHasSessionCookie } from '@/lib/session'

export function useModules() {
    const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null

    const { data: rawData, isLoading, error } = useQuery<TenantModule[] | { results: TenantModule[] }>({
        queryKey: ['my-modules'],
        queryFn: async () => {
      ensureHasSessionCookie()
            const res = await api.get<TenantModule[] | { results: TenantModule[] }>('/api/modules/my-modules/')
            return res.data
        },
        staleTime: 30_000, // Reduzido de 5min para 30s para atualizar mais rápido em interações
    retry: 1,
    enabled: !!token,
    })

    // Extract modules array safely
    const modules: TenantModule[] = Array.isArray(rawData)
        ? rawData
        : (rawData && typeof rawData === 'object' && Array.isArray(rawData.results))
            ? rawData.results
            : []

    /**
     * Helper to check if a module is active by its code
     */
    const isModuleActive = (moduleCode: string): boolean => {
        if (isLoading) return true
        if (error) return true
        if (!modules || modules.length === 0) return true

        return modules.some((tm: TenantModule) =>
            tm && tm.is_active === true && tm.module_code === moduleCode
        )
    }

    return {
        modules,
        isLoading,
        isModuleActive,
        error
    }
}
