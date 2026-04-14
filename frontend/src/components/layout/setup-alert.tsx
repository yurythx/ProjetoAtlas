"use client"

import { useQuery } from "@tanstack/react-query"
import { api } from "@/lib/axios"
import { useState } from "react"
import { AlertCircle, ArrowRight, Settings, X } from "lucide-react"
import Link from "next/link"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/hooks/use-auth"

export function SetupAlert() {
    const { user } = useAuth()
    const [isVisible, setIsVisible] = useState(() => {
        if (typeof window === 'undefined') return true
        return localStorage.getItem('hideSetupAlert') !== 'true'
    })

    const hidePermanently = () => {
        setIsVisible(false)
        localStorage.setItem('hideSetupAlert', 'true')
    }

    // Only show for admins/staff
    const isAdmin = user?.is_superuser || user?.role_details?.name === 'Administrador'

    const { data: branding } = useQuery({
        queryKey: ['branding-current'],
        queryFn: async () => {
            const res = await api.get('/api/core/branding/current/')
            return res.data
        },
        enabled: !!user && isAdmin
    })

    if (!isVisible || !isAdmin || !branding) return null

    // Check for critical missing setup
    const isDefaultLogo = !branding.logo
    const isDefaultName = branding.company_name === 'Atlas SaaS' || branding.company_name === ''

    const needsSetup = isDefaultLogo || isDefaultName

    if (!needsSetup) return null

    return (
        <div className="mx-auto max-w-7xl px-6 md:px-8 pt-6 relative group">
            <Alert className="bg-primary/5 border-primary/20 rounded-2xl shadow-sm border-dashed pr-12">
                <AlertCircle className="h-5 w-5 text-primary" />
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 w-full">
                    <div>
                        <AlertTitle className="font-bold text-primary">Configuração Incompleta</AlertTitle>
                        <AlertDescription className="text-muted-foreground">
                            Personalize a identidade da sua empresa (Logo, Nome e Cores) para remover este aviso.
                        </AlertDescription>
                    </div>
                    <Link href="/settings?tab=branding">
                        <Button size="sm" className="rounded-xl gap-2 font-semibold">
                            <Settings className="h-4 w-4" /> Configurar Identidade <ArrowRight className="h-4 w-4" />
                        </Button>
                    </Link>
                </div>

                <button
                    onClick={hidePermanently}
                    className="absolute top-4 right-4 p-1 rounded-full hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                    title="Fechar aviso permanentemente"
                >
                    <X className="h-4 w-4" />
                </button>
            </Alert>
        </div>
    )
}
