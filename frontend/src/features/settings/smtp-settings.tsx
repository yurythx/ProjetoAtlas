"use client"

import { useState, useEffect } from "react"
import { api } from "@/lib/axios"
import { H3, P, Muted } from "@/components/ui/typography"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Loader2, Mail, Send, CheckCircle2, ShieldCheck, Lock, Globe } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import { motion } from "framer-motion"
 

interface SmtpSettingsProps {
    isOnboarding?: boolean
}

export function SmtpSettings({ isOnboarding }: SmtpSettingsProps) {
    const { toast } = useToast()
    const [isLoading, setIsLoading] = useState(false)
    const [isTesting, setIsTesting] = useState(false)
    const [config, setConfig] = useState({
        use_custom_smtp: false,
        smtp_host: "",
        smtp_port: 587,
        smtp_user: "",
        smtp_password: "",
        smtp_use_tls: true,
        from_email: ""
    })

    useEffect(() => {
        const controller = new AbortController()

        const fetchConfig = async () => {
            try {
                setIsLoading(true)
                const res = await api.get('/api/core/branding/email_config/', {
                    signal: controller.signal
                })
                const data = res.data
                if (!controller.signal.aborted) {
                    setConfig({
                        use_custom_smtp: data.use_custom_smtp ?? false,
                        smtp_host: data.smtp_host ?? "",
                        smtp_port: data.smtp_port ?? 587,
                        smtp_user: data.smtp_user ?? "",
                        smtp_password: "",
                        smtp_use_tls: data.smtp_use_tls ?? true,
                        from_email: data.from_email ?? ""
                    })
                }
            } catch {
            } finally {
                if (!controller.signal.aborted) {
                    setIsLoading(false)
                }
            }
        }
        fetchConfig()

        return () => {
            controller.abort()
        }
    }, [])

    const handleSave = async () => {
        try {
            setIsLoading(true)
            const payload: Record<string, unknown> = { ...config }
            if (!String(config.smtp_password || "").trim()) {
                delete payload.smtp_password
            }
            await api.put('/api/core/branding/email_config/', payload)
            toast({
                title: "Configurações salvas",
                description: "As configurações de SMTP foram atualizadas com sucesso.",
            })
        } catch {
            toast({
                title: "Erro ao salvar",
                description: "Não foi possível salvar as configurações de e-mail.",
                variant: "destructive"
            })
        } finally {
            setIsLoading(false)
        }
    }

    const handleTest = async () => {
        try {
            setIsTesting(true)
            const res = await api.post('/api/core/branding/test_smtp/')
            toast({
                title: "E-mail enviado!",
                description: res.data.message || "Verifique sua caixa de entrada.",
            })
        } catch (error: unknown) {
            const description =
                typeof error === 'object' && error !== null
                    ? (error as { response?: { data?: { error?: string } } }).response?.data?.error || "Erro desconhecido ao enviar e-mail."
                    : "Erro desconhecido ao enviar e-mail."
            toast({
                title: "Falha no teste",
                description,
                variant: "destructive"
            })
        } finally {
            setIsTesting(false)
        }
    }

    if (isLoading && !config.smtp_host) {
        return (
            <div className="flex items-center justify-center p-24" role="status" aria-live="polite" aria-label="Carregando configurações de e-mail">
                <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
            </div>
        )
    }

    return (
        <div className="space-y-10 pb-6">
            <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-start justify-between gap-6"
            >
                <div className="space-y-1">
                    <div className="flex items-center gap-2 mb-1">
                        <Mail className="h-5 w-5 text-primary" aria-hidden="true" />
                        <H3>Comunicação Enterprise (SMTP)</H3>
                    </div>
                    <P className="text-muted-foreground text-sm max-w-2xl">
                        Ative seu próprio servidor de e-mail para que notificações de boas-vindas e alertas sejam enviados com sua identidade oficial.
                    </P>
                </div>
                <div className="glass-morphism px-4 py-3 rounded-2xl border flex items-center gap-3 shadow-sm bg-primary/5">
                    <Switch
                        id="use-custom"
                        checked={config.use_custom_smtp}
                        onCheckedChange={(val) => setConfig({ ...config, use_custom_smtp: val })}
                        className="data-[state=checked]:bg-primary"
                    />
                    <Label htmlFor="use-custom" className="font-bold text-xs uppercase cursor-pointer">
                        SMTP Próprio
                    </Label>
                </div>
            </motion.div>

            <div className={cn(
                "grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6 transition-all duration-500",
                !config.use_custom_smtp && "opacity-30 blur-[2px] pointer-events-none grayscale"
            )}>
                <div className="space-y-2">
                    <Label htmlFor="smtp-host" className="font-bold text-xs uppercase flex items-center gap-2">
                        <Globe className="h-3 w-3" aria-hidden="true" /> Host do Servidor
                    </Label>
                    <Input
                        id="smtp-host"
                        placeholder="smtp.exemplo.com"
                        value={config.smtp_host || ""}
                        onChange={(e) => setConfig({ ...config, smtp_host: e.target.value })}
                        className="rounded-xl h-12"
                    />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="smtp-port" className="font-bold text-xs uppercase">Porta</Label>
                    <Input
                        id="smtp-port"
                        type="number"
                        placeholder="587"
                        value={config.smtp_port}
                        onChange={(e) => {
                            const parsed = Number(e.target.value)
                            setConfig({ ...config, smtp_port: Number.isFinite(parsed) ? parsed : 587 })
                        }}
                        className="rounded-xl h-12"
                    />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="smtp-user" className="font-bold text-xs uppercase flex items-center gap-2">
                        <Mail className="h-3 w-3" aria-hidden="true" /> Usuário de Autenticação
                    </Label>
                    <Input
                        id="smtp-user"
                        placeholder="contato@empresa.com"
                        value={config.smtp_user || ""}
                        onChange={(e) => setConfig({ ...config, smtp_user: e.target.value })}
                        className="rounded-xl h-12"
                    />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="smtp-password" className="font-bold text-xs uppercase flex items-center gap-2">
                        <Lock className="h-3 w-3" aria-hidden="true" /> Senha / Token API
                    </Label>
                    <Input
                        id="smtp-password"
                        type="password"
                        placeholder="••••••••••••"
                        value={config.smtp_password || ""}
                        onChange={(e) => setConfig({ ...config, smtp_password: e.target.value })}
                        className="rounded-xl h-12"
                    />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="from-email" className="font-bold text-xs uppercase">E-mail de Envio (From)</Label>
                    <Input
                        id="from-email"
                        placeholder="suporte@empresa.com"
                        value={config.from_email || ""}
                        onChange={(e) => setConfig({ ...config, from_email: e.target.value })}
                        className="rounded-xl h-12"
                    />
                    <Muted className="text-[10px] italic">Deve ser um endereço autorizado no seu provedor.</Muted>
                </div>
                <div className="flex items-center space-x-3 h-full pt-6">
                    <div className="glass-morphism px-4 py-3 rounded-2xl border flex items-center gap-3">
                        <Switch
                            id="use-tls"
                            checked={config.smtp_use_tls}
                            onCheckedChange={(val) => setConfig({ ...config, smtp_use_tls: val })}
                        />
                        <Label htmlFor="use-tls" className="font-bold text-xs uppercase cursor-pointer">Usar TLS / SSL</Label>
                    </div>
                </div>
            </div>

            {!config.use_custom_smtp && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="bg-primary/5 border border-primary/20 p-6 rounded-3xl flex gap-4 items-center"
                >
                    <div className="h-10 w-10 rounded-2xl bg-primary/10 flex items-center justify-center">
                        <ShieldCheck className="h-6 w-6 text-primary" aria-hidden="true" />
                    </div>
                    <div className="flex-1">
                        <h4 className="font-bold text-sm text-foreground">Distribuição Padrão Ativa</h4>
                        <p className="text-xs text-muted-foreground italic">
                            O sistema está utilizando o túnel de mensagens seguro do Atlas. Ative o SMTP próprio para usar seu domínio customizado.
                        </p>
                    </div>
                </motion.div>
            )}

            {!isOnboarding && (
                <div
                    className="flex flex-col md:flex-row gap-4 justify-between pt-10 border-t sticky bottom-0 bg-background -mx-6 px-6 py-4 mt-4"
                    role={(isTesting || isLoading) ? "status" : undefined}
                    aria-live={(isTesting || isLoading) ? "polite" : undefined}
                    aria-label={(isTesting || isLoading) ? (isTesting ? "Testando conexão SMTP" : "Aplicando configurações de e-mail") : undefined}
                >
                    <Button
                        variant="ghost"
                        onClick={handleTest}
                        disabled={isTesting || !config.use_custom_smtp || !config.smtp_host}
                        className="rounded-xl font-bold"
                    >
                        {isTesting ? <Loader2 className="h-4 w-4 animate-spin mr-2" aria-hidden="true" /> : <Send className="h-4 w-4 mr-2" aria-hidden="true" />}
                        Enviar Teste de Conexão
                    </Button>
                    <div className="flex gap-3">
                        <Button size="lg" onClick={handleSave} disabled={isLoading} className="rounded-xl font-bold px-10 shadow-lg shadow-primary/20">
                            {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4 mr-2" aria-hidden="true" />}
                            Aplicar Configurações
                        </Button>
                    </div>
                </div>
            )}
        </div>
    )
}

 
