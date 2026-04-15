import CRMPage from "@/features/crm/crm-page"
import { PipelinesHub } from "@/features/crm/pipelines-hub"

export const metadata = {
  title: "Service Desk | Atlas",
  description: "Gerencie seus leads e chamados de TI.",
}

export default async function Page({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const resolvedSearchParams = (await searchParams) ?? {}
  const pipelineParam = resolvedSearchParams.pipeline
  const pipeline = Array.isArray(pipelineParam) ? pipelineParam[0] : pipelineParam

  if (!pipeline) {
    return <PipelinesHub autoRedirect={true} />
  }

  return <CRMPage />
}
