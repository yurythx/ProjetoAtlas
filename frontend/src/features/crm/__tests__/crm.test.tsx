import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { KanbanBoard } from '../kanban-board'
import * as useCRMHook from '../use-crm'
import type { Deal, Pipeline } from '../use-crm'

// Mock do hook useCRM
vi.mock('../use-crm', async () => {
  const actual = await vi.importActual('../use-crm')
  return {
    ...actual,
    useCRM: vi.fn(),
  }
})

vi.mock('../quick-transition-modal', () => ({
  QuickTransitionModal: () => null,
}))

describe('KanbanBoard Component', () => {
  type UseCRMReturn = ReturnType<typeof useCRMHook.useCRM>

  const mockPipeline: Pipeline = {
    id: 1,
    name: 'Suporte TI',
    stages: [
      { id: 10, name: 'Novo', order: 10, pipeline: 1 },
      { id: 20, name: 'Planejado', order: 20, pipeline: 1 },
      { id: 30, name: 'Em Andamento', order: 30, pipeline: 1 },
      { id: 40, name: 'Concluído', order: 40, pipeline: 1 },
    ],
  }

  const mockDeals: Deal[] = [
    {
      id: 1,
      uuid: 'deal-1',
      title: 'Servidor Offline',
      contact: 1,
      contact_name: 'Maria Financeiro',
      stage: 10,
      stage_name: 'Novo',
      value: '1500.00',
      priority: 'URGENT',
      owner: 1,
      is_closed: false, record_type: 'incident', sla_status: 'within',
      closing_date: '1970-04-02T10:00:00Z',
      custom_fields: { progress_percentage: 75 },
    },
    {
       id: 2,
       uuid: 'deal-2',
       title: 'Notebook Lento',
       contact: 2,
       contact_name: 'Pedro Marketing',
       stage: 30,
       stage_name: 'Em Andamento',
       value: '300.00',
       priority: 'MEDIUM',
       owner: 1,
       is_closed: false, record_type: 'incident', sla_status: 'within',
       custom_fields: { progress_percentage: 20 },
    }
  ]

  it('deve renderizar as colunas do pipeline corretamente', () => {
    const mockedUseCRM = vi.mocked(useCRMHook.useCRM)
    mockedUseCRM.mockReturnValue({
      updateDeal: { mutateAsync: vi.fn(), isPending: false },
    } as unknown as UseCRMReturn)

    render(<KanbanBoard pipeline={mockPipeline} deals={mockDeals} />)

    expect(screen.getByText('Novo')).toBeInTheDocument()
    expect(screen.getByText('Em Andamento')).toBeInTheDocument()
  })

  it('deve exibir os cards nas colunas corretas', () => {
    const mockedUseCRM = vi.mocked(useCRMHook.useCRM)
    mockedUseCRM.mockReturnValue({
      updateDeal: { mutateAsync: vi.fn(), isPending: false },
    } as unknown as UseCRMReturn)

    render(<KanbanBoard pipeline={mockPipeline} deals={mockDeals} />)

    expect(screen.getByText('Servidor Offline')).toBeInTheDocument()
    expect(screen.getByText('Notebook Lento')).toBeInTheDocument()
  })

  it('deve mostrar a prioridade correta nos cards', () => {
    const mockedUseCRM = vi.mocked(useCRMHook.useCRM)
    mockedUseCRM.mockReturnValue({
      updateDeal: { mutateAsync: vi.fn(), isPending: false },
    } as unknown as UseCRMReturn)

    render(<KanbanBoard pipeline={mockPipeline} deals={mockDeals} />)

    expect(screen.getByText('URGENT')).toBeInTheDocument()
  })

  it('deve mostrar o progresso percentual nos cards', () => {
    const mockedUseCRM = vi.mocked(useCRMHook.useCRM)
    mockedUseCRM.mockReturnValue({
      updateDeal: { mutateAsync: vi.fn(), isPending: false },
    } as unknown as UseCRMReturn)

    render(<KanbanBoard pipeline={mockPipeline} deals={mockDeals} />)

    expect(screen.getAllByText('0%').length).toBeGreaterThan(0)
    expect(screen.getAllByText('67%').length).toBeGreaterThan(0)
  })

  it('deve destacar quando o prazo está vencido', () => {
    const mockedUseCRM = vi.mocked(useCRMHook.useCRM)
    mockedUseCRM.mockReturnValue({
      updateDeal: { mutateAsync: vi.fn(), isPending: false },
    } as unknown as UseCRMReturn)

    render(<KanbanBoard pipeline={mockPipeline} deals={mockDeals} />)

    expect(screen.getAllByText('Vencido').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Crítico').length).toBeGreaterThan(0)
  })
})
