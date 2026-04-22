import { render, screen } from "@testing-library/react"
import { describe, it, expect, vi } from "vitest"
import CRMAnalyticsPage from "../crm-analytics-page"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

// Mock complex dependencies
vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    section: ({ children, ...props }: any) => <section {...props}>{children}</section>,
    header: ({ children, ...props }: any) => <header {...props}>{children}</header>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}))

vi.mock("lucide-react", () => {
  return new Proxy({}, {
    get: (target, prop) => {
      if (prop === "__esModule") return true
      return () => <div />
    }
  })
})

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
  LineChart: () => <div />,
  Line: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  Legend: () => null,
}))

// Mock UI components
vi.mock("@/components/ui/card", () => ({
  Card: ({ children }: any) => <div>{children}</div>,
  CardHeader: ({ children }: any) => <div>{children}</div>,
  CardTitle: ({ children }: any) => <div>{children}</div>,
  CardContent: ({ children }: any) => <div>{children}</div>,
}))

vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children }: any) => <div>{children}</div>,
}))

vi.mock("@/components/ui/button", () => ({
  Button: ({ children }: any) => <button>{children}</button>,
}))

vi.mock("@/components/ui/select", () => ({
  Select: ({ children }: any) => <div>{children}</div>,
  SelectTrigger: ({ children }: any) => <div>{children}</div>,
  SelectValue: ({ children }: any) => <div>{children}</div>,
  SelectContent: ({ children }: any) => <div>{children}</div>,
  SelectItem: ({ children }: any) => <div>{children}</div>,
}))

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
})

describe("ITIL v5 Analytics UI", () => {
  it("renders the VSM section with loading state initially", () => {
    render(
      <QueryClientProvider client={queryClient}>
        <CRMAnalyticsPage />
      </QueryClientProvider>
    )

    expect(screen.getByText(/VALUE STREAM MAP/i)).toBeInTheDocument()
  })

  // We can add more targeted tests if we export subcomponents
})
