import { describe, it, expect, vi, beforeEach } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import { within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import React from "react"

import { RoleForm } from "./role-form"
import { api } from "@/lib/axios"

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

vi.mock("@/lib/axios", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  },
}))

vi.mock("@/lib/notifications", () => ({
  notify: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock("@/components/ui/checkbox", () => ({
  Checkbox: ({ checked }: { checked?: boolean }) => (
    <div role="checkbox" data-state={checked ? "checked" : "unchecked"} aria-checked={checked ? "true" : "false"} />
  ),
}))

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe("RoleForm", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("marca e desmarca permissões ao clicar na linha", async () => {
    const user = userEvent.setup()
    vi.mocked(api.get).mockResolvedValueOnce({
      data: [
        { id: "crm.deal_view", label: "Visualizar CRM", description: "Visualizar CRM" },
        { id: "calendar.event_view", label: "Visualizar Calendário", description: "Visualizar Calendário" },
      ],
    })
    vi.mocked(api.put).mockResolvedValueOnce({ data: {} })

    render(
      <RoleForm
        initialData={{ id: 1, name: "Teste", description: "", permissions: [], is_system_role: false }}
        onSuccess={vi.fn()}
        onCancel={vi.fn()}
      />,
      { wrapper: createWrapper() },
    )

    const crmRow = await screen.findByRole("button", { name: /Visualizar CRM/i })
    await user.click(crmRow)

    const crmCheckbox = within(crmRow).getByRole("checkbox")
    expect(crmCheckbox).toHaveAttribute("data-state", "checked")

    await user.click(screen.getByRole("button", { name: /Salvar Alterações/i }))
    expect(vi.mocked(api.put)).toHaveBeenCalledWith(
      "/api/accounts/roles/1/",
      expect.objectContaining({ permissions: ["crm.deal_view"] }),
    )

    await user.click(crmRow)
    expect(crmCheckbox).toHaveAttribute("data-state", "unchecked")
  })
})
