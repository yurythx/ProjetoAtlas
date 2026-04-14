"use client"

import { useState, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { PageList } from "@/features/pages/page-list"
import { ModuleGuard } from "@/components/module-guard"
import { Page } from "@/types"
import dynamic from "next/dynamic"
import { Skeleton } from "@/components/ui/skeleton"

const PageForm = dynamic(
  () => import("@/features/pages/page-form").then((m) => m.PageForm),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-2xl border border-primary/5 bg-card/30 p-4 shadow-sm space-y-4" role="status" aria-live="polite" aria-label="Carregando editor de página">
        <Skeleton className="h-10 w-60 rounded-xl" />
        <Skeleton className="h-10 w-full rounded-xl" />
        <Skeleton className="h-[520px] w-full rounded-2xl" />
      </div>
    ),
  }
)

function CMSPageContent() {
  const searchParams = useSearchParams()
  const initialView = searchParams.get('action') === 'create' ? 'create' : 'list'
  const [view, setView] = useState<'list' | 'create' | 'edit'>(initialView)
  const [selectedPage, setSelectedPage] = useState<Page | null>(null)

  // Estado inicial já deriva de searchParams; sem sincronização via efeito

  const handleCreate = () => {
    setSelectedPage(null)
    setView('create')
  }

  const handleEdit = (page: Page) => {
    setSelectedPage(page)
    setView('edit')
  }

  const handleSuccess = () => {
    setView('list')
    setSelectedPage(null)
  }

  const handleCancel = () => {
    setView('list')
    setSelectedPage(null)
  }

  return (
    <div className="h-full">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Gestão de Páginas</h1>
        <p className="text-muted-foreground">Gerencie o conteúdo institucional e páginas estáticas do seu portal.</p>
      </div>

      {view === 'list' && (
        <PageList onCreate={handleCreate} onEdit={handleEdit} />
      )}
      {(view === 'create' || view === 'edit') && (
        <PageForm
          initialData={selectedPage}
          onSuccess={handleSuccess}
          onCancel={handleCancel}
        />
      )}
    </div>
  )
}

export default function CMSPage() {
  return (
    <ModuleGuard moduleCode="pages">
      <Suspense fallback={null}>
        <CMSPageContent />
      </Suspense>
    </ModuleGuard>
  )
}
