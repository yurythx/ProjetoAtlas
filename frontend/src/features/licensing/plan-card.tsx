import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Check, Zap, Rocket, Crown, Star } from "lucide-react"
import { Plan } from "@/types"
import { cn } from "@/lib/utils"

interface PlanCardProps {
    plan: Plan
    isCurrent: boolean
    onUpgrade: (planId: number) => void
    isLoading?: boolean
}

export function PlanCard({ plan, isCurrent, onUpgrade, isLoading }: PlanCardProps) {
    const isFree = parseFloat(plan.price) === 0
    const isPro = plan.name.toLowerCase().includes('pro')
    const isEnterprise = plan.name.toLowerCase().includes('enterprise')

    const getIcon = () => {
        if (isFree) return <Zap className="h-6 w-6 text-primary" aria-hidden="true" />
        if (isPro) return <Rocket className="h-6 w-6 text-primary" aria-hidden="true" />
        if (isEnterprise) return <Crown className="h-6 w-6 text-primary" aria-hidden="true" />
        return <Star className="h-6 w-6 text-primary" aria-hidden="true" />
    }

    return (
        <div className="flex h-full transition-transform duration-300 hover:-translate-y-2">
            <Card className={cn(
                "relative flex flex-col overflow-hidden transition-all duration-500 w-full h-full",
                "glass-morphism border-white/5 shadow-2xl rounded-3xl",
                isCurrent ? "border-primary/40 ring-2 ring-primary/20 scale-105 z-20" : "hover:border-primary/20"
            )}>
                {isCurrent && (
                    <div className="absolute top-0 right-0">
                        <div className="bg-primary text-primary-foreground text-[10px] font-black uppercase tracking-widest px-4 py-1.5 rounded-bl-2xl shadow-lg">
                            Plano Ativo
                        </div>
                    </div>
                )}

                {isPro && !isCurrent && (
                    <div className="absolute top-4 left-4">
                        <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 text-[9px] font-black uppercase tracking-tighter">
                            Mais Popular
                        </Badge>
                    </div>
                )}

                <CardHeader className="pt-10 pb-6">
                    <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4 shadow-inner">
                        {getIcon()}
                    </div>
                    <CardTitle className="text-2xl font-black tracking-tighter uppercase">{plan.name}</CardTitle>
                    <CardDescription className="pt-2">
                        {isFree ? (
                            <span className="text-4xl font-black text-foreground tracking-tighter italic">FREE</span>
                        ) : (
                            <div className="flex items-baseline gap-1">
                                <span className="text-sm font-bold text-muted-foreground tracking-widest uppercase">R$</span>
                                <span className="text-4xl font-black text-foreground tracking-tighter">{plan.price}</span>
                                <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">/mês</span>
                            </div>
                        )}
                    </CardDescription>
                </CardHeader>

                <CardContent className="flex-1 space-y-6">
                    <div className="h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent" />
                    <ul className="space-y-4">
                        {plan.features.map((feature, index) => (
                            <li key={index} className="flex items-start gap-4">
                                <div className="h-5 w-5 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5 shadow-sm border border-primary/5">
                                    <Check className="h-3 w-3 text-primary stroke-[3]" aria-hidden="true" />
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/70">{feature.feature_name}</span>
                                    <span className="text-sm font-bold text-foreground/90">
                                        {feature.value === 'true' ? 'Acesso Total' : feature.value === 'unlimited' ? 'Ilimitado' : feature.value}
                                    </span>
                                </div>
                            </li>
                        ))}
                    </ul>
                </CardContent>

                <CardFooter className="pt-6 pb-8">
                    <Button
                        className={cn(
                            "w-full h-12 rounded-2xl font-black uppercase tracking-widest transition-all duration-500",
                            isCurrent
                                ? "bg-transparent border-2 border-primary/20 text-primary hover:bg-primary/5"
                                : "bg-primary hover:bg-primary/90 text-primary-foreground shadow-xl shadow-primary/20 hover:shadow-primary/30"
                        )}
                        onClick={() => onUpgrade(plan.id)}
                        disabled={isCurrent || isLoading}
                    >
                        {isCurrent ? "GERENCIAR PLANO" : "EU QUERO ESTE"}
                    </Button>
                </CardFooter>
            </Card>
        </div>
    )
}

function Badge({
    children,
    variant = 'default',
    className,
}: {
    children: React.ReactNode
    variant?: 'outline' | 'default'
    className?: string
}) {
    return (
        <span className={cn(
            "px-2 py-0.5 rounded-full text-[10px] font-bold border",
            variant === 'outline' ? "border-primary/20 text-primary" : "bg-primary text-primary-foreground",
            className
        )}>
            {children}
        </span>
    )
}
