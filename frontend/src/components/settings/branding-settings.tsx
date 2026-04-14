"use client"

import { useState, useEffect } from "react"
import { useTheme } from "@/components/theme-provider"
import { api } from "@/lib/axios"
import { H3, P, Muted } from "@/components/ui/typography"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Upload, Check, Loader2, Globe, Facebook, Instagram, Linkedin, Twitter, Sparkles } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import { Separator } from "@/components/ui/separator"
import { motion } from "framer-motion"
import Image from "next/image"

const palettes = [
    { id: 'django-green', name: 'Django Green', color: '#0C4B33' },
    { id: 'ocean-blue', name: 'Ocean Blue', color: '#0369A1' },
    { id: 'royal-purple', name: 'Royal Purple', color: '#7C3AED' },
    { id: 'sunset-orange', name: 'Sunset Orange', color: '#EA580C' },
    { id: 'forest-green', name: 'Forest Green', color: '#166534' },
    { id: 'slate-gray', name: 'Slate Gray', color: '#475569' },
]

interface BrandingSettingsProps {
    isOnboarding?: boolean
}

export function BrandingSettings({ isOnboarding }: BrandingSettingsProps) {
    const { logo, icon, currentPalette, refreshConfig } = useTheme()
    const { toast } = useToast()

    const [isUploading, setIsUploading] = useState(false)
    const [selectedPalette, setSelectedPalette] = useState(currentPalette)
    const [footerText, setFooterText] = useState("")
    const [socialLinks, setSocialLinks] = useState({
        facebook: "",
        instagram: "",
        linkedin: "",
        twitter: ""
    })

    useEffect(() => {
        const controller = new AbortController()

        const fetchBranding = async () => {
            try {
                const res = await api.get('/api/core/branding/current/', {
                    signal: controller.signal
                })
                if (!controller.signal.aborted) {
                    setFooterText(res.data.footer_text || "")
                    setSocialLinks({
                        facebook: res.data.facebook_url || "",
                        instagram: res.data.instagram_url || "",
                        linkedin: res.data.linkedin_url || "",
                        twitter: res.data.twitter_url || ""
                    })
                    setSelectedPalette(res.data.theme_palette || currentPalette)
                }
            } catch {
            }
        }
        fetchBranding()

        return () => {
            controller.abort()
        }
    }, [currentPalette])

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'logo' | 'icon') => {
        const file = e.target.files?.[0]
        if (!file) return

        const formData = new FormData()
        formData.append(type, file)

        try {
            setIsUploading(true)
            await api.post(`/api/core/branding/upload-${type}/`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            })
            await refreshConfig()
            toast({
                title: "Sucesso!",
                description: `${type === 'logo' ? 'Logo' : 'Ícone'} atualizado com sucesso.`,
            })
        } catch {
            toast({
                title: "Erro no upload",
                description: "Não foi possível enviar a imagem. Tente novamente.",
                variant: "destructive"
            })
        } finally {
            setIsUploading(false)
        }
    }

    const handleSaveBranding = async () => {
        try {
            setIsUploading(true)
            await api.put(`/api/core/branding/update_current/`, {
                theme_palette: selectedPalette,
                footer_text: footerText,
                facebook_url: socialLinks.facebook,
                instagram_url: socialLinks.instagram,
                linkedin_url: socialLinks.linkedin,
                twitter_url: socialLinks.twitter
            })
            await refreshConfig()
            toast({
                title: "Configurações salvas",
                description: "As alterações de branding e rodapé foram aplicadas.",
            })
        } catch {
            toast({
                title: "Erro ao salvar",
                description: "Não foi possível salvar as configurações.",
                variant: "destructive"
            })
        } finally {
            setIsUploading(false)
        }
    }

    return (
        <div className="space-y-12 pb-6">
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-1"
            >
                <div className="flex items-center gap-2 mb-1">
                    <Sparkles className="h-5 w-5 text-primary" aria-hidden="true" />
                    <H3>Identidade Visual & White-label</H3>
                </div>
                <P className="text-muted-foreground text-sm max-w-2xl">
                    Personalize a experiência global do Atlas para sua equipe. Estas cores e logos definem a personalidade oficial da sua empresa no sistema.
                </P>
            </motion.div>

            {/* Upload Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="space-y-4">
                    <Label className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Logo da Empresa</Label>
                    <div className="glass-morphism group relative flex flex-col items-center justify-center rounded-3xl p-10 border shadow-sm transition-all hover:border-primary/30 hover:shadow-primary/5">
                        <div className="h-32 w-full flex items-center justify-center mb-6">
                            {logo ? (
                                <div className="relative h-24 w-full">
                                    <Image src={logo} alt="Logo preview" fill className="object-contain drop-shadow-md" sizes="(max-width: 768px) 100vw, 50vw" />
                                </div>
                            ) : (
                                <div className="h-20 w-20 rounded-2xl bg-primary/5 flex items-center justify-center border-2 border-dashed border-primary/20">
                                    <Upload className="h-8 w-8 text-primary/40" aria-hidden="true" />
                                </div>
                            )}
                        </div>
                        <Input
                            type="file"
                            className="hidden"
                            id="logo-upload"
                            onChange={(e) => handleFileUpload(e, 'logo')}
                            accept="image/*"
                            disabled={isUploading}
                        />
                        <Button variant="outline" size="sm" asChild disabled={isUploading} className="rounded-xl font-bold">
                            <label htmlFor="logo-upload" className="cursor-pointer">
                                {isUploading ? <Loader2 className="h-4 w-4 animate-spin mr-2" aria-hidden="true" /> : <Upload className="h-4 w-4 mr-2" aria-hidden="true" />}
                                Substituir Logo
                            </label>
                        </Button>
                        <Muted className="mt-4 text-[10px] text-center uppercase tracking-tight font-medium">Recomendado: PNG Transparente ou SVG (max 2MB)</Muted>
                    </div>
                </div>

                <div className="space-y-4">
                    <Label className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Ícone / Favicon</Label>
                    <div className="glass-morphism group relative flex flex-col items-center justify-center rounded-3xl p-10 border shadow-sm transition-all hover:border-primary/30 hover:shadow-primary/5">
                        <div className="h-32 w-full flex items-center justify-center mb-6">
                            <div className="h-20 w-20 rounded-2xl bg-primary/5 p-4 flex items-center justify-center border-2 border-dashed border-primary/20 ring-4 ring-background shadow-xl">
                                {icon ? (
                                    <Image src={icon} alt="Icon preview" width={80} height={80} className="object-contain" />
                                ) : (
                                    <Globe className="h-8 w-8 text-primary/40" aria-hidden="true" />
                                )}
                            </div>
                        </div>
                        <Input
                            type="file"
                            className="hidden"
                            id="icon-upload"
                            onChange={(e) => handleFileUpload(e, 'icon')}
                            accept="image/x-icon,image/png"
                            disabled={isUploading}
                        />
                        <Button variant="outline" size="sm" asChild disabled={isUploading} className="rounded-xl font-bold">
                            <label htmlFor="icon-upload" className="cursor-pointer">
                                {isUploading ? <Loader2 className="h-4 w-4 animate-spin mr-2" aria-hidden="true" /> : <Upload className="h-4 w-4 mr-2" aria-hidden="true" />}
                                Substituir Ícone
                            </label>
                        </Button>
                        <Muted className="mt-4 text-[10px] text-center uppercase tracking-tight font-medium">Recomendado: PNG ou ICO circular (32x32px)</Muted>
                    </div>
                </div>
            </div>

            <Separator className="bg-primary/10" />

            {/* Palette Selection */}
            <div className="space-y-8">
                <div>
                    <Label className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Paleta de Cores Corporativa</Label>
                    <P className="text-muted-foreground text-sm mt-1">
                        Defina a cor primária que será o padrão para todos os novos usuários vinculados à sua empresa.
                    </P>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                    {palettes.map((palette) => (
                        <button
                            key={palette.id}
                            onClick={() => setSelectedPalette(palette.id)}
                            className={cn(
                                "group relative flex flex-col items-center p-4 rounded-2xl border transition-all hover:bg-muted/50",
                                selectedPalette === palette.id
                                    ? "bg-primary/5 border-primary shadow-lg shadow-primary/5"
                                    : "bg-background border-border"
                            )}
                        >
                            <div
                                className="h-10 w-10 rounded-full mb-3 ring-4 ring-background shadow-lg transition-transform group-hover:scale-110"
                                style={{ backgroundColor: palette.color }}
                            />
                            <span className="text-[10px] font-bold uppercase tracking-wider">{palette.name}</span>
                            {selectedPalette === palette.id && (
                                <div className="absolute top-2 right-2 h-4 w-4 rounded-full bg-primary flex items-center justify-center">
                                    <Check className="h-2.5 w-2.5 text-primary-foreground" aria-hidden="true" />
                                </div>
                            )}
                        </button>
                    ))}
                </div>
            </div>

            <Separator className="bg-primary/10" />

            {/* Footer & Social */}
            <div className="space-y-8">
                <div>
                    <Label className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Rodapé & Presença Digital</Label>
                    <P className="text-muted-foreground text-sm mt-1">
                        Gerencie as informações públicas exibidas no portal e os links de conexão com seus usuários.
                    </P>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                    <div className="space-y-2 md:col-span-2">
                        <Label className="font-bold text-xs uppercase tracking-tighter">Texto do Rodapé (Copyright)</Label>
                        <Input
                            placeholder="Ex: © 2026 Minha Empresa. Todos os direitos reservados."
                            value={footerText}
                            onChange={(e) => setFooterText(e.target.value)}
                            className="rounded-xl border-primary/20 focus:border-primary transition-colors h-12"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label className="font-bold text-xs uppercase flex items-center gap-2">
                            <Facebook className="h-3 w-3 text-blue-600" aria-hidden="true" /> Facebook
                        </Label>
                        <Input
                            placeholder="https://facebook.com/empresa"
                            value={socialLinks.facebook}
                            onChange={(e) => setSocialLinks({ ...socialLinks, facebook: e.target.value })}
                            className="rounded-xl bg-muted/30 border-none h-11"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label className="font-bold text-xs uppercase flex items-center gap-2">
                            <Instagram className="h-3 w-3 text-pink-500" aria-hidden="true" /> Instagram
                        </Label>
                        <Input
                            placeholder="https://instagram.com/empresa"
                            value={socialLinks.instagram}
                            onChange={(e) => setSocialLinks({ ...socialLinks, instagram: e.target.value })}
                            className="rounded-xl bg-muted/30 border-none h-11"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label className="font-bold text-xs uppercase flex items-center gap-2">
                            <Linkedin className="h-3 w-3 text-blue-700" aria-hidden="true" /> LinkedIn
                        </Label>
                        <Input
                            placeholder="https://linkedin.com/company/empresa"
                            value={socialLinks.linkedin}
                            onChange={(e) => setSocialLinks({ ...socialLinks, linkedin: e.target.value })}
                            className="rounded-xl bg-muted/30 border-none h-11"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label className="font-bold text-xs uppercase flex items-center gap-2">
                            <Twitter className="h-3 w-3 text-sky-400" aria-hidden="true" /> Twitter (X)
                        </Label>
                        <Input
                            placeholder="https://twitter.com/empresa"
                            value={socialLinks.twitter}
                            onChange={(e) => setSocialLinks({ ...socialLinks, twitter: e.target.value })}
                            className="rounded-xl bg-muted/30 border-none h-11"
                        />
                    </div>
                </div>
            </div>

            {!isOnboarding && (
                <div className="flex justify-end pt-8 sticky bottom-0 bg-background border-t mt-4 -mx-6 px-6 py-4" role={isUploading ? "status" : undefined} aria-live={isUploading ? "polite" : undefined} aria-label={isUploading ? "Processando alterações de branding" : undefined}>
                    <Button variant="ghost" className="mr-4 rounded-xl font-bold" onClick={() => refreshConfig()}>
                        Restaurar Originais
                    </Button>
                    <Button size="lg" onClick={handleSaveBranding} disabled={isUploading} className="rounded-xl font-bold shadow-lg shadow-primary/20 px-10">
                        {isUploading ? <Loader2 className="h-4 w-4 animate-spin mr-2" aria-hidden="true" /> : <Check className="h-4 w-4 mr-2" aria-hidden="true" />}
                        Salvar Branding
                    </Button>
                </div>
            )}
        </div>
    )
}
