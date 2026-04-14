"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Home, ArrowLeft } from "lucide-react"
import { SlideUp, FadeIn } from "@/components/ui/motion"

export default function NotFound() {
    return (
        <div className="min-h-screen flex items-center justify-center bg-background px-6" role="main" aria-labelledby="nf-title">
            <SlideUp className="max-w-md w-full text-center space-y-12">
                <div className="relative">
                    <FadeIn delay={0.2}>
                        <h1 className="text-[180px] font-black text-primary/5 leading-none select-none" aria-hidden="true">404</h1>
                    </FadeIn>
                    <div className="absolute inset-0 flex flex-col items-center justify-center pt-8">
                        <FadeIn delay={0.3}>
                            <h2 id="nf-title" className="text-3xl font-extrabold tracking-tight mb-2">Página não encontrada</h2>
                            <p className="text-muted-foreground max-w-[280px]">Oops! O caminho que você tentou acessar não existe ou foi removido.</p>
                        </FadeIn>
                    </div>
                </div>

                <FadeIn delay={0.4} className="flex flex-col sm:flex-row gap-4 justify-center items-center">
                    <Button asChild variant="default" size="lg" className="rounded-2xl px-10 h-14 shadow-xl shadow-primary/20 transition-all hover:scale-105 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">
                        <Link href="/" className="flex items-center gap-2" aria-label="Ir para a página inicial">
                            <Home className="h-5 w-5" aria-hidden="true" />
                            <span className="font-bold">Início</span>
                        </Link>
                    </Button>
                    <Button
                        variant="ghost"
                        size="lg"
                        className="rounded-2xl px-10 h-14 text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-all font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                        onClick={() => window.history.back()}
                        aria-label="Voltar para a página anterior"
                    >
                        <ArrowLeft className="h-5 w-5 mr-2" aria-hidden="true" />
                        Voltar
                    </Button>
                </FadeIn>
            </SlideUp>
        </div>
    )
}
