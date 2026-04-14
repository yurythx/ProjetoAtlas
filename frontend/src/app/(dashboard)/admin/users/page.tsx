"use client"

import { Protected } from "@/components/auth/protected"
import dynamic from "next/dynamic"
import { Skeleton, TableSkeleton } from "@/components/ui/skeleton"
import { useRouter, useSearchParams } from "next/navigation"
import { useEffect, useState } from "react"

const UserList = dynamic(
    () => import("@/features/users/user-list").then((m) => m.UserList),
    {
        ssr: false,
        loading: () => (
            <div className="space-y-4" role="status" aria-live="polite" aria-label="Carregando usuários">
                <Skeleton className="h-10 w-72 rounded-xl" />
                <div className="rounded-2xl border border-primary/5 bg-card/30 p-4 shadow-sm">
                    <TableSkeleton rows={7} columns={5} />
                </div>
            </div>
        ),
    }
)

export default function UsersPage() {
    const searchParams = useSearchParams()
    const router = useRouter()
    const create = searchParams.get("create") === "1"
    const invite = searchParams.get("invite") === "1"
    const [initialDialog] = useState<'create' | 'invite' | null>(() => (create ? "create" : invite ? "invite" : null))

    useEffect(() => {
        if (!initialDialog) return
        router.replace("/admin/users")
    }, [initialDialog, router])

    return (
        <Protected requiredPermissions={['admin.user_manage']}>
            <div className="max-w-5xl mx-auto py-8">
                <UserList initialDialog={initialDialog} />
            </div>
        </Protected>
    )
}
