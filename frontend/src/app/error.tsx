"use client"

import { useEffect } from "react"
import { Button } from "@/components/ui/button"
import { AlertTriangle, RefreshCcw, Home } from "lucide-react"
import Link from "next/link"
import { SlideUp } from "@/components/ui/motion"

export default function Error({
    error,
    reset,
}: {
    error: Error & { digest?: string }
    reset: () => void
}) {
    useEffect(() => {
        // Log error to console - in production this would go to Sentry
        console.error("Application error:", error)
    }, [error])

    return (
        <div className="min-h-screen flex items-center justify-center bg-background px-6" role="main" aria-labelledby="error-title">
            <SlideUp className="max-w-md w-full text-center space-y-10 p-12 rounded-[40px] border border-destructive/10 bg-destructive/5 glass-morphism shadow-2xl shadow-destructive/5">
                <div className="flex justify-center">
                    <div className="h-24 w-24 rounded-3xl bg-destructive/10 flex items-center justify-center animate-pulse">
                        <AlertTriangle className="h-12 w-12 text-destructive" aria-hidden="true" />
                    </div>
                </div>

                <div className="space-y-3">
                    <h2 id="error-title" className="text-3xl font-black tracking-tight text-foreground">Algo deu errado</h2>
                    <p className="text-muted-foreground leading-relaxed">Ocorreu um erro inesperado no sistema. Nossa equipe técnica já foi notificada automaticamente.</p>
                </div>

                <div className="flex flex-col gap-4">
                    <Button
                        onClick={() => reset()}
                        size="lg"
                        className="rounded-2xl h-14 bg-destructive text-white hover:bg-destructive/90 shadow-xl shadow-destructive/20 transition-all active:scale-95 font-bold focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                    >
                        <RefreshCcw className="h-5 w-5 mr-3" aria-hidden="true" />
                        Tentar novamente
                    </Button>
                    <Button
                        asChild
                        variant="ghost"
                        className="h-14 rounded-2xl text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                    >
                        <Link href="/">
                            <Home className="h-5 w-5 mr-3" aria-hidden="true" />
                            Voltar para o Início
                        </Link>
                    </Button>
                </div>

                {process.env.NODE_ENV === 'development' && (
                    <div className="mt-8 p-5 rounded-2xl bg-black/5 text-left overflow-hidden border border-black/5">
                        <p className="text-[10px] font-bold uppercase text-muted-foreground mb-2 tracking-widest">Debug Info</p>
                        <code className="text-xs text-destructive font-mono break-all line-clamp-4">{error.message}</code>
                    </div>
                )}
            </SlideUp>
        </div>
    )
}
