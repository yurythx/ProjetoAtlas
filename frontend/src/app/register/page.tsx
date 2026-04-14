"use client"

import { useTheme } from "@/components/theme-provider"
import { H2, P } from "@/components/ui/typography"
import Link from "next/link"
import Image from "next/image"
import dynamic from "next/dynamic"
import { Skeleton } from "@/components/ui/skeleton"

const RegisterForm = dynamic(
  () => import("@/features/auth/register-form").then((m) => m.RegisterForm),
  {
    ssr: false,
    loading: () => (
      <div className="space-y-4" role="status" aria-live="polite" aria-label="Carregando cadastro">
        <Skeleton className="h-12 w-full rounded-xl" />
        <Skeleton className="h-12 w-full rounded-xl" />
        <Skeleton className="h-12 w-full rounded-xl" />
        <Skeleton className="h-12 w-full rounded-xl" />
        <Skeleton className="h-12 w-full rounded-xl" />
      </div>
    ),
  }
)

export default function RegisterPage() {
  const { logo, companyName } = useTheme()

  return (
    <div className="min-h-screen w-full flex flex-col md:flex-row bg-background" role="main" aria-labelledby="register-title">
      {/* Visual Side - Shared with Login */}
      <div className="hidden md:flex md:w-1/2 bg-primary/5 items-center justify-center p-12 relative overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-primary/10 blur-[100px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-primary/5 blur-[80px]" />

        <div className="max-w-md space-y-6 relative z-10 text-center">
          <div className="flex justify-center mb-8">
            {logo ? (
              <Image src={logo} alt={companyName || 'Logo'} width={64} height={64} priority className="object-contain" />
            ) : (
              <div className="h-16 w-16 bg-primary rounded-2xl flex items-center justify-center text-primary-foreground font-bold text-2xl">
                B
              </div>
            )}
          </div>
          <H2 className="text-4xl lg:text-5xl border-none">Junte-se à Elite</H2>
          <P className="text-xl text-muted-foreground">
            Comece agora a escala do seu negócio com a arquitetura Atlas. Modular, seguro e pensado para crescer.
          </P>
        </div>
      </div>

      {/* Form Side */}
      <div className="flex-1 flex items-center justify-center p-6 md:p-12">
        <div className="w-full max-w-md space-y-8">
          <div className="md:hidden flex flex-col items-center gap-4 mb-8 text-center">
            {logo ? (
              <Image src={logo} alt={companyName || 'Logo'} width={48} height={48} priority className="object-contain" />
            ) : (
              <div className="h-12 w-12 bg-primary rounded-xl" />
            )}
            <H2 className="text-2xl border-none">{companyName}</H2>
          </div>

          <div className="space-y-2">
            <h1 id="register-title" className="text-3xl font-bold tracking-tight">Crie sua Conta</h1>
            <p className="text-muted-foreground">
              Preencha os dados abaixo para registrar sua empresa na plataforma.
            </p>
          </div>

          <div className="bg-card border rounded-2xl p-8 shadow-sm">
            <RegisterForm />
          </div>

          <p className="text-center text-sm text-muted-foreground">
            Já possui uma conta?{" "}
            <Link href="/login" className="font-semibold text-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-md">
              Fazer login
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
