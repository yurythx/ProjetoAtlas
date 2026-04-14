import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"

import { CRMPipelineOverview } from "../crm-pipeline-overview"
import type { Deal, Pipeline } from "../use-crm"

const mockPipeline: Pipeline = {
  id: 1,
  name: "Suporte Técnico TI",
  stages: [
    { id: 10, pipeline: 1, name: "Novo", order: 1 },
    { id: 20, pipeline: 1, name: "Em Andamento", order: 2 },
    { id: 30, pipeline: 1, name: "Concluído", order: 3 },
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
    uuid: "deal-3",
    title: "Fechado",
    contact: 3,
    contact_name: "Ana RH",
    stage: 30,
    stage_name: "Concluído",
    value: "200.00",
    priority: "MEDIUM",
    owner: 7,
    is_closed: true, record_type: 'incident', sla_status: 'within',
    custom_fields: { progress_percentage: 100 },
  },
]

describe("CRMPipelineOverview", () => {
  it("renderiza o resumo global e por coluna do pipeline", () => {
    render(<CRMPipelineOverview pipeline={mockPipeline} deals={mockDeals} />)

    expect(screen.getByText("Resumo do pipeline")).toBeInTheDocument()
    expect(screen.getByText("Suporte Técnico TI")).toBeInTheDocument()
    expect(screen.getByText("3 cards")).toBeInTheDocument()
    expect(screen.getByText((content) => content.includes("R$") && content.includes("2.000,00"))).toBeInTheDocument()
    expect(screen.getByText((content) => content.replace(/\s/g, "") === "68%")).toBeInTheDocument()
    expect(screen.getByText("Novo")).toBeInTheDocument()
    expect(screen.getByText("Em Andamento")).toBeInTheDocument()
    expect(screen.getByText("Concluído")).toBeInTheDocument()
    expect(screen.getAllByText("1 card").length).toBeGreaterThan(0)
  })

  it("prioriza overview.columns quando disponível", () => {
    render(
      <CRMPipelineOverview
        pipeline={mockPipeline}
        deals={mockDeals}
        overview={{
          pipeline_id: 1,
          pipeline_name: "Suporte Técnico TI",
          summary: {
            total_deals: 3,
            total_value: "2000.00",
            overdue: 1,
            at_risk: 0,
            done: 1,
            average_progress: 68,
          },
          stages: [],
          columns: [
            {
              column_id: 10,
              column_title: "Novo",
              name: "Novo legado",
              total_deals: 1,
              overdue: 1,
              average_progress: 25,
            },
          ],
        }}
      />
    )

    expect(screen.getByText("Novo")).toBeInTheDocument()
    expect(screen.queryByText("Novo legado")).not.toBeInTheDocument()
  })
})
