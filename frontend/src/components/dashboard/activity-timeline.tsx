"use client"

import { motion } from "framer-motion"
import { formatDistanceToNow } from "date-fns"
import { ptBR } from "date-fns/locale"
import {
    Plus,
    Pencil,
    Trash2,
    User,
    Settings,
    FileText,
    ShieldCheck,
    Circle
} from "lucide-react"
import { cn } from "@/lib/utils"

interface Activity {
    action: string
    resource: string
    created_at: string
    user: {
        name: string
        avatar: string | null
    }
}

interface ActivityTimelineProps {
    activities: Activity[]
}

const actionConfig = {
    create: { icon: Plus, color: "text-emerald-500", bg: "bg-emerald-500/10" },
    update: { icon: Pencil, color: "text-blue-500", bg: "bg-blue-500/10" },
    delete: { icon: Trash2, color: "text-rose-500", bg: "bg-rose-500/10" },
    default: { icon: Circle, color: "text-muted-foreground", bg: "bg-muted/10" }
}

const resourceIcons = {
    User: User,
    Article: FileText,
    Page: ShieldCheck,
    Settings: Settings,
}

export function ActivityTimeline({ activities }: ActivityTimelineProps) {
    if (!activities?.length) {
        return (
            <div className="flex flex-col items-center justify-center py-12 text-center opacity-50">
                <Activity className="h-12 w-12 mb-4" aria-hidden="true" />
                <p>Nenhuma atividade registrada.</p>
            </div>
        )
    }

    return (
        <div className="relative space-y-8 before:absolute before:inset-0 before:ml-5 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-primary/20 before:via-primary/5 before:to-transparent" role="list" aria-label="Linha do tempo de atividades">
            {activities.map((activity, index) => {
                const config = actionConfig[activity.action as keyof typeof actionConfig] || actionConfig.default
                const ResourceIcon = resourceIcons[activity.resource as keyof typeof resourceIcons] || Circle
                const ActionIcon = config.icon

                return (
                    <motion.div
                        key={index}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.1 }}
                        className="relative pl-12 group"
                        role="listitem"
                    >
                        {/* Action Dot/Icon */}
                        <div className={cn(
                            "absolute left-0 top-0 h-10 w-10 rounded-full flex items-center justify-center ring-4 ring-background transition-transform group-hover:scale-110",
                            config.bg
                        )} aria-hidden="true">
                            <ActionIcon className={cn("h-5 w-5", config.color)} aria-hidden="true" />
                        </div>

                        <div className="glass-morphism p-4 rounded-2xl border transition-all hover:shadow-lg hover:shadow-primary/5 group-hover:border-primary/20">
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 mb-1">
                                <div className="flex items-center gap-2">
                                    <span className="font-bold text-sm text-foreground">
                                        {activity.user.name}
                                    </span>
                                    <span className="text-muted-foreground text-sm">
                                        {activity.action === 'create' && 'criou um novo'}
                                        {activity.action === 'update' && 'atualizou o'}
                                        {activity.action === 'delete' && 'removeu o'}
                                        {!['create', 'update', 'delete'].includes(activity.action) && activity.action}
                                    </span>
                                    <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-muted text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                        <ResourceIcon className="h-3 w-3" aria-hidden="true" />
                                        {activity.resource}
                                    </div>
                                </div>
                                <time className="text-[11px] font-medium text-muted-foreground bg-muted/30 px-2 py-0.5 rounded">
                                    {formatDistanceToNow(new Date(activity.created_at), { addSuffix: true, locale: ptBR })}
                                </time>
                            </div>
                            <p className="text-sm text-muted-foreground leading-relaxed">
                                Ação realizada no sistema Atlas.
                            </p>
                        </div>
                    </motion.div>
                )
            })}
        </div>
    )
}

import { Activity } from "lucide-react"
