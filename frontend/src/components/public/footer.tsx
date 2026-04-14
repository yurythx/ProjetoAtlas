"use client"

import { useTheme } from "@/components/theme-provider"
import { Facebook, Instagram, Linkedin, Twitter } from "lucide-react"

export function PublicFooter() {
    const { companyName, footerText, socialLinks } = useTheme()
    const year = new Date().getFullYear()

    return (
        <footer className="border-t bg-muted/30" role="contentinfo" aria-label="Rodapé">
            <div className="mx-auto max-w-7xl px-6 md:px-8 py-12">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center justify-between">
                    <div className="space-y-4">
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                            {footerText || `© ${year} ${companyName}. Todos os direitos reservados.`}
                        </p>

                        <div className="flex items-center gap-4" aria-label="Redes sociais">
                            {socialLinks.facebook && (
                                <a href={socialLinks.facebook} target="_blank" rel="noopener noreferrer" className="p-2 rounded-full bg-background border hover:text-primary transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2" aria-label={`Facebook de ${companyName || 'empresa'}`}>
                                    <Facebook className="h-4 w-4" aria-hidden="true" />
                                </a>
                            )}
                            {socialLinks.instagram && (
                                <a href={socialLinks.instagram} target="_blank" rel="noopener noreferrer" className="p-2 rounded-full bg-background border hover:text-primary transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2" aria-label={`Instagram de ${companyName || 'empresa'}`}>
                                    <Instagram className="h-4 w-4" aria-hidden="true" />
                                </a>
                            )}
                            {socialLinks.linkedin && (
                                <a href={socialLinks.linkedin} target="_blank" rel="noopener noreferrer" className="p-2 rounded-full bg-background border hover:text-primary transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2" aria-label={`LinkedIn de ${companyName || 'empresa'}`}>
                                    <Linkedin className="h-4 w-4" aria-hidden="true" />
                                </a>
                            )}
                            {socialLinks.twitter && (
                                <a href={socialLinks.twitter} target="_blank" rel="noopener noreferrer" className="p-2 rounded-full bg-background border hover:text-primary transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2" aria-label={`Twitter de ${companyName || 'empresa'}`}>
                                    <Twitter className="h-4 w-4" aria-hidden="true" />
                                </a>
                            )}
                        </div>
                    </div>

                    <nav className="flex items-center gap-8 text-sm text-muted-foreground font-medium md:justify-end" role="navigation" aria-label="Links do rodapé">
                        <a href="#" className="hover:text-primary transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-md">Privacidade</a>
                        <a href="#" className="hover:text-primary transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-md">Termos de Uso</a>
                        <a href="#" className="hover:text-primary transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-md">Cookies</a>
                    </nav>
                </div>
            </div>
        </footer>
    )
}
