"use client"

import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { motion } from "framer-motion"

interface PageHeaderProps {
    title: string
    description?: string
    children?: React.ReactNode
    backHref?: string
    className?: string
}

export function PageHeader({
    title,
    description,
    children,
    backHref,
    className,
}: PageHeaderProps) {
    return (
        <div className={cn("flex flex-col gap-4 mb-8 md:flex-row md:items-center md:justify-between", className)}>
            <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                    {backHref && (
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 -ml-1 rounded-full hover:bg-muted"
                            asChild
                        >
                            <Link href={backHref} aria-label="Voltar">
                                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                            </Link>
                        </Button>
                    )}
                    <motion.h1
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="text-2xl font-bold tracking-tight text-foreground md:text-3xl"
                    >
                        {title}
                    </motion.h1>
                </div>
                {description && (
                    <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.1 }}
                        className="text-muted-foreground"
                    >
                        {description}
                    </motion.p>
                )}
            </div>
            <div className="flex items-center gap-3">
                {children}
            </div>
        </div>
    )
}
