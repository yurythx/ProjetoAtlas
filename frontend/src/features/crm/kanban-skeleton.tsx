"use client"

import { Skeleton } from "@/components/ui/skeleton"
import { Card } from "@/components/ui/card"

export function KanbanSkeleton() {
  return (
    <div className="flex gap-6 overflow-x-auto pb-6 scrollbar-hide min-h-[700px] p-1">
      {[1, 2, 3, 4].map((i) => (
        <div 
          key={i} 
          className="flex flex-col w-[320px] bg-muted/20 border border-primary/5 rounded-3xl p-4 gap-4 glass shrink-0"
        >
          {/* Header da Coluna */}
          <div className="flex items-center justify-between px-2 mb-2">
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-24 rounded-full" />
              <Skeleton className="h-5 w-8 rounded-full" />
            </div>
            <Skeleton className="h-4 w-4 rounded-full" />
          </div>

          {/* Cards de Exemplo */}
          <div className="flex flex-col gap-3">
            {[1, 2, 3].map((j) => (
              <Card key={j} className="bg-card/50 border border-primary/5 rounded-2xl p-4 space-y-3 shadow-none">
                <div className="flex items-start justify-between gap-4">
                  <Skeleton className="h-5 w-full rounded-lg" />
                  <Skeleton className="h-5 w-12 rounded-full" />
                </div>
                
                <div className="flex items-center gap-2">
                  <Skeleton className="h-6 w-6 rounded-full" />
                  <Skeleton className="h-4 w-24 rounded-lg" />
                </div>
                
                <div className="flex items-center justify-between pt-1">
                  <Skeleton className="h-6 w-24 rounded-lg" />
                </div>
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}