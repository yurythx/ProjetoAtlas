"use client"

import * as React from "react"
import { Moon, Sun, Monitor, Check } from "lucide-react"
import { useTheme } from "next-themes"

import { Button } from "@/components/ui/button"
import { useBranding } from "@/components/theme-provider"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export function ThemeToggle() {
    const { theme, setTheme } = useTheme()
    const { isPublicRoute, updateDarkModePreference } = useBranding()
    const [mounted, setMounted] = React.useState(false)

    // Evitar erros de hidratação
    React.useEffect(() => {
        setMounted(true)
    }, [])

    if (!mounted) {
        return (
            <Button variant="ghost" size="icon" className="h-9 w-9">
                <div className="h-4 w-4" />
            </Button>
        )
    }

    const icon =
        theme === "light" ? (
            <Sun className="h-4 w-4 text-orange-500" aria-hidden="true" />
        ) : theme === "dark" ? (
            <Moon className="h-4 w-4 text-blue-400" aria-hidden="true" />
        ) : (
            <Monitor className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        )

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="h-9 w-9 relative overflow-hidden group glass-morphism border-0 transition-all" aria-label="Alternar tema">
                    <span className="transition-transform duration-300 group-hover:rotate-12">{icon}</span>
                    <span className="sr-only">Alternar tema</span>
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40 p-1 glass border-0">
                <DropdownMenuItem
                    onClick={() => {
                        setTheme("light")
                        if (!isPublicRoute) void updateDarkModePreference("light")
                    }}
                    className="flex items-center justify-between cursor-pointer"
                >
                    <div className="flex items-center gap-2">
                        <Sun className="h-4 w-4 text-orange-500" aria-hidden="true" />
                        <span>Claro</span>
                    </div>
                    {theme === "light" && <Check className="h-3.5 w-3.5 text-primary" aria-hidden="true" />}
                </DropdownMenuItem>
                <DropdownMenuItem
                    onClick={() => {
                        setTheme("dark")
                        if (!isPublicRoute) void updateDarkModePreference("dark")
                    }}
                    className="flex items-center justify-between cursor-pointer"
                >
                    <div className="flex items-center gap-2">
                        <Moon className="h-4 w-4 text-blue-400" aria-hidden="true" />
                        <span>Escuro</span>
                    </div>
                    {theme === "dark" && <Check className="h-3.5 w-3.5 text-primary" aria-hidden="true" />}
                </DropdownMenuItem>
                <DropdownMenuItem
                    onClick={() => {
                        setTheme("system")
                        if (!isPublicRoute) void updateDarkModePreference("system")
                    }}
                    className="flex items-center justify-between cursor-pointer"
                >
                    <div className="flex items-center gap-2">
                        <Monitor className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                        <span>Sistema</span>
                    </div>
                    {theme === "system" && <Check className="h-3.5 w-3.5 text-primary" aria-hidden="true" />}
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
