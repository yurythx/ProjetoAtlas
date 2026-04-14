import type { QueryClient } from "@tanstack/react-query"
import { api } from "@/lib/axios"
import type { Conversation } from "@/types/messenger"

export const conversationsQueryKey = ["conversations"] as const
export const deletedConversationsQueryKey = ["conversations-deleted"] as const
export const archivedConversationsQueryKey = ["conversations-archived"] as const

export const upsertConversation = (list: Conversation[], conv: Conversation) => {
  const idx = list.findIndex((c) => c.id === conv.id)
  if (idx === -1) return [conv, ...list]
  const next = [...list]
  next[idx] = { ...next[idx], ...conv }
  return next
}

export const removeConversation = (list: Conversation[], convId: number) => list.filter((c) => c.id !== convId)

export const updateConversation = (
  list: Conversation[],
  convId: number,
  updater: (c: Conversation) => Conversation,
) => {
  const idx = list.findIndex((c) => c.id === convId)
  if (idx === -1) return list
  const next = [...list]
  next[idx] = updater(next[idx])
  return next
}

export const updateConversationsCache = (queryClient: QueryClient, updater: (list: Conversation[]) => Conversation[]) => {
  queryClient.setQueryData<Conversation[]>(conversationsQueryKey, (old) => {
    const list = Array.isArray(old) ? old : []
    return updater(list)
  })
}

export const updateDeletedCache = (queryClient: QueryClient, updater: (list: Conversation[]) => Conversation[]) => {
  queryClient.setQueryData<Conversation[]>(deletedConversationsQueryKey, (old) => {
    const list = Array.isArray(old) ? old : []
    return updater(list)
  })
}

export const updateArchivedCache = (queryClient: QueryClient, updater: (list: Conversation[]) => Conversation[]) => {
  queryClient.setQueryData<Conversation[]>(archivedConversationsQueryKey, (old) => {
    const list = Array.isArray(old) ? old : []
    return updater(list)
  })
}

export const fetchAndUpsertConversation = async (queryClient: QueryClient, convId: number) => {
  const res = await api.get<Conversation>(`/api/messenger/conversations/${convId}/`)
  updateConversationsCache(queryClient, (list) => upsertConversation(list, res.data))
  return res.data
}
