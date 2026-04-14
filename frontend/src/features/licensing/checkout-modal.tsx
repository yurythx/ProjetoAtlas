"use client"

import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/axios"
import { Plan } from "@/types"
import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { CreditCard, ShieldCheck, Loader2, CheckCircle2 } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import Image from "next/image"

interface CheckoutModalProps {
    plan: Plan | null
    isOpen: boolean
    onClose: () => void
}

export function CheckoutModal({ plan, isOpen, onClose }: CheckoutModalProps) {
    const { toast } = useToast()
    const queryClient = useQueryClient()
    const [step, setStep] = useState<'details' | 'processing' | 'success'>('details')

    const purchaseMutation = useMutation({
        mutationFn: async (planId: number) => {
            // Simulate processing time
            setStep('processing')
            await new Promise(resolve => setTimeout(resolve, 2500))

            const res = await api.post(`/api/licensing/my-license/checkout/`, {
                plan_id: planId
            })
            return res.data
        },
        onSuccess: () => {
            setStep('success')
            queryClient.invalidateQueries({ queryKey: ['my-license'] })
            queryClient.invalidateQueries({ queryKey: ['plans'] })
            toast({
                title: "Plano Ativado!",
                description: `Você agora está no plano ${plan?.name}. Aproveite seus novos recursos.`,
            })
        },
        onError: () => {
            setStep('details')
            toast({
                title: "Falha no Pagamento",
                description: "Ocorreu um erro ao processar seu pagamento. Tente novamente.",
                variant: "destructive"
            })
        }
    })

    const handleConfirm = () => {
        if (plan) {
            purchaseMutation.mutate(plan.id)
        }
    }

    if (!plan) return null

    return (
        <Dialog open={isOpen} onOpenChange={(open) => {
            if (!open && !purchaseMutation.isPending) {
                onClose()
                // Reset state after closing
                setTimeout(() => setStep('details'), 300)
            }
        }}>
            <DialogContent className="w-[calc(100vw-1.5rem)] sm:w-auto sm:max-w-[480px] max-h-[calc(100vh-1.5rem)] overflow-hidden glass-morphism border-0 shadow-2xl p-0 grid grid-rows-[auto_1fr_auto]">
                <DialogHeader className="border-b bg-muted/30 px-4 py-4 text-left sm:px-6 sm:py-5">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                            <CreditCard className="h-5 w-5" aria-hidden="true" />
                        </div>
                        <div>
                            <DialogTitle className="text-xl font-black uppercase tracking-tighter">Finalizar Upgrade</DialogTitle>
                            <DialogDescription className="text-xs">Assinatura Segura processada pelo Atlas Pay</DialogDescription>
                        </div>
                    </div>
                </DialogHeader>

                <div className="min-h-0 overflow-y-auto">
                    {step === 'details' ? (
                        <div className="px-4 py-4 sm:px-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                            <div className="space-y-6">
                                <div className="p-4 rounded-xl bg-primary/5 border border-primary/10 flex items-center justify-between">
                                    <div>
                                        <p className="text-[10px] font-black uppercase tracking-widest text-primary/70">Plano Selecionado</p>
                                        <h4 className="text-lg font-bold">{plan.name}</h4>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[10px] font-black uppercase tracking-widest text-primary/70">Preço Mensal</p>
                                        <h4 className="text-xl font-bold">R$ {plan.price}</h4>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Número do Cartão</Label>
                                        <div className="relative">
                                            <Input
                                                defaultValue="4242 4242 4242 4242"
                                                className="bg-background/90 font-mono tracking-widest"
                                                readOnly
                                            />
                                            <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                                <Image
                                                    src="https://upload.wikimedia.org/wikipedia/commons/5/5e/Visa_Inc._logo.svg"
                                                    alt="Visa"
                                                    width={16}
                                                    height={16}
                                                    className="opacity-50"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Validade</Label>
                                            <Input defaultValue="12/28" className="bg-background/90 text-center" readOnly />
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">CVC</Label>
                                            <Input defaultValue="***" className="bg-background/90 text-center" readOnly />
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2 text-[10px] text-muted-foreground bg-muted/30 p-2 rounded-lg justify-center">
                                    <ShieldCheck className="h-3 w-3 text-green-500" aria-hidden="true" />
                                    Ambiente seguro com criptografia de ponta a ponta
                                </div>
                            </div>
                        </div>
                    ) : step === 'processing' ? (
                        <div
                            className="p-12 flex flex-col items-center justify-center text-center space-y-6 animate-in fade-in zoom-in duration-300"
                            role="status"
                            aria-live="polite"
                            aria-label="Processando pagamento"
                        >
                            <div className="relative">
                                <Loader2 className="h-16 w-16 text-primary animate-spin" aria-hidden="true" />
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <CreditCard className="h-6 w-6 text-primary/50" aria-hidden="true" />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <h3 className="text-xl font-black uppercase tracking-tighter">Processando Pagamento</h3>
                                <p className="text-sm text-muted-foreground">Validando dados do cartão e ativando sua licença...</p>
                            </div>
                        </div>
                    ) : (
                        <div className="p-12 flex flex-col items-center justify-center text-center space-y-6 animate-in fade-in zoom-in duration-300">
                            <div className="h-20 w-20 rounded-full bg-green-500/10 flex items-center justify-center mb-4">
                                <CheckCircle2 className="h-12 w-12 text-green-500" aria-hidden="true" />
                            </div>
                            <div className="space-y-2">
                                <h3 className="text-2xl font-black uppercase tracking-tighter text-green-500">Sucesso Absoluto!</h3>
                                <p className="text-sm text-muted-foreground">Seu plano foi atualizado com sucesso. O sistema está liberando seus novos recursos agora mesmo.</p>
                            </div>
                        </div>
                    )}
                </div>

                {step === "details" ? (
                    <DialogFooter className="border-t bg-background/60 px-4 py-4 sm:px-6">
                        <Button variant="outline" type="button" onClick={onClose} disabled={purchaseMutation.isPending}>
                            Cancelar
                        </Button>
                        <Button
                            className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold px-8 shadow-lg shadow-primary/20"
                            onClick={handleConfirm}
                            disabled={purchaseMutation.isPending}
                        >
                            Confirmar Assinatura
                        </Button>
                    </DialogFooter>
                ) : (
                    <DialogFooter className="border-t bg-background/60 px-4 py-4 sm:px-6">
                        <Button
                            className="w-full bg-green-500 hover:bg-green-600 font-black uppercase tracking-widest"
                            onClick={onClose}
                            disabled={purchaseMutation.isPending}
                        >
                            {step === "success" ? "Começar a Usar" : "Aguarde..."}
                        </Button>
                    </DialogFooter>
                )}
            </DialogContent>
        </Dialog>
    )
}
