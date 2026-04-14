"use client"

import { Skeleton } from "@/components/ui/skeleton"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/axios"
import { Module, TenantModule } from "@/types"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { Box } from "lucide-react"

export function ModuleList() {
  const queryClient = useQueryClient()

  // 1. Busca todos os módulos disponíveis (resposta paginada)
  const { data: allModulesData, isLoading: isLoadingAll } = useQuery({
    queryKey: ['modules'],
    queryFn: async ({ signal }) => {
      // Bug M1: backend retorna { count, results } — não um array plano
      const res = await api.get<{ results: Module[] } | Module[]>('/api/modules/available/', { signal })
      const data = res.data
      return Array.isArray(data) ? data : (data as { results: Module[] }).results || []
    },
    retry: 1,
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  })
  const allModules: Module[] = allModulesData ?? []

  // 2. Busca módulos ativos para o tenant (resposta paginada ou lista)
  const { data: tenantModulesData, isLoading: isLoadingTenant } = useQuery({
    queryKey: ['my-modules'],
    queryFn: async ({ signal }) => {
      const res = await api.get<{ results: TenantModule[] } | TenantModule[]>('/api/modules/my-modules/', { signal })
      const data = res.data
      return Array.isArray(data) ? data : (data as { results: TenantModule[] }).results || []
    },
    retry: 1,
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  })
  const tenantModules: TenantModule[] = tenantModulesData ?? []

  // 3. Toggle Mutation
  const toggleMutation = useMutation({
    mutationFn: async ({ moduleId, code, name, isActive }: { moduleId: number, code: string, name: string, isActive: boolean }) => {
      if (isActive) {
        await api.post('/api/modules/my-modules/activate/', { module_code: code })
      } else {
        // Bug M2: encontra o TenantModule pelo module ID (não pelo code)
        // Correção: Agora verifica se o módulo existe e se está ativo na lista do tenant
        const tm = tenantModules.find(tm => tm.module === moduleId) || tenantModules.find(tm => tm.module_code === code)
        if (!tm) {
          // Se não existir, tenta criar inativo ou ativar primeiro
          // Mas como estamos desativando, deve existir. Se não, erro.
          throw new Error(`Módulo "${name}" não encontrado na lista do tenant.`)
        }
        await api.patch(`/api/modules/my-modules/${tm.id}/`, { is_active: false })
      }
      return { name, isActive }
    },
    onSuccess: async ({ name, isActive }) => {
      // MM2: invalida ambas as queries para garantir sincronismo
      await queryClient.invalidateQueries({ queryKey: ['my-modules'] })
      await queryClient.invalidateQueries({ queryKey: ['modules'] })
      
      // Forçar atualização da sidebar disparando evento customizado ou atualizando contexto
      // Como o useModules usa o mesmo queryKey ['my-modules'], ele deve atualizar automaticamente
      // se estiver usando o mesmo queryClient.
      
      // MM1: toast com nome do módulo
      toast.success(isActive ? `Módulo "${name}" ativado` : `Módulo "${name}" desativado`)
    },
    onError: (err: unknown) => {
      const message =
        typeof err === 'object' && err !== null && 'message' in err && typeof (err as { message?: unknown }).message === 'string'
          ? (err as { message: string }).message
          : "Falha ao atualizar módulo"
      toast.error(message)
    }
  })

  if (isLoadingAll || isLoadingTenant) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3" role="status" aria-live="polite" aria-label="Carregando módulos disponíveis">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-xl border bg-card text-card-foreground shadow-sm h-32 p-6 flex flex-col justify-between">
            <div className="flex justify-between items-center">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-6 w-12 rounded-full" />
            </div>
            <div className="flex items-center gap-3">
              <Skeleton className="h-4 w-4" />
              <Skeleton className="h-4 w-full" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {(Array.isArray(allModules) ? allModules : []).map((module: Module) => {
        // Check if active
        const activeList = Array.isArray(tenantModules) ? tenantModules : []
        const isActive = activeList.some((tm: TenantModule) => tm.module === module.id && tm.is_active)

        return (
          <Card key={module.code} className={isActive ? "border-primary" : ""}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-base font-medium">
                {module.name}
              </CardTitle>
                <div className="flex items-center gap-2">
                  {module.is_default ? (
                    <Badge variant="secondary">Padrão</Badge>
                  ) : null}
                  <Switch
                    checked={isActive}
                    onCheckedChange={(checked) =>
                      toggleMutation.mutate({ moduleId: module.id, code: module.code, name: module.name, isActive: checked })
                    }
                    disabled={toggleMutation.isPending}
                    aria-label={`${isActive ? 'Desativar' : 'Ativar'} módulo ${module.name}`}
                  />
                </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center space-x-4 text-sm text-muted-foreground mt-2">
                <Box className="w-4 h-4" aria-hidden="true" />
                <span>{module.description}</span>
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
