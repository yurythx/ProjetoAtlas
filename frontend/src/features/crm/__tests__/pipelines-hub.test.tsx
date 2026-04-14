import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import React from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

import { PipelinesHub } from "../pipelines-hub"
import * as useCRMHook from "../use-crm"
import * as useCRMUsersHook from "../use-crm-users"
import * as permissionHook from "@/hooks/use-permission"
import type { Pipeline } from "../use-crm"

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}))

vi.mock("@/components/module-guard", () => ({
  ModuleGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock("../use-crm", async () => {
  const actual = await vi.importActual("../use-crm")
  return {
    ...actual,
    useCRM: vi.fn(),
  }
})

vi.mock("../use-crm-users", () => ({
  useCRMUsers: vi.fn(),
}))

vi.mock("@/hooks/use-permission", () => ({
  usePermission: vi.fn(),
}))

describe("PipelinesHub", () => {
  type UseCRMReturn = ReturnType<typeof useCRMHook.useCRM>

  const pipelines: Pipeline[] = [
    {
      id: 1,
      name: "Suporte",
      stages: [],
      visibility: "company",
      groups: [],
    },
  ]

  function renderWithQueryClient(ui: React.ReactNode) {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
    return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
  }

  it("mostra botão de criar pipeline quando o usuário tem permissão", () => {
    vi.mocked(useCRMHook.useCRM).mockReturnValue({
      pipelines,
      deals: [],
      isLoading: false,
    } as unknown as UseCRMReturn)

    vi.mocked(useCRMUsersHook.useCRMUsers).mockReturnValue({ data: [] } as unknown as ReturnType<typeof useCRMUsersHook.useCRMUsers>)
    vi.mocked(permissionHook.usePermission).mockReturnValue({
      hasPermission: () => true,
      hasRole: () => false,
      userRole: undefined,
    })

    renderWithQueryClient(<PipelinesHub />)
    expect(screen.getByRole("button", { name: "Nova Pipeline" })).toBeInTheDocument()
  })

  it("não mostra botão de criar pipeline quando o usuário não tem permissão", () => {
    vi.mocked(useCRMHook.useCRM).mockReturnValue({
      pipelines,
      deals: [],
      isLoading: false,
    } as unknown as UseCRMReturn)

    vi.mocked(useCRMUsersHook.useCRMUsers).mockReturnValue({ data: [] } as unknown as ReturnType<typeof useCRMUsersHook.useCRMUsers>)
    vi.mocked(permissionHook.usePermission).mockReturnValue({
      hasPermission: () => false,
      hasRole: () => false,
      userRole: undefined,
    })

    renderWithQueryClient(<PipelinesHub />)
    expect(screen.queryByRole("button", { name: "Nova Pipeline" })).not.toBeInTheDocument()
  })
})
