import { Suspense } from "react"
import CRMPage from "@/features/crm/crm-page"
import { PipelinesHub } from "@/features/crm/pipelines-hub"
import { Skeleton } from "@/components/ui/skeleton"

export const metadata = {
  title: "Service Desk | Atlas",
  description: "Gerencie seus leads e chamados de TI.",
}

function CRMLoadingFallback() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-32" />
      </div>
      <Skeleton className="h-12 w-full" />
      <div className="flex gap-3 overflow-x-auto pb-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[600px] w-72 flex-shrink-0 rounded-2xl" />
        ))}
      </div>
    </div>
  )
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
    return (
      <Suspense fallback={<Skeleton className="h-[600px] w-full rounded-2xl" />}>
        <PipelinesHub autoRedirect={true} />
      </Suspense>
    )
  }

  return (
    <Suspense fallback={<CRMLoadingFallback />}>
      <CRMPage />
    </Suspense>
  )
}
