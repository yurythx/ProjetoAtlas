"use client"

import { useTheme } from "@/components/theme-provider"
import { H3, P, Muted } from "@/components/ui/typography"
import { Button } from "@/components/ui/button"
import { Check, RotateCcw } from "lucide-react"
import { cn } from "@/lib/utils"

const palettes = [
    { id: 'django-green', name: 'Django Green', color: '#0C4B33' },
    { id: 'ocean-blue', name: 'Ocean Blue', color: '#0369A1' },
    { id: 'royal-purple', name: 'Royal Purple', color: '#7C3AED' },
    { id: 'sunset-orange', name: 'Sunset Orange', color: '#EA580C' },
    { id: 'forest-green', name: 'Forest Green', color: '#166534' },
    { id: 'slate-gray', name: 'Slate Gray', color: '#475569' },
]

export function UserThemeSelector() {
    const { 
        currentPalette, 
        updatePalette, 
        resetToTenantTheme, 
        isLoading, 
        isPublicRoute 
    } = useTheme()

    // Não exibir seletor em rotas públicas
    if (isPublicRoute) return null;

    if (isLoading) return <div role="status" aria-live="polite" aria-label="Carregando preferências de tema">Carregando preferências...</div>

    return (
        <div className="space-y-6">
            <div>
                <H3>Personalização de Tema</H3>
                <P className="text-muted-foreground mt-1">
                    Escolha uma paleta de cores para personalizar sua interface. Isso afetará apenas a sua visão do sistema.
                </P>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4" role="radiogroup" aria-label="Paletas de tema">
                {palettes.map((palette) => (
                    <button
                        key={palette.id}
                        onClick={() => updatePalette(palette.id)}
                        role="radio"
                        aria-checked={currentPalette === palette.id}
                        aria-label={palette.name}
                        className={cn(
                            "relative flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all hover:bg-accent",
                            currentPalette === palette.id
                                ? "border-primary bg-primary/5"
                                : "border-transparent bg-muted/50"
                        )}
                    >
                        <div
                            className="h-8 w-8 rounded-full shadow-inner"
                            style={{ backgroundColor: palette.color }}
                        />
                        <span className="text-sm font-medium">{palette.name}</span>
                        {currentPalette === palette.id && (
                            <div className="absolute top-2 right-2 p-0.5 rounded-full bg-primary text-white">
                                <Check className="h-3 w-3" aria-hidden="true" />
                            </div>
                        )}
                    </button>
                ))}
            </div>

            <div className="flex items-center justify-between pt-4 border-t">
                <Muted>Deseja voltar para as cores da empresa?</Muted>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={resetToTenantTheme}
                    className="gap-2"
                >
                    <RotateCcw className="h-4 w-4" aria-hidden="true" />
                    Restaurar padrão da empresa
                </Button>
            </div>
        </div>
    )
}
