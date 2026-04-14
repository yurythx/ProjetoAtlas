"use client"

import { useRouter } from "next/navigation"
import dynamic from "next/dynamic"
import { Skeleton } from "@/components/ui/skeleton"
import { ModuleGuard } from "@/components/module-guard"
import { Protected } from "@/components/auth/protected"

const ArticleForm = dynamic(
  () => import("@/features/articles/article-form").then((m) => m.ArticleForm),
  {
    ssr: false,
    loading: () => (
      <div className="space-y-6" role="status" aria-live="polite" aria-label="Carregando editor de artigo">
        <Skeleton className="h-10 w-72 rounded-2xl" />
        <Skeleton className="h-10 w-full rounded-xl" />
        <Skeleton className="h-[520px] w-full rounded-2xl" />
      </div>
    ),
  }
)

export default function NovoArtigoPage() {
  const router = useRouter()

  return (
    <Protected requiredPermissions={["articles.article_create"]}>
      <ModuleGuard moduleCode="articles">
        <ArticleForm
          onSuccess={() => router.push('/artigos')}
          onCancel={() => router.push('/artigos')}
        />
      </ModuleGuard>
    </Protected>
  )
}
