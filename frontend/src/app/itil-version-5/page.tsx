"use client"

import { motion } from "framer-motion"
import { PageHeader } from "@/components/ui/page-header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { 
  Zap, 
  Heart, 
  Layers, 
  LineChart, 
  Sparkles, 
  ShieldCheck, 
  RefreshCcw,
  Target
} from "lucide-react"

export default function ITILVersion5Page() {
  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.1 }
    }
  }

  const item = {
    hidden: { y: 20, opacity: 0 },
    show: { y: 0, opacity: 1 }
  }

  return (
    <div className="space-y-12 pb-20">
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center space-y-4 max-w-3xl mx-auto"
      >
        <Badge variant="outline" className="px-4 py-1 text-primary border-primary/30 bg-primary/5 uppercase tracking-[0.3em] font-black">
          Standard Enterprise
        </Badge>
        <h1 className="text-4xl md:text-6xl font-black tracking-tighter bg-gradient-to-r from-primary via-primary/80 to-primary/40 bg-clip-text text-transparent italic">
          ITIL VERSION 5
        </h1>
        <p className="text-xl text-muted-foreground leading-relaxed">
          O Projeto Atlas não é apenas uma ferramenta; é a materialização da gestão baseada em Valor, Experiência e Inteligência Autonômica.
        </p>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="glass-morphism border-primary/20 bg-primary/5 relative overflow-hidden group">
          <div className="absolute -top-10 -right-10 h-32 w-32 bg-primary/10 rounded-full blur-3xl group-hover:bg-primary/20 transition-all" />
          <CardHeader>
            <Zap className="h-10 w-10 text-primary mb-2" />
            <CardTitle className="text-2xl">VSM</CardTitle>
            <p className="text-sm font-semibold text-primary/70 uppercase">Value Stream Mapping</p>
          </CardHeader>
          <CardContent className="text-muted-foreground leading-relaxed">
            No ITIL Version 5, abandonamos processos isolados. Tudo o que fazemos é parte de um fluxo de valor que transforma a demanda em realização real para o negócio.
          </CardContent>
        </Card>

        <Card className="glass-morphism border-primary/20 bg-primary/5 relative overflow-hidden group">
          <div className="absolute -top-10 -right-10 h-32 w-32 bg-primary/10 rounded-full blur-3xl group-hover:bg-primary/20 transition-all" />
          <CardHeader>
            <Heart className="h-10 w-10 text-rose-500 mb-2" />
            <CardTitle className="text-2xl">XLA</CardTitle>
            <p className="text-sm font-semibold text-rose-500/70 uppercase">Experience Level Agreement</p>
          </CardHeader>
          <CardContent className="text-muted-foreground leading-relaxed">
            O SLA (Tempo) é o mínimo. O XLA (Experiência) é o nosso alvo. Medimos o sentimento e a satisfação real do usuário em cada etapa do atendimento.
          </CardContent>
        </Card>

        <Card className="glass-morphism border-primary/20 bg-primary/5 relative overflow-hidden group">
          <div className="absolute -top-10 -right-10 h-32 w-32 bg-primary/10 rounded-full blur-3xl group-hover:bg-primary/20 transition-all" />
          <CardHeader>
            <Sparkles className="h-10 w-10 text-amber-500 mb-2" />
            <CardTitle className="text-2xl">Autonomic AI</CardTitle>
            <p className="text-sm font-semibold text-amber-500/70 uppercase">Intelligence Shift-Left</p>
          </CardHeader>
          <CardContent className="text-muted-foreground leading-relaxed">
            A IA não apenas sugere; ela previne. No ITIL Version 5, a tecnologia resolve problemas antes que o usuário precise abrir um chamado.
          </CardContent>
        </Card>
      </div>

      <motion.section 
        variants={container}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true }}
        className="space-y-8"
      >
        <div className="flex items-center gap-4">
          <div className="h-px flex-1 bg-border" />
          <h2 className="text-2xl font-bold tracking-tight">Por que aplicamos no Atlas?</h2>
          <div className="h-px flex-1 bg-border" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <motion.div variants={item} className="flex gap-4">
            <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
              <LineChart className="text-primary" />
            </div>
            <div>
              <h3 className="font-bold text-lg">Visibilidade de Valor</h3>
              <p className="text-muted-foreground">Monitoramos o "Flow Health". Se um card para, a IA detecta o gargalo no fluxo de valor imediatamente.</p>
            </div>
          </motion.div>

          <motion.div variants={item} className="flex gap-4">
            <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
              <ShieldCheck className="text-primary" />
            </div>
            <div>
              <h3 className="font-bold text-lg">Estabilidade de Produto</h3>
              <p className="text-muted-foreground">O ITIL v4 focava em serviços. O ITIL Version 5 foca em Produtos Digitais estáveis e resilientes.</p>
            </div>
          </motion.div>

          <motion.div variants={item} className="flex gap-4">
            <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
              <Target className="text-primary" />
            </div>
            <div>
              <h3 className="font-bold text-lg">Foco no Outcome</h3>
              <p className="text-muted-foreground">Não celebramos chamados fechados, celebramos problemas resolvidos definitivamente (Root Cause First).</p>
            </div>
          </motion.div>

          <motion.div variants={item} className="flex gap-4">
            <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
              <RefreshCcw className="text-primary" />
            </div>
            <div>
              <h3 className="font-bold text-lg">Melhoria Contínua Dinâmica</h3>
              <p className="text-muted-foreground">Cada atendimento gera dados para que a IA aprenda e melhore o próximo ciclo automaticamente.</p>
            </div>
          </motion.div>
        </div>
      </motion.section>

      <motion.div 
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        className="rounded-3xl border bg-gradient-to-b from-card to-background p-12 text-center space-y-6"
      >
        <Layers className="h-16 w-16 mx-auto text-primary opacity-50" />
        <h2 className="text-3xl font-black">Próximos Passos: Evolução Atlas</h2>
        <p className="text-muted-foreground max-w-2xl mx-auto">
          Nosso roadmap inclui integração total de Topologia de Ativos, Previsão de Falhas baseada em comportamento de rede e 
          o Centro de Swarming Inteligente. Estamos construindo o futuro da TI juntos.
        </p>
        <div className="flex justify-center gap-4">
           <Badge className="bg-primary hover:bg-primary/90 cursor-default px-6 py-2 rounded-full">ITIL Expert Version 5 Ready</Badge>
           <Badge className="bg-muted text-muted-foreground px-6 py-2 rounded-full">VSM Certification</Badge>
        </div>
      </motion.div>
    </div>
  )
}
