import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

import { DealDetailsModal } from "../deal-details-modal"
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

if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
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

describe("DealDetailsModal", () => {
  const mockUpdateDeal = { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }
  const mockAddDealNote = { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }
  const mockAddDealAttachment = { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }
  const mockDeleteDealAttachment = { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }
  const mockPipeline: Pipeline = {
    id: 1,
    name: "Operação",
    stages: [],
    columns: [
      {
        id: 10,
        pipeline: 1,
        title: "Planejada",
        order: 1,
        color: "#8B5CF6",
        column_kind: "planned",
        requires_schedule: true,
        requires_assignee: true, value_stream_phase: 'demand' },
      {
        id: 20,
        pipeline: 1,
        title: "Em Andamento",
        order: 2,
        color: "#F59E0B",
        column_kind: "active", value_stream_phase: 'demand' },
    ],
  }

  const mockDeal: Deal = {
    id: 1,
    uuid: "deal-1",
    title: "Implantação ERP",
    description: "Plano inicial da implantação.",
    contact: 1,
    contact_name: "Cliente XPTO",
    column: 20,
    column_title: "Em Andamento",
    column_data: mockPipeline.columns?.[1],
    value: "5000",
    priority: "HIGH",
    owner: 7,
    is_closed: false, record_type: 'incident', sla_status: 'within',
    custom_fields: { progress_percentage: 60 },
    activities: [
      {
        id: 104,
        activity_type: "note",
        description: "Cliente confirmou a janela de manutenção para amanhã.",
        actor_name: "Ana Silva",
        created_at: "2026-04-04T12:00:00Z",
      },
      {
        id: 103,
        activity_type: "column_change",
        description: "Card movido da coluna Planejada para Em Andamento.",
        actor_name: "Ana Silva",
        created_at: "2026-04-04T11:00:00Z",
      },
      {
        id: 102,
        activity_type: "note",
        description: "Aguardando liberação do acesso remoto.",
        actor_name: "Paulo Souza",
        created_at: "2026-04-04T10:00:00Z",
      },
      {
        id: 101,
        activity_type: "creation",
        description: "Card criado na coluna Planejada.",
        actor_name: "Ana Silva",
        created_at: "2026-04-04T09:00:00Z",
      },
    ],
  }

  beforeEach(async () => {
    vi.clearAllMocks()

    vi.mocked(useCRMHook.useCRM).mockReturnValue({
      deals: [mockDeal],
      pipelines: [mockPipeline],
      updateDeal: mockUpdateDeal,
      addDealNote: mockAddDealNote,
      addDealAttachment: mockAddDealAttachment,
      deleteDealAttachment: mockDeleteDealAttachment,
    } as never)

    const reactQuery = await import("@tanstack/react-query")
    vi.mocked(reactQuery.useQuery).mockReturnValue({
      data: [
        { id: 7, username: "ana", first_name: "Ana", last_name: "Silva", email: "ana@empresa.com" },
      ],
    } as never)
  })

  it("destaca o ultimo update manual e resume os filtros do historico", async () => {
    const user = userEvent.setup()
    const queryClient = new QueryClient()
    render(
      <QueryClientProvider client={queryClient}>
        <DealDetailsModal deal={mockDeal} open onOpenChange={vi.fn()} />
      </QueryClientProvider>
    )

    await user.click(screen.getByRole("tab", { name: /Visão geral/i }))
    await waitFor(() => expect(screen.getByText("Último update manual")).toBeInTheDocument())
    expect(screen.getByText("Último update manual")).toBeInTheDocument()
    expect(screen.getAllByText("Cliente confirmou a janela de manutenção para amanhã.").length).toBeGreaterThan(0)

    await user.click(screen.getByRole("tab", { name: /Histórico/i }))
    expect(screen.getByRole("button", { name: "Updates (2)" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Movimentações (1)" })).toBeInTheDocument()
    expect(screen.getByText("Exibindo 4 registros para o filtro selecionado.")).toBeInTheDocument()
  })

  it("filtra o historico por tipo de atividade e mostra estado vazio quando necessario", async () => {
    const user = userEvent.setup()

    const queryClient = new QueryClient()
    render(
      <QueryClientProvider client={queryClient}>
        <DealDetailsModal deal={mockDeal} open onOpenChange={vi.fn()} />
      </QueryClientProvider>
    )

    await user.click(screen.getByRole("tab", { name: /Histórico/i }))
    await user.click(screen.getByRole("button", { name: "Movimentações (1)" }))

    expect(screen.getByText("Exibindo 1 registro para o filtro selecionado.")).toBeInTheDocument()
    expect(screen.getByText("Card movido da coluna Planejada para Em Andamento.")).toBeInTheDocument()
    expect(screen.queryByText("Card criado na coluna Planejada.")).not.toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Automação (0)" }))

    expect(screen.getByText("Exibindo 0 registros para o filtro selecionado.")).toBeInTheDocument()
    expect(screen.getByText("Nenhuma atividade encontrada para o filtro atual.")).toBeInTheDocument()
  })
})
