import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/axios"
import { toast } from "sonner"
import { showApiError } from "@/lib/toast-helpers"

export interface Transaction {
  id: number
  description: string
  amount: string
  type: 'in' | 'out'
  status: 'pending' | 'paid' | 'overdue' | 'cancelled'
  category?: number
  category_details?: {
    id: number
    name: string
    color: string
  }
  due_date: string
  payment_date?: string
  competence_date: string
  linked_event?: string
  created_by?: number
}

export interface FinanceCategory {
  id: number
  name: string
  color: string
  is_shared?: boolean
  created_by?: number | null
}

export interface FinanceRange {
  start?: string
  end?: string
}

type Paginated<T> = { results?: T[] }

function normalizeList<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[]
  if (value && typeof value === 'object') {
    const v = value as Paginated<T>
    if (Array.isArray(v.results)) return v.results
  }
  return []
}

export function useFinance(range?: FinanceRange) {
  const queryClient = useQueryClient()

  // Fetch Transactions
  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ['finance-transactions', range?.start ?? null, range?.end ?? null],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (range?.start) params.set('start', range.start)
      if (range?.end) params.set('end', range.end)
      const qs = params.toString()
      try {
        const response = await api.get<Transaction[] | Paginated<Transaction>>(`/api/finance/transactions/${qs ? `?${qs}` : ''}`)
        return normalizeList<Transaction>(response.data)
      } catch {
        return []
      }
    }
  })

  // Fetch Categories
  const { data: categories = [] } = useQuery({
    queryKey: ['finance-categories'],
    queryFn: async () => {
      try {
        const response = await api.get<FinanceCategory[] | Paginated<FinanceCategory>>('/api/finance/categories/')
        return normalizeList<FinanceCategory>(response.data)
      } catch {
        return []
      }
    }
  })

  const createCategory = useMutation({
    mutationFn: async (payload: Pick<FinanceCategory, "name" | "color"> & { description?: string }) => {
      const response = await api.post<FinanceCategory>('/api/finance/categories/', {
        ...payload,
        name: payload.name.trim(),
      })
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance-categories'] })
      toast.success("Categoria criada com sucesso!")
    },
    onError: (err) => showApiError(err, "Erro ao criar categoria.")
  })

  // Create Transaction
  const createTransaction = useMutation({
    mutationFn: async (newTransaction: Partial<Transaction>) => {
      const response = await api.post('/api/finance/transactions/', newTransaction)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance-transactions'] })
      toast.success("Transação criada com sucesso!")
    },
    onError: (error) => {
      console.error(error)
      toast.error("Erro ao criar transação.")
    }
  })

  // Update Transaction
  const updateTransaction = useMutation({
    mutationFn: async ({ id, ...data }: Partial<Transaction> & { id: number }) => {
      const response = await api.patch(`/api/finance/transactions/${id}/`, data)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance-transactions'] })
      toast.success("Transação atualizada!")
    },
    onError: () => toast.error("Erro ao atualizar transação.")
  })

  // Delete Transaction
  const deleteTransaction = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/api/finance/transactions/${id}/`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance-transactions'] })
      toast.success("Transação removida!")
    },
    onError: () => toast.error("Erro ao remover transação.")
  })

  return {
    transactions,
    categories,
    isLoading,
    createCategory,
    createTransaction,
    updateTransaction,
    deleteTransaction
  }
}
