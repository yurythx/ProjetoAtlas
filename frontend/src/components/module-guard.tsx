"use client"

import { useModules } from "@/hooks/use-modules"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { PackageX, Home } from "lucide-react"
import Link from "next/link"

interface ModuleGuardProps {
    moduleCode: string
    children: React.ReactNode
}

export function ModuleGuard({ moduleCode, children }: ModuleGuardProps) {
    const { isModuleActive, isLoading } = useModules()
    const [isChecking, setIsChecking] = useState(true)

    useEffect(() => {
        if (!isLoading) {
            setIsChecking(false)
        }
    }, [isLoading])

    if (isLoading || isChecking) {
        return (
            <div className="flex h-full w-full items-center justify-center min-h-[400px]">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
        )
    }

    if (!isModuleActive(moduleCode)) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-6 text-center px-4">
                <div className="bg-muted/50 p-6 rounded-full">
                    <PackageX className="h-16 w-16 text-muted-foreground" />
                </div>
                <div className="space-y-2">
                    <h1 className="text-3xl font-bold tracking-tight">Módulo Indisponível</h1>
                    <p className="text-muted-foreground max-w-[500px]">
                        Este módulo não está ativo para sua empresa. Entre em contato com o administrador do sistema para solicitar acesso.
                    </p>
                </div>
                <div className="flex gap-4">
                    <Button asChild variant="default">
                        <Link href="/">
                            <Home className="mr-2 h-4 w-4" />
                            Voltar ao Início
                        </Link>
                    </Button>
                </div>
            </div>
        )
    }

    return <>{children}</>
}
