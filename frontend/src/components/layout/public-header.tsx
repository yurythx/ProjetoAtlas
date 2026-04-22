import Link from "next/link"
import { cookies } from "next/headers"
import { PublicNav } from "./public-nav"

export async function PublicHeader() {
  const cookieStore = await cookies()
  const hasSession = cookieStore.get("hasSession")?.value === "true"

  return (
    <header className="sticky top-0 z-50 border-b bg-background/70 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-6 h-16 flex items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2 group">
          <div className="h-8 w-8 rounded-xl bg-primary flex items-center justify-center text-white shadow-lg shadow-primary/20 group-hover:scale-110 transition-transform">
             <span className="font-black text-xs">A</span>
          </div>
          <span className="font-black tracking-tighter text-xl uppercase italic">Atlas</span>
        </Link>
        
        <PublicNav hasSession={hasSession} />
      </div>
    </header>
  )
}
