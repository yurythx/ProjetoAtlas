import * as React from "react"
import { useQuery } from "@tanstack/react-query"
import { api } from "@/lib/axios"
import { ExternalLink, Loader2 } from "lucide-react"
import Image from "next/image"
import { cn } from "@/lib/utils"

interface LinkPreviewProps {
    url: string
    className?: string
}

interface LinkPreviewData {
    title: string
    description: string
    image: string
    url: string
    status?: "processing"
}

export function LinkPreview({ url, className }: LinkPreviewProps) {
    const { data, isLoading, error } = useQuery<LinkPreviewData>({
        queryKey: ["link-preview", url],
        queryFn: async () => {
            const res = await api.get<LinkPreviewData>(`/api/messenger/messages/link_preview/?url=${encodeURIComponent(url)}`)
            return res.data
        },
        // If backend returns 202 'processing', refetch after 2 seconds
        refetchInterval: (query) => {
            if (query.state.data?.status === "processing") return 2000
            return false
        },
        retry: 2,
        staleTime: 1000 * 60 * 60, // 1 hour
    })

    if (isLoading) {
        return (
            <div className={cn("mt-2 rounded-xl border border-border/50 bg-muted/30 p-3 animate-pulse flex flex-col gap-2", className)}>
                <div className="h-4 w-40 bg-muted rounded" />
                <div className="h-3 w-full bg-muted rounded" />
            </div>
        )
    }

    if (error || !data || (data.status === "processing" && !data.title)) {
        // If it's still processing and we have no data yet, show a subtle loader
        if (data?.status === "processing") {
            return (
                <div className={cn("mt-2 rounded-xl border border-border/50 bg-muted/20 p-2 flex items-center gap-2 text-[10px] text-muted-foreground", className)}>
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Gerando prévia do link...
                </div>
            )
        }
        return null
    }

    const { title, description, image } = data

    if (!title && !description && !image) return null

    return (
        <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
                "mt-2 block rounded-xl border border-border/50 bg-muted/40 overflow-hidden transition-all hover:bg-muted/60 group shadow-sm",
                className
            )}
        >
            {image && (
                <div className="relative w-full h-32 md:h-40 bg-muted/50 border-b border-border/30">
                    <Image
                        src={image}
                        alt={title || "Link preview info"}
                        fill
                        className="object-cover transition-transform group-hover:scale-[1.02]"
                        sizes="(max-width: 768px) 100vw, 400px"
                    />
                </div>
            )}
            <div className="p-3 space-y-1">
                <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-[10px] text-primary font-bold uppercase tracking-wider flex items-center gap-1">
                        <ExternalLink className="h-2.5 w-2.5" />
                        {new URL(url).hostname.replace('www.', '')}
                    </span>
                </div>
                {title && <h4 className="text-sm font-bold line-clamp-1 group-hover:text-primary transition-colors">{title}</h4>}
                {description && <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">{description}</p>}
            </div>
        </a>
    )
}
