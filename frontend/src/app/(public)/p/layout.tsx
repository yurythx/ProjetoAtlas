import { PublicHeader } from "@/components/layout/public-header"
import { PublicFooter } from "@/components/public/footer"

export default function PublicLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <div className="min-h-screen flex flex-col bg-background text-foreground">
            <a
                href="#conteudo-principal"
                className="sr-only focus:not-sr-only fixed top-2 left-2 z-[60] bg-primary text-primary-foreground px-4 py-2 rounded-md shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
                Pular para conteúdo
            </a>
            <PublicHeader />
            <main id="conteudo-principal" role="main" className="flex-1 px-6 md:px-8 py-10">
                <div className="mx-auto max-w-7xl">
                    {children}
                </div>
            </main>
            <PublicFooter />
        </div>
    )
}
