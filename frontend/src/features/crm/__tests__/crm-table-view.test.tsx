import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { SortingState, VisibilityState } from "@tanstack/react-table"

import { CRMTableView } from "../crm-table-view"
import * as useCRMHook from "../use-crm"
import type { Deal, Pipeline } from "../use-crm"

if (!HTMLElement.prototype.hasPointerCapture) {
  HTMLElement.prototype.hasPointerCapture = () => false
}

if (!HTMLElement.prototype.setPointerCapture) {
  HTMLElement.prototype.setPointerCapture = () => {}
}

if (!HTMLElement.prototype.releasePointerCapture) {
  HTMLElement.prototype.releasePointerCapture = () => {}
}

if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {}
}

vi.mock("../use-crm", async () => {
  const actual = await vi.importActual("../use-crm")
  return {
    ...actual,
    useCRM: vi.fn(),
  }
})

vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual("@tanstack/react-query")
  return {
    ...actual,
    useQuery: vi.fn(),
  }
})

vi.mock("../deal-details-modal", () => ({
  DealDetailsModal: ({ deal, open }: { deal: Deal; open: boolean }) =>
    open ? <div>Detalhes do card: {deal.title}</div> : null,
}))

describe("CRMTableView", () => {
  const mockUpdateDeal = { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }
  const mockPipeline: Pipeline = {
    id: 1,
    name: "Suporte TI",
    description: "Pipeline principal",
    stages: [
      { id: 10, name: "Novo", order: 1, pipeline: 1 },
      { id: 20, name: "Em Andamento", order: 2, pipeline: 1 },
    ],
  }

  const mockDeals: Deal[] = [
    {
      id: 1,
      uuid: "deal-1",
      title: "Servidor Offline",
      contact: 1,
      contact_name: "Maria Financeiro",
      stage: 10,
      stage_name: "Novo",
      value: "1500.00",
      priority: "URGENT",
      owner: 7,
      is_closed: false, record_type: 'incident', sla_status: 'within',
      closing_date: "1970-04-03T10:00:00Z",
      custom_fields: { progress_percentage: 25 },
    },
    {
      id: 2,
      uuid: "deal-2",
      title: "Notebook Lento",
      contact: 2,
      contact_name: "Pedro Marketing",
      stage: 20,
      stage_name: "Em Andamento",
      value: "300.00",
      priority: "LOW",
      owner: 8,
      is_closed: false, record_type: 'incident', sla_status: 'within',
      custom_fields: { progress_percentage: 80 },
    },
    {
      id: 3,
      uuid: "deal-2",
      title: "Troca de Monitor",
      contact: 2,
      contact_name: "Pedro Marketing",
      stage: 999,
      stage_name: "Arquivado",
      value: "300.00",
      priority: "LOW",
      owner: 8,
      is_closed: false, record_type: 'incident', sla_status: 'within',
    },
  ]

  const sorting: SortingState = []
  const columnVisibility: VisibilityState = {}

  const baseTableProps = {
    pipeline: mockPipeline,
    deals: mockDeals,
    isLoading: false,
    sorting,
    columnVisibility,
    onSortingChange: vi.fn(),
    onColumnVisibilityChange: vi.fn(),
  }

  beforeEach(async () => {
    vi.clearAllMocks()
    mockUpdateDeal.mutateAsync.mockResolvedValue(undefined)

    const mockedUseCRM = vi.mocked(useCRMHook.useCRM)
    mockedUseCRM.mockReturnValue({
      deals: mockDeals,
      pipelines: [mockPipeline],
      contacts: [],
      isLoading: false,
      createDeal: { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false },
      updateDeal: mockUpdateDeal,
    } as never)

    const reactQuery = await import("@tanstack/react-query")
    vi.mocked(reactQuery.useQuery).mockReturnValue({
      data: [
        { id: 7, username: "tecnico", first_name: "Ana", last_name: "Silva", email: "ana@empresa.com" },
        { id: 8, username: "suporte", first_name: "Paulo", last_name: "Souza", email: "paulo@empresa.com" },
      ],
    } as never)
  })

  it("renderiza a tabela com os cards recebidos pelos filtros globais", () => {
    const pipelineDeals = mockDeals.slice(0, 2)
    render(<CRMTableView {...baseTableProps} deals={pipelineDeals} />)

    expect(screen.getByText("Tabela Operacional")).toBeInTheDocument()
    expect(screen.getByText("Servidor Offline")).toBeInTheDocument()
    expect(screen.getByText("Notebook Lento")).toBeInTheDocument()
    expect(screen.queryByText("Troca de Monitor")).not.toBeInTheDocument()
  })

  it("abre o painel do card ao clicar na linha da tabela", async () => {
    const user = userEvent.setup()
    const pipelineDeals = mockDeals.slice(0, 2)

    render(<CRMTableView {...baseTableProps} deals={pipelineDeals} />)

    await user.click(screen.getByText("Servidor Offline"))

    expect(screen.getByText("Detalhes do card: Servidor Offline")).toBeInTheDocument()
  })

  it("permite ordenar pela coluna de Progresso", async () => {
    const user = userEvent.setup()
    const pipelineDeals = mockDeals.slice(0, 2)

    render(<CRMTableView {...baseTableProps} deals={pipelineDeals} />)

    await user.click(screen.getByRole("button", { name: "Ordenar por Progresso" }))
    await user.click(screen.getByRole("button", { name: "Ordenar por Progresso" }))

    const rows = screen.getAllByRole("row")
    expect(rows.length).toBeGreaterThan(2)
  })
})
