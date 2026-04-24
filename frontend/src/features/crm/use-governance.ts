"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/axios"
import { toast } from "sonner"

// --- Types ---

export interface SLAPolicy {
  id: number
  name: string
  description?: string
  target_response_minutes: number
  target_resolution_minutes: number
  business_hours_only: boolean
}

export interface ServiceCategory {
  id: number
  name: string
  description?: string
  icon?: string
}

export interface ServiceDefinition {
  id: number
  category: number
  name: string
  description?: string
  is_active: boolean
}

export interface ServiceItem {
  id: number
  definition: number
  name: string
  description?: string
  record_type: "incident" | "service_request" | "problem" | "change"
  default_sla_policy?: number
  estimated_cost: number
  is_active: boolean
  approval_required: boolean
}

// --- Hook ---

export function useGovernance() {
  const queryClient = useQueryClient()

  // Queries
  const { data: slaPolicies = [], isLoading: isLoadingSLA } = useQuery<SLAPolicy[]>({
    queryKey: ["crm-sla-policies"],
    queryFn: async () => {
      const res = await api.get("/api/crm/sla-policies/")
      return res.data?.results || res.data || []
    }
  })

  const { data: serviceCategories = [], isLoading: isLoadingCategories } = useQuery<ServiceCategory[]>({
    queryKey: ["service-catalog-categories"],
    queryFn: async () => {
      const res = await api.get("/api/service-catalog/categories/")
      return res.data?.results || res.data || []
    }
  })

  const { data: serviceItems = [], isLoading: isLoadingItems } = useQuery<ServiceItem[]>({
    queryKey: ["service-catalog-items"],
    queryFn: async () => {
      const res = await api.get("/api/service-catalog/items/")
      return res.data?.results || res.data || []
    }
  })

  const { data: serviceDefinitions = [], isLoading: isLoadingDefinitions } = useQuery<ServiceDefinition[]>({
    queryKey: ["service-catalog-definitions"],
    queryFn: async () => {
      const res = await api.get("/api/service-catalog/definitions/")
      return res.data?.results || res.data || []
    }
  })

  // Mutations - SLA
  const createSLAPolicy = useMutation({
    mutationFn: (data: Partial<SLAPolicy>) => api.post("/api/crm/sla-policies/", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-sla-policies"] })
      toast.success("Política de SLA criada com sucesso!")
    },
    onError: () => toast.error("Erro ao criar política de SLA.")
  })

  // Mutations - Catalog
  const createServiceItem = useMutation({
    mutationFn: (data: Partial<ServiceItem>) => api.post("/api/service-catalog/items/", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["service-catalog-items"] })
      toast.success("Item de serviço criado!")
    },
    onError: () => toast.error("Erro ao criar item de serviço.")
  })

  return {
    slaPolicies,
    serviceCategories,
    serviceDefinitions,
    serviceItems,
    isLoading: isLoadingSLA || isLoadingCategories || isLoadingItems || isLoadingDefinitions,
    createSLAPolicy,
    createServiceItem
  }
}
