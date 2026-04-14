import { PipelinesHub } from "@/features/crm/pipelines-hub"

export const metadata = {
  title: "Processos | Service Desk | Atlas",
  description: "Acompanhe o andamento geral dos pipelines do CRM.",
}

export default function Page() {
  return <PipelinesHub />
}

