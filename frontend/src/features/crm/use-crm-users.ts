"use client"

import { useQuery } from "@tanstack/react-query"

import { api } from "@/lib/axios"

import { normalizeListResponse } from "./crm-utils"

export type CRMUser = {
  id: number
  username: string
  first_name?: string
  last_name?: string
  email?: string
  avatar_url?: string | null
  is_online?: boolean
  is_staff?: boolean
  status?: "online" | "busy" | "offline"
}

export function useCRMUsers(enabled = true) {
  return useQuery({
    queryKey: ["crm-users"],
    enabled,
    queryFn: async () => {
      const response = await api.get<CRMUser[] | { results?: CRMUser[] }>("/api/accounts/users/")
      return normalizeListResponse(response.data)
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  })
}

