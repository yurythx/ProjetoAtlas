"use client"

import dynamic from "next/dynamic"
import { Suspense } from "react"
import { Skeleton } from "@/components/ui/skeleton"

const AcceptInviteCard = dynamic(
    () => import("@/features/auth/accept-invite-card").then((m) => m.AcceptInviteCard),
    {
        ssr: false,
        loading: () => (
            <div className="w-full max-w-md bg-background rounded-3xl p-8 shadow-2xl space-y-6" role="status" aria-live="polite" aria-label="Carregando convite">
                <Skeleton className="h-12 w-12 rounded-2xl mx-auto" />
                <Skeleton className="h-8 w-52 rounded-xl mx-auto" />
                <Skeleton className="h-5 w-72 rounded-lg mx-auto" />
                <Skeleton className="h-12 w-full rounded-xl" />
                <Skeleton className="h-12 w-full rounded-xl" />
            </div>
        ),
    }
)

export default function AcceptInvitePage() {
    return (
        <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4" role="main" aria-label="Aceitar convite">
            <Suspense fallback={null}>
                <AcceptInviteCard />
            </Suspense>
        </div>
    )
}
