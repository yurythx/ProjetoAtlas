"use client"
// Force recompile: 2026-01-30

import { H2, P } from "@/components/ui/typography"
import { useEffect, useState } from "react"
import Image from "next/image"
import dynamic from "next/dynamic"
import { Skeleton } from "@/components/ui/skeleton"
import { useRouter, useSearchParams } from "next/navigation"
import { notify } from "@/lib/notifications"
import Link from "next/link"
import { BookOpen } from "lucide-react"
import { Button } from "@/components/ui/button"

const LoginForm = dynamic(
  () => import("@/features/auth/login-form").then((m) => m.LoginForm),
  {
    ssr: false,
    loading: () => (
      <div className="space-y-4" role="status" aria-live="polite" aria-label="Carregando login">
        <Skeleton className="h-12 w-full rounded-xl" />
        <Skeleton className="h-12 w-full rounded-xl" />
        <Skeleton className="h-12 w-full rounded-xl" />
      </div>
    ),
  }
)

export default function LoginPage() {
  const [previewCompany, setPreviewCompany] = useState<{ name: string, logo?: string | null } | null>(null)
  const searchParams = useSearchParams()
  const router = useRouter()

  useEffect(() => {
    const loggedOut = searchParams.get("logged_out") === "1"
    if (!loggedOut) return
    notify.success("Logout realizado", "Você saiu da sua conta com segurança.")
    router.replace("/")
  }, [router, searchParams])

  return (
    <div className="min-h-screen w-full flex flex-col md:flex-row bg-background" role="main" aria-labelledby="login-title">
      <div className="fixed top-4 right-4 z-50">
        <Button asChild type="button" variant="outline" size="sm" className="rounded-xl gap-2">
          <Link href="/" aria-label="Acessar área pública">
            <BookOpen className="h-4 w-4" aria-hidden="true" />
            Público
          </Link>
        </Button>
      </div>
      {/* Visual Side - Hidden on mobile */}
      <div className="hidden md:flex md:w-1/2 bg-primary/5 items-center justify-center p-12 relative overflow-hidden">
        {/* Abstract background elements */}
        <div className="absolute top-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-primary/10 blur-[100px]" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-primary/5 blur-[80px]" />

        <div className="max-w-md space-y-6 relative z-10 text-center animate-in fade-in slide-in-from-bottom-4 duration-700">
          <div className="flex justify-center mb-8">
            {previewCompany ? (
              // Case 1: Company Selected
              previewCompany.logo ? (
                <div className="relative h-24 w-24">
                  <Image
                    src={previewCompany.logo}
                    alt={previewCompany.name}
                    fill
                    priority
                    className="object-contain transition-all duration-500 hover:scale-105"
                    sizes="96px"
                  />
                </div>
              ) : (
                <div className="h-20 w-20 bg-primary/20 rounded-2xl flex items-center justify-center text-primary font-bold text-3xl shadow-sm">
                  {previewCompany.name.charAt(0)}
                </div>
              )
            ) : (
              // Case 2: No Company Selected (Default generic branding or Logo if globally set?)
              // Ideally for SaaS login page with no tenant context, we show generic app logo or nothing specific
              <div className="h-20 w-20 bg-primary/10 rounded-2xl flex items-center justify-center text-primary font-bold text-3xl">
                B
              </div>
            )}
          </div>

          <H2 className="text-4xl lg:text-5xl border-none font-extrabold tracking-tight">
            {previewCompany ? (
              <>Bem-vindo ao <span className="text-primary">{previewCompany.name}</span></>
            ) : (
              "Bem-vindo"
            )}
          </H2>

          <P className="text-xl text-muted-foreground leading-relaxed">
            {previewCompany ? (
              "Acesse seu portal exclusivo e gerencie tudo em um só lugar."
            ) : (
              "Sua plataforma centralizada de gestão modular. Selecione sua empresa para começar."
            )}
          </P>
        </div>
      </div>

      {/* Form Side */}
      <div className="flex-1 flex items-center justify-center p-6 md:p-12">
        <div className="w-full max-w-sm space-y-8">
          <div className="md:hidden flex flex-col items-center gap-4 mb-8 text-center transition-all animate-in fade-in slide-in-from-top-4">
            {previewCompany && previewCompany.logo ? (
              <Image src={previewCompany.logo} alt={previewCompany.name} width={48} height={48} priority className="object-contain" />
            ) : (
              <div className="h-12 w-12 bg-primary rounded-xl hidden" />
            )}
            <H2 className="text-2xl border-none">{previewCompany ? previewCompany.name : "Login"}</H2>
          </div>

          <div className="space-y-2 text-center">
            <h1 id="login-title" className="text-3xl font-bold tracking-tight">{previewCompany ? "Login Corporativo" : "Acesso ao Sistema"}</h1>
            <p className="text-muted-foreground">
              {previewCompany ? `Entre com suas credenciais do ${previewCompany.name}` : "Selecione sua empresa e insira suas credenciais"}
            </p>
          </div>

          <div className="bg-card border rounded-2xl p-6 shadow-sm">
            <LoginForm onCompanyChange={(company) => setPreviewCompany(company)} />
          </div>
        </div>
      </div>
    </div>
  )
}
