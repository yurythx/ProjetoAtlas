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
    <div className="space-y-16 pb-32 max-w-[1400px] mx-auto px-4 md:px-8">
      {/* Academy Banner */}
      <motion.div 
        initial={{ opacity: 0, y: -30 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-[3rem] bg-slate-950 p-12 md:p-20 text-center space-y-8 shadow-2xl border border-white/5"
      >
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_0%,rgba(59,130,246,0.15),transparent_50%)]" />
        <div className="absolute -left-20 -top-20 h-64 w-64 rounded-full bg-primary/10 blur-[100px]" />
        
        <div className="relative z-10 space-y-6">
          <div className="inline-flex items-center gap-2 px-6 py-2 rounded-full bg-white/5 border border-white/10 backdrop-blur-md shadow-xl">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
            </span>
            <span className="text-[10px] font-black tracking-[0.4em] uppercase text-slate-400">Knowledge Center</span>
          </div>
          
          <h1 className="text-4xl sm:text-6xl md:text-8xl font-black tracking-tighter leading-none text-white italic">
            ATLAS <span className="text-primary not-italic tracking-normal">ACADEMY</span>
          </h1>
          
          <p className="text-lg md:text-2xl text-slate-400 max-w-3xl mx-auto font-medium leading-relaxed">
            A convergência definitiva entre o framework ITIL v4 e a <span className="text-white font-bold">Gestão Autonômica de Valor</span>. 
            Não é mais sobre suporte; é sobre engenharia de resultados.
          </p>
        </div>
      </motion.div>

      {/* Core Pillars */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {[
          {
            title: "VALUE STREAM MAP",
            sub: "O Fluxo da Verdade",
            desc: "Abandone silos. No ITIL Version 5, cada pixel de trabalho é mapeado em um fluxo que gera valor real ao negócio. Transparência radical da demanda à entrega.",
            icon: Zap,
            color: "text-blue-500",
            bg: "bg-blue-500/10",
            border: "group-hover:border-blue-500/50"
          },
          {
            title: "EXPERIENCE AGREEMENT",
            sub: "Além do Cronômetro",
            desc: "SLA é o passado. O ITIL Atlas foca no XLA: a experiência percebida. Medimos o sentimento operacional para garantir que a tecnologia seja invisível e eficiente.",
            icon: Heart,
            color: "text-rose-500",
            bg: "bg-rose-500/10",
            border: "group-hover:border-rose-500/50"
          },
          {
            title: "AUTONOMIC OPS",
            sub: "IA de Quinta Geração",
            desc: "Inteligência que antecipa. Nossa camada de Autonomic AI resolve falhas em Swarming antes mesmo que o incidente impacte a produtividade do usuário final.",
            icon: Sparkles,
            color: "text-amber-500",
            bg: "bg-amber-500/10",
            border: "group-hover:border-amber-500/50"
          }
        ].map((pillar, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className={cn(
               "group relative flex flex-col p-8 rounded-[2.5rem] bg-card/40 backdrop-blur-sm border border-primary/5 transition-all hover:bg-card/60 hover:-translate-y-2",
               pillar.border
            )}
          >
            <div className={cn("h-16 w-16 rounded-2xl mb-6 flex items-center justify-center transition-transform group-hover:scale-110", pillar.bg)}>
              <pillar.icon className={cn("h-8 w-8", pillar.color)} />
            </div>
            <h3 className="text-2xl font-black tracking-tight mb-1">{pillar.title}</h3>
            <p className="text-xs font-bold text-primary mb-4 tracking-widest uppercase">{pillar.sub}</p>
            <p className="text-slate-500 font-medium leading-relaxed">{pillar.desc}</p>
          </motion.div>
        ))}
      </div>

      {/* Strategic Vision */}
      <motion.section 
        variants={container}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true }}
        className="space-y-12"
      >
        <div className="text-center space-y-4">
          <h2 className="text-3xl font-black tracking-tighter uppercase italic">O Manifesto Atlas</h2>
          <div className="h-1 w-20 bg-primary mx-auto rounded-full" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
          {[
            { 
              icon: LineChart, 
              title: "Visibilidade de Fluxo (Flow Health)", 
              desc: "Acompanhamento em tempo real da 'saúde' dos processos. Se um valor para, o sistema grita. Sem gargalos ocultos." 
            },
            { 
              icon: ShieldCheck, 
              title: "Foco em Produto Digital", 
              desc: "Paramos de gerenciar bilhetes. Começamos a cuidar de ativos digitais perenes e resilientes (Product over Service)." 
            },
            { 
              icon: Target, 
              title: "Swarming Root Cause First", 
              desc: "Resolução em rede imediata. Níveis de suporte 1, 2 e 3 colapsam em uma única célula de resolução dinâmica." 
            },
            { 
              icon: RefreshCcw, 
              title: "Melhoria Contínua por IA", 
              desc: "O CSI Register é alimentado por aprendizado de máquina, sugerindo automações baseadas em comportamentos repetitivos." 
            }
          ].map((item_data, idx) => (
            <motion.div key={idx} variants={item} className="flex gap-6 items-start group">
              <div className="h-14 w-14 rounded-2xl bg-slate-100 flex items-center justify-center shrink-0 group-hover:bg-primary group-hover:text-white transition-colors">
                <item_data.icon className="h-6 w-6" />
              </div>
              <div className="space-y-2">
                <h3 className="font-black text-xl tracking-tight">{item_data.title}</h3>
                <p className="text-slate-500 font-medium leading-relaxed">{item_data.desc}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </motion.section>

      {/* Footer Call to Action */}
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        whileInView={{ opacity: 1, scale: 1 }}
        className="relative overflow-hidden rounded-[3rem] bg-gradient-to-br from-primary to-blue-700 p-12 text-center text-white shadow-2xl shadow-primary/20"
      >
        <div className="absolute top-0 right-0 h-full w-1/3 bg-white/5 skew-x-[-20deg] translate-x-1/2" />
        
        <div className="relative z-10 space-y-6">
          <Layers className="h-16 w-16 mx-auto opacity-50 mb-4" />
          <h2 className="text-4xl font-black tracking-tighter">PRONTO PARA O PRÓXIMO NÍVEL?</h2>
          <p className="text-white/80 max-w-2xl mx-auto text-lg font-medium italic">
            O roadmap Atlas inclui Previsão de Falhas Autonômica e Realidade Aumentada para Ativos Físicos. 
            O futuro da TI não é reativo, é preditivo.
          </p>
          <div className="flex flex-wrap justify-center gap-4 pt-4">
             <button className="px-10 h-14 bg-white text-primary rounded-2xl font-black text-sm tracking-widest hover:bg-slate-100 transition-all shadow-xl active:scale-95 uppercase">
               Explorar Roadmap 2026
             </button>
             <button className="px-10 h-14 bg-white/10 text-white rounded-2xl font-black text-sm tracking-widest hover:bg-white/20 transition-all border border-white/20 uppercase">
               CSI Register
             </button>
          </div>
        </div>
      </motion.div>
    </div>
  )
}

function cn(...inputs: any[]) {
  return inputs.filter(Boolean).join(" ")
}
