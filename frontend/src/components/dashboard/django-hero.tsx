import { Button } from "@/components/ui/button"
import { H1, P } from "@/components/ui/typography"

interface DjangoHeroProps {
    title: string
    subtitle: string
    ctaText?: string
    ctaHref?: string
    secondaryCtaText?: string
    secondaryCtaHref?: string
}

export function DjangoHero({
    title,
    subtitle,
    ctaText = "Get Started",
    ctaHref = "/register",
    secondaryCtaText = "Documentation",
    secondaryCtaHref = "#",
}: DjangoHeroProps) {
    return (
        <section className="relative overflow-hidden bg-primary py-24 sm:py-32">
            {/* Abstract Background Elements */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-10">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-white blur-3xl animate-pulse" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[30%] h-[30%] rounded-full bg-white blur-3xl animate-pulse" style={{ animationDelay: '2s' }} />
            </div>

            <div className="container relative z-10 mx-auto px-6 text-center">
                <div className="max-w-3xl mx-auto">
                    <H1 className="text-white lg:text-6xl mb-6">
                        {title}
                    </H1>
                    <P className="text-white/80 text-xl lg:text-2xl mb-10 leading-relaxed font-normal mt-0">
                        {subtitle}
                    </P>
                    <div className="flex flex-wrap items-center justify-center gap-4">
                        <Button
                            size="lg"
                            variant="secondary"
                            className="px-8 text-primary font-bold hover:scale-105 transition-transform"
                            asChild
                        >
                            <a href={ctaHref}>{ctaText}</a>
                        </Button>
                        <Button
                            size="lg"
                            variant="outline"
                            className="px-8 text-white border-white/30 hover:bg-white/10 hover:border-white transition-all"
                            asChild
                        >
                            <a href={secondaryCtaHref}>{secondaryCtaText}</a>
                        </Button>
                    </div>
                </div>
            </div>
        </section>
    )
}
