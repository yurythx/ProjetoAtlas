"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { api } from "@/lib/axios"
import { Plan, License } from "@/types"
import { PlanCard } from "@/features/licensing/plan-card"
import { H2, P } from "@/components/ui/typography"
import { Sparkles, ShieldCheck, Zap } from "lucide-react"
import Image from "next/image"
import dynamic from "next/dynamic"

const CheckoutModal = dynamic(
  () => import("@/features/licensing/checkout-modal").then((m) => m.CheckoutModal),
  { ssr: false }
)

export default function LicensingPage() {
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null)
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false)

  // Fetch Plans
  const { data: plans, isLoading: isLoadingPlans } = useQuery({
    queryKey: ['plans'],
    queryFn: async () => {
      const res = await api.get<Plan[]>('/api/licensing/plans/')
      return res.data
    }
  })

  const safePlans = Array.isArray(plans) ? plans : []

  // Fetch Current License
  const { data: license, isLoading: isLoadingLicense } = useQuery({
    queryKey: ['my-license'],
    queryFn: async () => {
      const res = await api.get<License[]>('/api/licensing/my-license/')
      return res.data[0] || null
    }
  })

  const handleUpgrade = (plan: Plan) => {
    setSelectedPlan(plan)
    setIsCheckoutOpen(true)
  }

  if (isLoadingPlans || isLoadingLicense) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <div className="h-12 w-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
        <p className="text-muted-foreground font-medium animate-pulse">Sincronizando planos e licenças...</p>
      </div>
    )
  }

  return (
    <div className="relative min-h-screen pb-20 overflow-hidden">
      {/* Background Decorative Elements */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-[120px] -z-10 animate-pulse" />
      <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-primary/5 rounded-full blur-[100px] -z-10" />

      <div className="max-w-7xl mx-auto px-6 pt-12 space-y-16 relative z-10">
        <header className="text-center space-y-6 max-w-3xl mx-auto">
          <div className="animate-in fade-in duration-300">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 mb-4">
                <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                <span className="text-[10px] font-black uppercase tracking-widest text-primary">Upgrade de Potência</span>
              </div>
          </div>

          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            <H2 className="border-none text-4xl md:text-5xl lg:text-6xl font-black tracking-tighter bg-clip-text text-transparent bg-gradient-to-b from-foreground to-foreground/50 leading-tight">
              O plano perfeito para o seu crescimento.
            </H2>
          </div>

          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            <P className="text-muted-foreground text-lg md:text-xl font-medium leading-relaxed">
              Liberte todo o potencial do seu tenant com recursos avançados, segurança reforçada e suporte dedicado.
            </P>
          </div>
        </header>

        <section className="grid grid-cols-1 md:grid-cols-3 gap-8 items-end pb-12">
          {safePlans.map((plan, index) => (
            <div key={plan.id} className="animate-in fade-in slide-in-from-bottom-2 duration-300" style={{ animationDelay: `${(0.1 + index * 0.05).toFixed(2)}s` }}>
              <PlanCard
                plan={plan}
                isCurrent={license?.plan === plan.id}
                onUpgrade={() => handleUpgrade(plan)}
              />
            </div>
          ))}
        </section>

        <div className="animate-in fade-in duration-300">
          <div className="glass-morphism rounded-3xl p-8 border border-white/5 shadow-2xl flex flex-col md:flex-row items-center justify-between gap-8 overflow-hidden relative group">
            <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700" />

            <div className="flex items-center gap-6 relative z-10">
              <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center text-primary shadow-inner">
                <ShieldCheck className="h-8 w-8" />
              </div>
              <div className="space-y-1">
                <h4 className="text-xl font-bold">Segurança & Conformidade</h4>
                <p className="text-sm text-muted-foreground max-w-md">
                  Todos os planos incluem criptografia de ponta a ponta e conformidade total com LGPD/GDPR.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-12 relative z-10">
              <div className="flex -space-x-4">
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className="h-10 w-10 rounded-full border-2 border-background bg-muted flex items-center justify-center overflow-hidden relative">
                    <Image src={`https://i.pravatar.cc/100?img=${i + 10}`} alt="User" fill className="object-cover" sizes="40px" />
                  </div>
                ))}
              </div>
              <div className="text-center md:text-left">
                <p className="text-sm font-bold">+500 Empresas</p>
                <p className="text-xs text-muted-foreground">Confiam no Atlas</p>
              </div>
            </div>
          </div>
        </div>

        <div className="text-center space-y-4 pb-20">
          <div className="flex items-center justify-center gap-8 opacity-50 grayscale hover:grayscale-0 transition-all duration-500">
            <Zap className="h-6 w-6" />
            <span className="font-black text-xl italic tracking-tighter">POWERED BY ATLAS</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Precisa de algo sob medida? <a href="#" className="font-bold text-primary hover:underline">Entre em contato para um plano Enterprise</a>.
          </p>
        </div>
      </div>

      {(isCheckoutOpen || selectedPlan) && (
        <CheckoutModal
          plan={selectedPlan}
          isOpen={isCheckoutOpen}
          onClose={() => setIsCheckoutOpen(false)}
        />
      )}
    </div>
  )
}
