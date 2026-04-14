import Link from "next/link"
import { Button } from "@/components/ui/button"
import { cookies } from "next/headers"

export async function PublicHeader() {
  const cookieStore = await cookies()
  const hasSession = cookieStore.get("hasSession")?.value === "true"

  return (
    <header className="sticky top-0 z-50 border-b bg-background/70 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-6 h-16 flex items-center justify-between gap-4">
        <Link href="/" className="font-black tracking-tighter text-lg">
          Atlas
        </Link>
        <nav className="flex items-center gap-2" aria-label="Ações">
          <Button asChild variant="ghost" className="rounded-xl">
            <Link href="/p/ecossistema-de-servicos">Serviços</Link>
          </Button>
          <Button asChild variant="ghost" className="rounded-xl">
            <Link href="/p/sobre">Sobre</Link>
          </Button>
          <Button asChild variant="ghost" className="rounded-xl">
            <Link href={hasSession ? "/artigos" : "/p/artigos"}>Artigos</Link>
          </Button>
          {!hasSession && (
            <Button asChild variant="ghost" className="rounded-xl">
              <Link href="/login">Entrar</Link>
            </Button>
          )}
        </nav>
      </div>
    </header>
  )
}
