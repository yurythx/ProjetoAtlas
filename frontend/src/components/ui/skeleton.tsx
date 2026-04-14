import { cn } from "@/lib/utils"

function Skeleton({
    className,
    ...props
}: React.HTMLAttributes<HTMLDivElement>) {
    return (
        <div
            className={cn("animate-pulse rounded-md bg-muted", className)}
            {...props}
        />
    )
}

// Card Skeleton
function CardSkeleton({ className }: { className?: string }) {
    return (
        <div className={cn("rounded-lg border bg-card p-6 space-y-4", className)}>
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
        </div>
    )
}

// Table Skeleton
function TableSkeleton({ rows = 5, columns = 4 }: { rows?: number; columns?: number }) {
    return (
        <div className="w-full space-y-3">
            {/* Header */}
            <div className="flex gap-4">
                {Array.from({ length: columns }).map((_, i) => (
                    <Skeleton key={i} className="h-4 flex-1" />
                ))}
            </div>
            {/* Rows */}
            {Array.from({ length: rows }).map((_, i) => (
                <div key={i} className="flex gap-4">
                    {Array.from({ length: columns }).map((_, j) => (
                        <Skeleton key={j} className="h-10 flex-1" />
                    ))}
                </div>
            ))}
        </div>
    )
}

// Article/Post Skeleton
function ArticleSkeleton() {
    return (
        <div className="space-y-4">
            <Skeleton className="h-8 w-3/4" /> {/* Title */}
            <div className="flex items-center gap-4">
                <Skeleton className="h-10 w-10 rounded-full" /> {/* Avatar */}
                <div className="space-y-2">
                    <Skeleton className="h-4 w-32" /> {/* Author */}
                    <Skeleton className="h-3 w-24" /> {/* Date */}
                </div>
            </div>
            <Skeleton className="h-48 w-full" /> {/* Image */}
            <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
            </div>
        </div>
    )
}

// Dashboard Card Skeleton
function DashboardCardSkeleton() {
    return (
        <div className="rounded-lg border bg-card p-6">
            <div className="flex items-center justify-between space-y-0 pb-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-4 rounded" />
            </div>
            <div className="space-y-2">
                <Skeleton className="h-8 w-20" />
                <Skeleton className="h-3 w-32" />
            </div>
        </div>
    )
}

// Form Skeleton
function FormSkeleton({ fields = 5 }: { fields?: number }) {
    return (
        <div className="space-y-6">
            {Array.from({ length: fields }).map((_, i) => (
                <div key={i} className="space-y-2">
                    <Skeleton className="h-4 w-24" /> {/* Label */}
                    <Skeleton className="h-10 w-full" /> {/* Input */}
                </div>
            ))}
            <Skeleton className="h-10 w-24" /> {/* Button */}
        </div>
    )
}

// List Skeleton
function ListSkeleton({ items = 5 }: { items?: number }) {
    return (
        <div className="space-y-3">
            {Array.from({ length: items }).map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                    <Skeleton className="h-12 w-12 rounded-full" />
                    <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-3 w-2/3" />
                    </div>
                </div>
            ))}
        </div>
    )
}

// Page Skeleton (Full Page Loading)
function PageSkeleton() {
    return (
        <div className="container py-6 space-y-6">
            <div className="space-y-2">
                <Skeleton className="h-10 w-64" /> {/* Page Title */}
                <Skeleton className="h-4 w-96" /> {/* Page Description */}
            </div>
            <div className="grid gap-6 md:grid-cols-3">
                <DashboardCardSkeleton />
                <DashboardCardSkeleton />
                <DashboardCardSkeleton />
            </div>
            <div className="rounded-lg border bg-card p-6">
                <TableSkeleton rows={8} columns={5} />
            </div>
        </div>
    )
}

export {
    Skeleton,
    CardSkeleton,
    TableSkeleton,
    ArticleSkeleton,
    DashboardCardSkeleton,
    FormSkeleton,
    ListSkeleton,
    PageSkeleton,
}
