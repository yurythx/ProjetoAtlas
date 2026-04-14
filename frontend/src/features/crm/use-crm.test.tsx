import { renderHook, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { getColumnTransitionGuard, getPipelineColumns, inferColumnSemantics, isDealDone, resolveColumnSemantics, useCRM } from './use-crm'
import { api } from '@/lib/axios'
import React from 'react'

// Mock axios and sonner
vi.mock('@/lib/axios', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
  }
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  }
}))

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe('useCRM', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should fetch pipelines and deals correctly', async () => {
    const mockPipelines = [{ id: 1, name: 'Vendas', stages: [], columns: [] }]
    const mockDeals = [{ id: 1, title: 'Negócio 1', stage: 1, column: 10, column_title: 'Novo' }]
    
    const mockGet = api.get as unknown as ReturnType<typeof vi.fn>
    mockGet.mockImplementation((url: string) => {
      if (url === '/api/crm/pipelines/') return Promise.resolve({ data: mockPipelines })
      if (url === '/api/crm/deals/?omit_legacy_stage_fields=1') return Promise.resolve({ data: mockDeals })
      if (url === '/api/crm/contacts/') return Promise.resolve({ data: [] })
      return Promise.resolve({ data: [] })
    })

    const { result } = renderHook(() => useCRM(), { wrapper: createWrapper() })

    // Initial state
    expect(result.current.isLoading).toBe(true)

    // Wait for data to load
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.pipelines).toEqual(mockPipelines)
    expect(result.current.deals).toEqual(mockDeals)
  })

  it('should update deal optimistically', async () => {
    const { result } = renderHook(() => useCRM(), { wrapper: createWrapper() })
    
    const mockPatch = api.patch as unknown as ReturnType<typeof vi.fn>
    mockPatch.mockResolvedValueOnce({ data: { id: 1, column: 2 } })

    // Call mutation
    result.current.updateDeal.mutate({ id: 1, column: 2 })

    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledWith('/api/crm/deals/1/?omit_legacy_stage_fields=1', { column: 2 })
    })
  })

  it('should publish a manual note update for a deal', async () => {
    const client = new QueryClient()
    client.setQueryData(['crm-deals'], [{
      id: 1,
      uuid: 'deal-1',
      title: 'Deal 1',
      contact: 1,
      contact_name: 'Cliente 1',
      value: '1000',
      priority: 'MEDIUM',
      owner: 1,
      is_closed: false,
      activities: [],
    }])

    const { result } = renderHook(() => useCRM(), {
      wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
    })

    vi.mocked(api.post).mockResolvedValueOnce({
      data: {
        id: 1,
        uuid: 'deal-1',
        title: 'Deal 1',
        contact: 1,
        contact_name: 'Cliente 1',
        value: '1000',
        priority: 'MEDIUM',
        owner: 1,
        is_closed: false,
        activities: [
          {
            id: 50,
            activity_type: 'note',
            description: 'Cliente pediu retorno amanhã cedo.',
            actor_name: 'tecnico',
            created_at: '2026-04-04T12:00:00Z',
          },
        ],
      },
    } as unknown)

    await result.current.addDealNote.mutateAsync({
      dealId: 1,
      description: 'Cliente pediu retorno amanhã cedo.',
    })

    expect(api.post).toHaveBeenCalledWith('/api/crm/deals/1/notes/', {
      description: 'Cliente pediu retorno amanhã cedo.',
    })
  })

  it('should infer semantic defaults for fallback pipeline columns', () => {
    const columns = getPipelineColumns({
      id: 1,
      name: 'Operação',
      stages: [
        { id: 10, pipeline: 1, name: 'Planejados', order: 1 },
        { id: 20, pipeline: 1, name: 'Concluído', order: 2 },
      ],
    })

    expect(columns[0]).toMatchObject({
      title: 'Planejados',
      column_kind: 'planned',
      requires_schedule: true,
      requires_assignee: true,
    })
    expect(columns[1]).toMatchObject({
      title: 'Concluído',
      column_kind: 'done',
      marks_done: true,
    })
  })

  it('should keep renamed done columns as completed when metadata is present', () => {
    const result = isDealDone({
      id: 1,
      title: 'Ticket finalizado',
      contact: 1,
      contact_name: 'Cliente',
      column: 99,
      column_title: 'Finalizados do Sprint',
      column_data: {
        id: 99,
        pipeline: 1,
        title: 'Finalizados do Sprint',
        order: 4,
        color: '#22C55E',
        column_kind: 'done',
        marks_done: true,
        value_stream_phase: 'demand',
      },
      value: '0',
      priority: 'MEDIUM',
      owner: 1,
      is_closed: false,
    })

    expect(result).toBe(true)
  })

  it('should respect explicit planned metadata even when column title changes', () => {
    expect(
      resolveColumnSemantics({
        title: 'Fila de Agenda',
        column_kind: 'planned',
        requires_schedule: true,
        requires_assignee: true,
      })
    ).toMatchObject({
      column_kind: 'planned',
      requires_schedule: true,
      requires_assignee: true,
    })

    expect(inferColumnSemantics('Fila de Agenda')).toMatchObject({
      column_kind: 'custom',
      requires_schedule: false,
      requires_assignee: false,
    })
  })

  it('should block move when target column does not accept the current source', () => {
    const guard = getColumnTransitionGuard(
      {
        id: 1,
        title: 'Servidor',
        contact: 1,
        contact_name: 'Cliente',
        column: 10,
        column_title: 'Em Andamento',
        value: '0',
        priority: 'MEDIUM',
        owner: 1,
      },
      {
        id: 20,
        pipeline: 1,
        title: 'Concluído',
        order: 2,
        color: '#22C55E',
        allowed_source_columns: [15],
        value_stream_phase: 'demand',
      },
      []
    )

    expect(guard.allowed).toBe(false)
    expect(guard.reason).toContain('não aceita')
  })

  it('should block move when target column reaches wip limit', () => {
    const guard = getColumnTransitionGuard(
      {
        id: 1,
        title: 'Servidor',
        contact: 1,
        contact_name: 'Cliente',
        column: 10,
        column_title: 'Em Andamento',
        value: '0',
        priority: 'MEDIUM',
        owner: 1,
      },
      {
        id: 20,
        pipeline: 1,
        title: 'Fila crítica',
        order: 2,
        color: '#F97316',
        wip_limit: 1,
        value_stream_phase: 'demand',
      },
      [
        {
          id: 2,
          title: 'Outro',
          contact: 1,
          contact_name: 'Cliente',
          column: 20,
          value: '0',
          priority: 'LOW',
          owner: 1,
        },
      ]
    )

    expect(guard.allowed).toBe(false)
    expect(guard.reason).toContain('limite WIP')
  })

  it('should explain allowed origins when transition is blocked', () => {
    const guard = getColumnTransitionGuard(
      {
        id: 1,
        title: 'Servidor',
        contact: 1,
        contact_name: 'Cliente',
        column: 10,
        column_title: 'Em Andamento',
        value: '0',
        priority: 'MEDIUM',
        owner: 1,
      },
      {
        id: 20,
        pipeline: 1,
        title: 'Concluído',
        order: 2,
        color: '#22C55E',
        allowed_source_columns: [15],
        value_stream_phase: 'demand',
      },
      [],
      [
        {
          id: 1,
          name: 'Operação',
          stages: [],
          columns: [
            {
              id: 10,
              pipeline: 1,
              title: 'Em Andamento',
              order: 1,
              color: '#F59E0B',
              value_stream_phase: 'demand',
            },
            {
              id: 15,
              pipeline: 1,
              title: 'Planejados',
              order: 2,
              color: '#8B5CF6',
              value_stream_phase: 'demand',
            },
          ],
        },
      ]
    )

    expect(guard.allowed).toBe(false)
    expect(guard.reason).toContain('Em Andamento')
    expect(guard.reason).toContain('Planejados')
  })
})
