import { PipelineDetail } from "@/features/crm/pipeline-detail"

export const metadata = {
  title: "Processo | Service Desk | Atlas",
  description: "Acompanhe o andamento de um pipeline do CRM.",
}

export default async function Page({ params }: { params: Promise<{ pipelineId: string }> }) {
  const { pipelineId } = await params
  const numericId = Number(pipelineId)
  return <PipelineDetail pipelineId={Number.isFinite(numericId) ? numericId : 0} />
}

