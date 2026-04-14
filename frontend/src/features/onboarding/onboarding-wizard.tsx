"use client"

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/axios"
import { Company } from "@/types"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardTitle } from "@/components/ui/card"
import { BrandingSettings } from "@/components/settings/branding-settings"
import { SmtpSettings } from "@/features/settings/smtp-settings"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ChevronRight, Rocket, Shield, Globe, Mail, Palette, Sparkles, ArrowRight, CheckCircle2 } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"

export function OnboardingWizard() {
    const queryClient = useQueryClient()
    const [step, setStep] = useState(0)
    const totalSteps = 5 // welcome + 4 internal

    const { data: company, isLoading } = useQuery({
        queryKey: ['current-company'],
        queryFn: async () => {
            const res = await api.get<Company>('/api/core/companies/current/')
            return res.data
        }
    })

    const completeMutation = useMutation({
        mutationFn: async () => {
            await api.post('/api/core/companies/complete_onboarding/')
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['current-company'] })
            window.location.reload()
        }
    })

    if (isLoading || !company) return null

    const handleNext = () => {
        if (step < totalSteps - 1) {
            setStep(step + 1)
        } else {
            completeMutation.mutate()
        }
    }

    const renderStep = () => {
        switch (step) {
            case 0:
                return (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="flex flex-col items-center justify-center py-12 text-center space-y-8"
                    >
                        <div className="relative">
                            <div className="absolute inset-0 bg-primary/20 blur-3xl rounded-full" aria-hidden="true" />
                            <div className="relative h-24 w-24 rounded-3xl bg-primary flex items-center justify-center shadow-2xl shadow-primary/20">
                                <Rocket className="h-12 w-12 text-primary-foreground animate-bounce" aria-hidden="true" />
                            </div>
                        </div>
                        <div className="space-y-3 max-w-md">
                            <h2 className="text-4xl font-black tracking-tight text-foreground">Welcome to Atlas</h2>
                            <p className="text-muted-foreground text-lg px-4">
                                Olá, <span className="text-primary font-bold">{company.name}</span>! Vamos configurar sua nova plataforma de inteligência em apenas alguns passos.
                            </p>
                        </div>
                        <div className="grid grid-cols-3 gap-4 w-full max-w-sm pt-4">
                            <WelcomeFeature icon={Palette} label="Identidade" />
                            <WelcomeFeature icon={Mail} label="Comunicação" />
                            <WelcomeFeature icon={Globe} label="Domínio" />
                        </div>
                        <Button size="lg" onClick={handleNext} className="rounded-full px-12 font-bold h-14 text-lg shadow-xl shadow-primary/20 group" aria-label="Começar setup">
                            Começar Setup <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" aria-hidden="true" />
                        </Button>
                    </motion.div>
                )
            case 1:
                return (
                    <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="space-y-8"
                    >
                        <StepHeader
                            icon={Shield}
                            title="Identidade da Plataforma"
                            description="Estes são seus dados fundamentais de identificação no ecossistema."
                        />
                        <div className="grid gap-6">
                            <div className="space-y-2 px-2">
                                <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground ml-1">Nome da Empresa</Label>
                                <Input value={company.name} readOnly className="h-12 rounded-xl bg-muted/30 border-none font-semibold text-lg" />
                            </div>
                            <div className="space-y-2 px-2">
                                <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground ml-1">Slug da URL (Ambiente)</Label>
                                <div className="relative">
                                    <Input value={company.slug} readOnly className="h-12 rounded-xl bg-muted/30 border-none font-semibold text-lg pr-32" />
                                    <div className="absolute inset-y-0 right-0 flex items-center pr-4">
                                <span className="text-xs font-bold text-primary/40" aria-hidden="true">.atlas.io</span>
                                    </div>
                                </div>
                                <p className="text-[10px] text-muted-foreground italic px-1">Este identificador não pode ser alterado após a criação.</p>
                            </div>
                        </div>
                    </motion.div>
                )
            case 2:
                return (
                    <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="space-y-6"
                    >
                        <StepHeader
                            icon={Palette}
                            title="Identidade Visual (White-label)"
                            description="Personalize cores e logos para que a plataforma tenha a cara do seu negócio."
                        />
                        <div className="glass-morphism rounded-3xl p-6">
                            <BrandingSettings isOnboarding />
                        </div>
                    </motion.div>
                )
            case 3:
                return (
                    <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="space-y-6"
                    >
                        <StepHeader
                            icon={Mail}
                            title="Comunicação Corporativa"
                            description="Configure seu SMTP para que os e-mails do sistema usem seu próprio domínio."
                        />
                        <div className="glass-morphism rounded-3xl p-6">
                            <SmtpSettings isOnboarding />
                        </div>
                    </motion.div>
                )
            case 4:
                return (
                    <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="space-y-8"
                    >
                        <StepHeader
                            icon={Globe}
                            title="Domínio Customizado"
                            description="Pronto para usar seu próprio endereço web (ex: app.suaempresa.com)?"
                        />

                        <div className="space-y-6">
                            <div className="space-y-2 px-2">
                                <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground ml-1">Seu Domínio de Produção</Label>
                                <Input
                                    placeholder="ex: painel.minhaempresa.com.br"
                                    defaultValue={company.domain || ''}
                                    className="h-14 rounded-2xl border-primary/20 text-lg"
                                    onBlur={async (e) => {
                                        const val = (e.target as HTMLInputElement).value
                                        if (val !== company.domain) {
                                            await api.patch(`/api/core/companies/${company.slug}/`, { domain: val || null })
                                            queryClient.invalidateQueries({ queryKey: ['current-company'] })
                                        }
                                    }}
                                />
                            </div>

                            <div className="bg-primary/5 border border-primary/10 p-6 rounded-3xl flex gap-4">
                                <Sparkles className="h-6 w-6 text-primary shrink-0 mt-1" aria-hidden="true" />
                                <div className="space-y-1">
                                    <h4 className="font-bold text-sm">Quase lá!</h4>
                                    <p className="text-xs text-muted-foreground leading-relaxed">
                                        Para que este domínio funcione, lembre-se de configurar um registro **CNAME** apontando para `cname.atlas.io` no seu provedor de DNS.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )
            default:
                return null
        }
    }

    return (
        <div className="fixed inset-0 z-[100] bg-background/85 backdrop-blur-3xl flex items-center justify-center p-4">
            <Card className="w-full max-w-5xl shadow-2xl overflow-hidden glass-morphism border-t-4 border-t-primary">
                {step > 0 && (
                    <div className="h-1 bg-muted" aria-hidden="true">
                        <motion.div
                            className="h-full bg-primary shadow-[0_0_10px_rgba(var(--primary),0.5)]"
                            initial={{ width: 0 }}
                            animate={{ width: `${(step / (totalSteps - 1)) * 100}%` }}
                        />
                    </div>
                )}

                <CardContent className={cn(
                    "custom-scrollbar",
                    step === 0 ? "p-12" : "p-10 min-h-[500px] max-h-[75vh] overflow-y-auto"
                )}>
                    <AnimatePresence mode="wait">
                        {renderStep()}
                    </AnimatePresence>
                </CardContent>

                {step > 0 && (
                    <CardFooter className="flex justify-between border-t bg-muted/10 p-6 px-10">
                        <Button
                            variant="ghost"
                            onClick={() => setStep(Math.max(0, step - 1))}
                            disabled={completeMutation.isPending}
                            className="rounded-xl font-bold gap-2"
                        >
                            Anterior
                        </Button>
                        <div className="flex items-center gap-6">
                            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground hidden sm:block">
                                Passo {step} de {totalSteps - 1}
                            </span>
                            <Button
                                size="lg"
                                onClick={handleNext}
                                disabled={completeMutation.isPending}
                                className="rounded-xl px-10 font-bold gap-2 shadow-lg shadow-primary/10"
                            >
                                {step === totalSteps - 1 ? 'Lançar Plataforma' : 'Continuar Setup'}
                                {step === totalSteps - 1 ? <CheckCircle2 className="h-5 w-5" aria-hidden="true" /> : <ChevronRight className="h-5 w-5" aria-hidden="true" />}
                            </Button>
                        </div>
                    </CardFooter>
                )}
            </Card>
        </div>
    )
}

import type { ComponentType } from "react"

function WelcomeFeature({ icon: Icon, label }: { icon: ComponentType<{ className?: string }>, label: string }) {
    return (
        <div className="flex flex-col items-center gap-2">
            <div className="h-12 w-12 rounded-2xl glass-morphism border-0 flex items-center justify-center shadow-sm">
                <Icon className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</span>
        </div>
    )
}

function StepHeader({ icon: Icon, title, description }: { icon: ComponentType<{ className?: string }>, title: string, description: string }) {
    return (
        <div className="flex items-center gap-5 pb-2">
            <div className="h-14 w-14 rounded-2xl glass-morphism border-0 flex items-center justify-center shrink-0 shadow-md">
                <Icon className="h-7 w-7 text-primary" aria-hidden="true" />
            </div>
            <div>
                <CardTitle className="text-2xl font-black tracking-tight">{title}</CardTitle>
                <CardDescription className="text-base text-muted-foreground italic">{description}</CardDescription>
            </div>
        </div>
    )
}
