"use client"

import { useParams, useRouter } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { api } from "@/lib/axios"
import { Loader2 } from "lucide-react"
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

export default function EditarArtigoPage() {
  const params = useParams<{ slug: string }>()
  const router = useRouter()
  const slug = params?.slug

  const { data: article, isLoading, isError } = useQuery({
    queryKey: ["article", slug],
    queryFn: async () => {
      const res = await api.get(`/api/articles/articles/${slug}/`)
      return res.data
    },
    enabled: Boolean(slug),
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2 text-muted-foreground">Carregando artigo...</span>
      </div>
    )
  }

  if (isError || !article) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
        <h2 className="text-xl font-bold">Artigo não encontrado</h2>
        <button
          onClick={() => router.push('/artigos')}
          className="text-primary hover:underline"
        >
          Voltar para a lista
        </button>
      </div>
    )
  }

  return (
    <Protected requiredPermissions={["articles.article_edit"]}>
      <ModuleGuard moduleCode="articles">
        <ArticleForm
          initialData={article}
          onSuccess={() => router.push('/artigos')}
          onCancel={() => router.push('/artigos')}
        />
      </ModuleGuard>
    </Protected>
  )
}
