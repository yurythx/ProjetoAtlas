"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { PageHeader } from "@/components/ui/page-header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { 
  Zap, 
  Heart, 
  Layers, 
  LineChart, 
  Sparkles, 
  ShieldCheck, 
  RefreshCcw,
  Target,
  ArrowRight,
  BookOpen,
  MessageSquare,
  Shield,
  Search,
  Activity,
  Network,
  Cpu,
  Fingerprint,
  Radio,
  Globe,
  Waves
} from "lucide-react"
import { cn } from "@/lib/utils"

export default function ITILVersion5Page() {
  const [activeModule, setActiveModule] = useState<string | null>(null)

  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.1 }
    }
  }

  const modules = [
    {
      id: "vsm",
      title: "Value Stream Mapping (VSM)",
      icon: LineChart,
      color: "text-blue-500",
      bg: "bg-blue-500/10",
      content: "O VSM no Atlas não é apenas um gráfico; é a espinha dorsal da operação. Mapeamos desde a Demanda inicial até a Realização de Valor, identificando gargalos e tempo de residência em tempo real."
    },
    {
      id: "swarm",
      title: "Swarming & Colaboração",
      icon: Network,
      color: "text-purple-500",
      bg: "bg-purple-500/10",
      content: "Adeus N1/N2/N3. O Atlas implementa o Swarming nativo, permitindo colapsar os níveis de suporte em uma única célula de resolução dinâmica através das War Rooms (Swarms)."
    },
    {
      id: "xla",
      title: "Experience Agreement (XLA)",
      icon: Heart,
      color: "text-rose-500",
      bg: "bg-rose-500/10",
      content: "Medimos o que realmente importa. Enquanto o SLA foca no tempo, o XLA foca no sentimento e na utilidade percebida pelo usuário final. Engenharia de valor através da percepção humana."
    },
    {
      id: "csi",
      title: "CSI Register (Melhoria Contínua)",
      icon: RefreshCcw,
      color: "text-emerald-500",
      bg: "bg-emerald-500/10",
      content: "Cada falha é uma oportunidade. O Registro de Melhoria Contínua (CSI) permite transformar problemas recorrentes em projetos de automação e otimização estrutural."
    },
    {
      id: "ai",
      title: "IA Governance Engine",
      icon: Sparkles,
      color: "text-amber-500",
      bg: "bg-amber-500/10",
      content: "Nossa IA não é apenas um chat; ela monitora o fluxo de valor 24/7, detectando riscos de estagnação, calculando scores de governança e sugerindo a 'Próxima Melhor Ação' (Next Best Action)."
    }
  ]

  return (
    <div className="space-y-32 pb-48 max-w-[1600px] mx-auto px-4 md:px-12 pt-12 overflow-hidden">
      {/* Cinematic Hero Section */}
      <motion.div 
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
        className="relative overflow-hidden rounded-[5rem] bg-slate-950 p-16 md:p-32 text-center space-y-12 shadow-[0_64px_128px_-32px_rgba(0,0,0,0.8)] border border-white/5 group"
      >
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_0%,rgba(59,130,246,0.3),transparent_70%)] opacity-50" />
        <div className="absolute -right-64 -bottom-64 h-[600px] w-[600px] rounded-full bg-primary/20 blur-[160px] animate-pulse" />
        <div className="absolute -left-64 -top-64 h-[600px] w-[600px] rounded-full bg-blue-600/10 blur-[160px]" />
        
        {/* Animated Background Mesh */}
        <div className="absolute inset-0 opacity-10 pointer-events-none">
           <div className="absolute top-0 left-0 w-full h-full bg-slate-900/50 brightness-50 contrast-150" />
        </div>

        <div className="relative z-10 space-y-10">
          <motion.div 
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="inline-flex items-center gap-4 px-10 py-3 rounded-full bg-white/5 border border-white/10 backdrop-blur-3xl shadow-2xl"
          >
            <div className="relative flex h-3 w-3">
              <div className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></div>
              <div className="relative inline-flex rounded-full h-3 w-3 bg-primary shadow-[0_0_20px_rgba(59,130,246,1)]"></div>
            </div>
            <span className="text-[12px] font-black tracking-[0.6em] uppercase text-slate-300">Atlas Intelligence Academy</span>
          </motion.div>
          
          <div className="space-y-4">
             <motion.h1 
               initial={{ y: 30, opacity: 0 }}
               animate={{ y: 0, opacity: 1 }}
               transition={{ delay: 0.4 }}
               className="text-6xl sm:text-8xl md:text-[10rem] font-black tracking-tighter leading-[0.85] text-white italic"
             >
               ITIL <span className="text-primary not-italic tracking-normal bg-clip-text text-transparent bg-gradient-to-r from-primary to-blue-400">VERSION 5</span>
             </motion.h1>
             <motion.div 
               initial={{ scaleX: 0 }}
               animate={{ scaleX: 1 }}
               transition={{ delay: 0.8, duration: 1 }}
               className="h-1.5 w-48 bg-primary mx-auto rounded-full shadow-[0_0_20px_rgba(59,130,246,0.5)]" 
             />
          </div>
          
          <motion.p 
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="text-2xl md:text-4xl text-slate-400 max-w-5xl mx-auto font-medium leading-[1.1] tracking-tight"
          >
            A fronteira final da <span className="text-white font-black underline decoration-primary decoration-4 underline-offset-8">Gestão Autonômica de Valor</span>. 
            Engenharia de resultados via orquestração algorítmica.
          </motion.p>

          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1 }}
            className="flex flex-wrap justify-center gap-6 pt-6"
          >
             <Badge variant="outline" className="px-6 py-2 text-[10px] border-white/10 bg-white/5 text-primary-foreground font-black uppercase tracking-[0.2em] rounded-xl backdrop-blur-md">SVS 2.0 Compliance</Badge>
             <Badge variant="outline" className="px-6 py-2 text-[10px] border-white/10 bg-white/5 text-primary-foreground font-black uppercase tracking-[0.2em] rounded-xl backdrop-blur-md">AutonomousOps</Badge>
             <Badge variant="outline" className="px-6 py-2 text-[10px] border-white/10 bg-white/5 text-primary-foreground font-black uppercase tracking-[0.2em] rounded-xl backdrop-blur-md">XLA Cognitive Matrix</Badge>
          </motion.div>
        </div>
      </motion.div>

      {/* Value Stream Philosophy */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-24 items-center">
        <div className="space-y-12">
          <div className="space-y-6">
            <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/20">
               <Waves className="h-7 w-7 text-primary" />
            </div>
            <h2 className="text-5xl md:text-7xl font-black tracking-tighter leading-[0.9] uppercase">
                Fluxo de Valor <br/>
                <span className="text-primary italic">Ininterrupto.</span>
            </h2>
          </div>
          
          <p className="text-xl text-slate-500 font-bold leading-relaxed max-w-2xl">
            No ecossistema Atlas, a barreira entre TI e Operação é inexistente. O ITIL v5 unifica Incidências e Mudanças em fluxos contínuos.
            <br/><br/>
            Cada sinal percorre o <span className="text-foreground">Mapa de Calor Operacional</span>, sendo processado por motores de governança que garantem a entrega máxima com o menor atrito possível.
          </p>

          <div className="grid grid-cols-2 gap-8 pt-4">
            <div className="p-10 rounded-[3rem] bg-white/5 border border-white/10 shadow-2xl relative overflow-hidden group/item">
               <div className="absolute top-0 right-0 p-6 opacity-5 rotate-12 group-hover/item:rotate-0 transition-transorm">
                  <Fingerprint className="h-16 w-16" />
               </div>
               <h4 className="text-4xl font-black text-primary mb-2">01</h4>
               <p className="text-sm font-black uppercase tracking-widest text-foreground">Visão Radical</p>
               <p className="text-[11px] text-muted-foreground font-bold mt-2 leading-relaxed uppercase tracking-tighter">Mapeamento granular de cada micro-transição de valor no pipeline.</p>
            </div>
            <div className="p-10 rounded-[3rem] bg-white/5 border border-white/10 shadow-2xl relative overflow-hidden group/item">
               <div className="absolute top-0 right-0 p-6 opacity-5 rotate-12 group-hover/item:rotate-0 transition-transorm">
                  <Heart className="h-16 w-16" />
               </div>
               <h4 className="text-4xl font-black text-primary mb-2">02</h4>
               <p className="text-sm font-black uppercase tracking-widest text-foreground">XLA First</p>
               <p className="text-[11px] text-muted-foreground font-bold mt-2 leading-relaxed uppercase tracking-tighter">A experiência do usuário final como o único KPI inegociável de sucesso.</p>
            </div>
          </div>
        </div>

        <div className="relative">
           <div className="absolute -inset-10 bg-gradient-to-tr from-primary/30 to-blue-500/30 rounded-[5rem] blur-[80px] opacity-40 animate-pulse" />
           <div className="relative rounded-[4rem] border border-white/10 bg-slate-900/40 backdrop-blur-3xl overflow-hidden shadow-[0_64px_128px_-32px_rgba(0,0,0,0.6)]">
              <div className="bg-white/5 p-6 border-b border-white/5 flex items-center justify-between">
                 <div className="flex items-center gap-4">
                    <div className="flex gap-2">
                       <div className="h-3 w-3 rounded-full bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.5)]" />
                       <div className="h-3 w-3 rounded-full bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.5)]" />
                       <div className="h-3 w-3 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
                    </div>
                    <div className="text-[10px] font-black text-muted-foreground/60 uppercase tracking-[0.2em]">Atlas Command Center v5</div>
                 </div>
                 <Badge variant="outline" className="text-[9px] font-black uppercase tracking-widest border-primary/20 text-primary">Live Data</Badge>
              </div>
              <div className="p-12 space-y-10">
                 <div className="space-y-4">
                    <div className="flex justify-between items-end">
                       <div className="space-y-1">
                          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/40">Flow Health Index</span>
                          <h4 className="text-3xl font-black tracking-tighter">94.2% <span className="text-emerald-500 text-sm italic">OPTIMAL</span></h4>
                       </div>
                       <Activity className="h-8 w-8 text-primary opacity-20" />
                    </div>
                    <div className="h-3 w-full bg-white/5 rounded-full overflow-hidden border border-white/5 shadow-inner">
                       <motion.div 
                         initial={{ width: 0 }} 
                         whileInView={{ width: '94.2%' }} 
                         transition={{ duration: 1.5, ease: "easeOut" }}
                         className="h-full bg-gradient-to-r from-primary to-blue-400 rounded-full shadow-[0_0_20px_rgba(59,130,246,0.5)]" 
                       />
                    </div>
                 </div>
                 <div className="space-y-4">
                    {[
                      { l: "Service Swarming Matrix", v: "Active Ops", s: "bg-blue-500", i: Network },
                      { l: "XLA Sentiment Core", v: "9.2/10", s: "bg-rose-500", i: Heart },
                      { l: "CSI Automation Pool", v: "18 Fluxos", s: "bg-emerald-500", i: Cpu }
                    ].map((row, i) => (
                      <motion.div 
                        key={i} 
                        initial={{ opacity: 0, x: -20 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.1 }}
                        className="flex items-center justify-between p-5 rounded-3xl bg-white/5 border border-white/5 hover:bg-white/10 transition-all group/row"
                      >
                         <div className="flex items-center gap-4">
                            <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center border border-white/5 shadow-lg", row.s + "/20")}>
                               <row.i className={cn("h-5 w-5", "text-foreground")} />
                            </div>
                            <span className="text-xs font-black uppercase tracking-widest text-foreground/80 group-hover/row:text-primary transition-colors">{row.l}</span>
                         </div>
                         <Badge variant="outline" className="h-7 px-4 rounded-xl text-[10px] font-black uppercase tracking-widest border-white/5 bg-white/5">{row.v}</Badge>
                      </motion.div>
                    ))}
                 </div>
              </div>
           </div>
        </div>
      </section>

      {/* Core Pillars Interactive Grid */}
      <section className="space-y-16">
        <div className="text-center space-y-4">
           <div className="flex items-center justify-center gap-4 mb-4">
              <div className="h-[1px] w-12 bg-primary/20" />
              <h2 className="text-[12px] font-black tracking-[0.6em] uppercase text-primary">Protocolos de Domínio</h2>
              <div className="h-[1px] w-12 bg-primary/20" />
           </div>
           <h3 className="text-5xl md:text-7xl font-black tracking-tighter uppercase leading-[0.8] italic">Engine de Performance</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-8">
          {modules.map((mod) => (
            <motion.div
              key={mod.id}
              whileHover={{ y: -10, scale: 1.02 }}
              onMouseEnter={() => setActiveModule(mod.id)}
              className={cn(
                "group cursor-pointer p-10 rounded-[3.5rem] border transition-all duration-700 relative overflow-hidden",
                activeModule === mod.id ? "bg-white/10 shadow-3xl border-primary/30" : "bg-white/5 border-white/5 shadow-xl"
              )}
            >
              <div className={cn("h-20 w-20 rounded-3xl mb-8 flex items-center justify-center transition-all duration-500 group-hover:scale-110 group-hover:rotate-12 shadow-2xl", mod.bg)}>
                <mod.icon className={cn("h-10 w-10", mod.color)} />
              </div>
              <h3 className="text-2xl font-black tracking-tighter uppercase mb-6 leading-none">{mod.title}</h3>
              <p className="text-xs text-slate-400 leading-relaxed font-bold uppercase tracking-tight opacity-60 group-hover:opacity-100 transition-opacity">
                {mod.content}
              </p>
              
              <div className={cn(
                "absolute -right-12 -bottom-12 opacity-[0.03] transition-all duration-1000",
                activeModule === mod.id ? "scale-150 rotate-0 opacity-10" : "scale-100 -rotate-12"
              )}>
                 <mod.icon className="h-56 w-56" />
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* High-Tech Deep Dives */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-16">
        <Card className="rounded-[4rem] border-white/5 bg-slate-900/40 p-10 shadow-3xl relative overflow-hidden group/card">
           <div className="absolute top-0 right-0 p-12 opacity-5 rotate-12 group-hover/card:rotate-0 transition-transorm">
              <Sparkles className="h-40 w-40 text-amber-500" />
           </div>
           <CardHeader className="px-0 pt-0">
              <div className="flex items-center gap-6">
                 <div className="h-16 w-16 rounded-[1.5rem] bg-amber-500/10 flex items-center justify-center border border-amber-500/20 shadow-xl shadow-amber-500/10">
                    <Sparkles className="h-8 w-8 text-amber-500" />
                 </div>
                 <div>
                    <p className="text-[10px] font-black text-amber-500 uppercase tracking-[0.3em] mb-1">Córtex Atlas</p>
                    <CardTitle className="text-4xl font-black tracking-tighter uppercase leading-none">AI Early Warning</CardTitle>
                 </div>
              </div>
           </CardHeader>
           <CardContent className="px-0 space-y-10">
              <p className="text-lg text-slate-400 font-bold leading-snug">
                Nossa IA não apenas sugere; ela antecipa. O sistema identifica riscos de SLA e XLA baseados em telemetria cognitiva antes que o impacto ocorra.
              </p>
              <ul className="space-y-4">
                 {[
                   "Diagnóstico Sugerido via LLM em Tempo Real",
                   "Previsão de Risco de SLA Preditiva",
                   "Algoritmos de Próxima Melhor Ação (NBA)",
                   "Automação de RCA (Causa Raiz)"
                 ].map((text, i) => (
                   <li key={i} className="flex items-center gap-4 text-[11px] font-black uppercase tracking-widest text-slate-300">
                      <div className="h-2 w-2 rounded-full bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,1)]" />
                      {text}
                   </li>
                 ))}
              </ul>
              <Button variant="outline" className="w-full rounded-[2rem] h-14 font-black uppercase tracking-widest text-[11px] border-white/10 bg-white/5 hover:bg-amber-500 hover:text-white hover:border-amber-500 transition-all shadow-xl active:scale-95">Ver Inteligência de Rede</Button>
           </CardContent>
        </Card>

        <Card className="rounded-[4rem] border-white/5 bg-primary/5 p-10 shadow-3xl relative overflow-hidden group/card">
           <div className="absolute top-0 right-0 p-12 opacity-5 rotate-12 group-hover/card:rotate-0 transition-transorm">
              <Radio className="h-40 w-40 text-primary" />
           </div>
           <CardHeader className="px-0 pt-0">
              <div className="flex items-center gap-6">
                 <div className="h-16 w-16 rounded-[1.5rem] bg-primary/10 flex items-center justify-center border border-primary/20 shadow-xl shadow-primary/10">
                    <Network className="h-8 w-8 text-primary" />
                 </div>
                 <div>
                    <p className="text-[10px] font-black text-primary uppercase tracking-[0.3em] mb-1">Mecanismo Swarm</p>
                    <CardTitle className="text-4xl font-black tracking-tighter uppercase leading-none">Radical Swarming</CardTitle>
                 </div>
              </div>
           </CardHeader>
           <CardContent className="px-0 space-y-10">
              <p className="text-lg text-slate-400 font-bold leading-snug">
                O Swarming dissolve as barreiras de escalada. Especialistas são orquestrados em células dinâmicas para resolver gargalos em segundos.
              </p>
              <div className="grid grid-cols-2 gap-6">
                 <div className="p-6 rounded-[2.5rem] bg-slate-950 border border-primary/20 shadow-2xl">
                    <p className="text-[10px] font-black text-muted-foreground/40 uppercase tracking-widest mb-1">Ganho de Velocidade</p>
                    <p className="text-4xl font-black text-primary tabular-nums">+68%</p>
                 </div>
                 <div className="p-6 rounded-[2.5rem] bg-slate-950 border border-primary/20 shadow-2xl">
                    <p className="text-[10px] font-black text-muted-foreground/40 uppercase tracking-widest mb-1">Eficiência de Célula</p>
                    <p className="text-4xl font-black text-primary tabular-nums">99.8%</p>
                 </div>
              </div>
              <Button className="w-full rounded-[2rem] h-14 font-black uppercase tracking-widest text-[11px] bg-primary hover:bg-primary/80 text-white shadow-xl shadow-primary/20 active:scale-95 transition-all">Explorar Matriz Swarm</Button>
           </CardContent>
        </Card>
      </div>

      {/* Cinematic CTA Footer */}
      <motion.div 
        initial={{ opacity: 0, y: 50 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="relative overflow-hidden rounded-[5rem] bg-gradient-to-br from-slate-950 via-blue-950 to-slate-950 p-24 md:p-40 text-center text-white shadow-[0_64px_128px_-32px_rgba(59,130,246,0.3)] border border-white/5 group"
      >
        <div className="absolute top-0 right-0 h-full w-full bg-[radial-gradient(circle_at_50%_100%,rgba(59,130,246,0.2),transparent_60%)]" />
        <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-primary/20 blur-[120px] animate-pulse" />
        <div className="absolute inset-0 bg-primary/5 opacity-5 pointer-events-none" />
        
        <div className="relative z-10 space-y-12">
          <motion.div
            animate={{ rotate: [0, 360] }}
            transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
            className="h-24 w-24 mx-auto mb-8 opacity-20"
          >
             <Globe className="h-full w-full text-primary" />
          </motion.div>
          <h2 className="text-6xl md:text-8xl font-black tracking-tighter uppercase leading-[0.8] group-hover:scale-105 transition-transform duration-700">
            ENGENHAR O <br/>
            <span className="text-primary italic underline decoration-white/10 decoration-8 underline-offset-[20px]">PRÓXIMO NÍVEL</span>
          </h2>
          <p className="text-xl md:text-3xl text-slate-400 max-w-4xl mx-auto font-bold leading-snug italic tracking-tight">
            O roadmap Atlas 2026 unifica Previsão de Falhas Autonômica e Resolução Proativa. O futuro não é reativo. O futuro é <span className="text-white">Atlas ITIL v5</span>.
          </p>
          <div className="flex flex-wrap justify-center gap-8 pt-10">
             <Button 
               size="lg" 
               className="h-20 px-16 bg-white text-slate-950 rounded-[2rem] font-black text-sm tracking-[0.2em] hover:bg-primary hover:text-white transition-all shadow-3xl active:scale-95 uppercase"
               onClick={() => window.location.href = '/crm/analytics'}
             >
               VSM Real-Time Analytics
             </Button>
             <Button 
               size="lg" 
               variant="outline" 
               className="h-20 px-16 bg-white/5 text-white rounded-[2rem] font-black text-sm tracking-[0.2em] hover:bg-white/10 transition-all border-white/10 shadow-2xl uppercase backdrop-blur-xl"
             >
               Mastering ITIL v5
             </Button>
          </div>
        </div>
      </motion.div>
    </div>
  )
}

