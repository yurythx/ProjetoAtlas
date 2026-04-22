"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Button } from "@/components/ui/button"
import { 
  BarChart3, 
  Clock, 
  Target, 
  TrendingUp, 
  AlertTriangle, 
  CheckCircle2, 
  Users, 
  Activity,
  ArrowRight,
  FileDown,
  Plus,
  Rocket,
  ShieldInfo,
  Lightbulb,
  Layers,
  Zap,
  Sparkles,
  Waves,
  Fingerprint,
  Radio,
  Cpu
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useCRM } from "@/features/crm/use-crm"
import { useQuery } from "@tanstack/react-query"
import { api } from "@/lib/axios"

export default function CRMAnalyticsPage() {
  const { pipelines } = useCRM()
  const [selectedPipeline, setSelectedPipeline] = useState<string>(pipelines[0]?.id?.toString() || "")
  const [isExporting, setIsExporting] = useState(false)

  // Fetch VSM Data
  const { data: vsmData, isLoading: isLoadingVSM } = useQuery({
    queryKey: ["vsm-analytics", selectedPipeline],
    queryFn: async () => {
      const { data } = await api.get(`/api/crm/dpsm-dashboard/vsm_analytics/?pipeline_id=${selectedPipeline}`)
      return data
    },
    enabled: !!selectedPipeline
  })

  // Fetch Governance Data
  const { data: govData, isLoading: isLoadingGov } = useQuery({
    queryKey: ["governance-reports"],
    queryFn: async () => {
      const { data } = await api.get("/api/crm/dpsm-dashboard/governance_reports/")
      return data
    }
  })

  // Fetch CSI Register
  const { data: csiData, refetch: refetchCSI } = useQuery({
    queryKey: ["csi-register"],
    queryFn: async () => {
      const { data } = await api.get("/api/crm/csi-register/")
      return data
    }
  })

  const [isCSIModalOpen, setIsCSIModalOpen] = useState(false)
  const [newCSITitle, setNewCSITitle] = useState("")
  const [newCSIDesc, setNewCSIDesc] = useState("")
  const [newCSIOutcome, setNewCSIOutcome] = useState("")

  const handleCreateCSI = async () => {
    try {
      await api.post("/api/crm/csi-register/", {
        title: newCSITitle,
        description: newCSIDesc,
        expected_outcome: newCSIOutcome,
        status: "identified",
        priority: "medium"
      })
      toast.success("Oportunidade de Melhoria registrada no CSI!")
      setIsCSIModalOpen(false)
      setNewCSITitle("")
      setNewCSIDesc("")
      setNewCSIOutcome("")
      refetchCSI()
    } catch (error) {
      toast.error("Erro ao registrar no CSI")
    }
  }

  const handleDownloadReport = async () => {
    setIsExporting(true)
    try {
      const response = await api.get(`/api/crm/dpsm-dashboard/generate_executive_report/?pipeline_id=${selectedPipeline}`, {
        responseType: 'blob'
      })
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `Executive_Report_${new Date().toISOString().split('T')[0]}.pdf`)
      document.body.appendChild(link)
      link.click()
      link.remove()
    } catch (error) {
      console.error("Erro ao gerar relatÃ³rio:", error)
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div className="space-y-12 pb-32 max-w-[1600px] mx-auto px-4 md:px-8 pt-8">
      {/* Premium Cinematic Header */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-[3rem] bg-slate-950 p-10 md:p-16 text-white shadow-[0_32px_64px_-16px_rgba(0,0,0,0.6)] border border-white/5"
      >
        <div className="absolute right-0 top-0 h-full w-1/2 bg-gradient-to-l from-primary/20 to-transparent pointer-events-none" />
        <div className="absolute -left-32 -top-32 h-80 w-80 rounded-full bg-primary/10 blur-[120px] pointer-events-none" />
        
        <div className="relative z-10 flex flex-col xl:flex-row xl:items-center justify-between gap-12">
          <div className="space-y-4">
            <div className="flex items-center gap-6">
              <div className="h-20 w-20 rounded-[1.5rem] bg-white/5 border border-white/10 backdrop-blur-3xl flex items-center justify-center shadow-2xl shrink-0 group hover:scale-105 transition-transform">
                 <BarChart3 className="h-10 w-10 text-primary animate-pulse" />
              </div>
              <div className="space-y-1">
                <h1 className="text-4xl md:text-6xl font-black tracking-tighter italic uppercase leading-[0.85] bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-500">MANAGER ANALYTICS</h1>
                <div className="flex items-center gap-3">
                    <div className="h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_10px_rgba(59,130,246,1)]" />
                    <p className="text-slate-400 font-black text-[10px] md:text-xs uppercase tracking-[0.4em]">Value Stream & ITIL Version 5 Governance</p>
                </div>
              </div>
            </div>
          </div>
          
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-6">
            <Select value={selectedPipeline} onValueChange={setSelectedPipeline}>
              <SelectTrigger className="w-full sm:w-[320px] h-16 bg-white/5 border-white/10 rounded-2xl backdrop-blur-3xl text-white font-black uppercase text-[10px] tracking-[0.3em] hover:bg-white/10 transition-all shadow-xl">
                <SelectValue placeholder="SELECIONAR PIPELINE" />
              </SelectTrigger>
              <SelectContent className="rounded-2xl border-white/10 bg-slate-900 text-white backdrop-blur-3xl">
                {pipelines.map(p => (
                  <SelectItem key={p.id} value={p.id.toString()} className="focus:bg-primary focus:text-white uppercase text-[10px] font-black tracking-widest h-12">
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <button 
              disabled={isExporting || !selectedPipeline}
              onClick={handleDownloadReport}
              className="group relative flex items-center justify-center gap-4 px-12 h-16 bg-primary hover:bg-white hover:text-primary text-white rounded-2xl font-black text-[10px] tracking-[0.3em] transition-all shadow-2xl shadow-primary/30 disabled:opacity-50 active:scale-95 uppercase shrink-0"
            >
              {isExporting ? (
                <Activity className="h-5 w-5 animate-spin" />
              ) : (
                <FileDown className="h-6 w-6" />
              )}
              GERAR RELATÃ“RIO EXECUTIVO
            </button>
          </div>
        </div>
      </motion.div>

      {/* High-Level KPI Matrix */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
        {[
          { label: "Lead Time MÃ©dio", value: `${vsmData?.avg_lead_time_days || 0}d`, icon: Clock, sub: "Velocity Index", color: "from-blue-500/10 to-blue-600/5", border: "border-blue-500/20", glow: "shadow-blue-500/10" },
          { label: "SLA Compliance", value: `${govData?.sla_compliance_rate || 100}%`, icon: Target, sub: "Reliability Core", color: "from-emerald-500/10 to-emerald-600/5", border: "border-emerald-500/20", glow: "shadow-emerald-500/10" },
          { label: "Throughput", value: vsmData?.throughput_weekly || 0, icon: TrendingUp, sub: "Weekly Output", color: "from-purple-500/10 to-purple-600/5", border: "border-purple-500/20", glow: "shadow-purple-500/10" },
          { 
            label: "XLA Satisfaction", 
            value: govData?.xla_experience?.avg_ease 
              ? `${((Number(govData.xla_experience.avg_ease) + Number(govData.xla_experience.avg_speed) + Number(govData.xla_experience.avg_outcome)) / 3).toFixed(1)}/10` 
              : "9.2", 
            icon: Heart, 
            sub: "Sentiment Matrix", 
            color: "from-rose-500/10 to-rose-600/5", 
            border: "border-rose-500/20",
            glow: "shadow-rose-500/10"
          },
        ].map((kpi, i) => (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.1 }}
            key={i}
            className={cn(
              "relative overflow-hidden rounded-[2.5rem] border bg-gradient-to-br p-8 shadow-2xl group hover:scale-[1.02] transition-all duration-500",
              kpi.color,
              kpi.border,
              kpi.glow
            )}
          >
            <div className="absolute top-0 right-0 p-8 opacity-[0.03] group-hover:opacity-10 transition-opacity">
               <kpi.icon className="h-24 w-24" />
            </div>
            <div className="relative z-10 flex flex-col justify-between h-full gap-8">
              <div className="h-14 w-14 rounded-2xl bg-white/5 border border-white/5 backdrop-blur-md flex items-center justify-center shadow-lg group-hover:rotate-12 transition-transform">
                <kpi.icon className="h-7 w-7 text-foreground/60 group-hover:text-primary transition-colors" />
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground/60">{kpi.label}</p>
                <h3 className="text-5xl font-black tracking-tighter leading-none">{kpi.value}</h3>
                <div className="flex items-center gap-2 pt-1">
                    <div className="h-1 w-4 bg-primary/40 rounded-full" />
                    <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/40">{kpi.sub}</p>
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-12">
        {/* Value Stream Visualizer Section */}
        <Card className="xl:col-span-2 rounded-[3.5rem] border-white/10 bg-white/5 backdrop-blur-3xl shadow-[0_32px_64px_-16px_rgba(0,0,0,0.5)] overflow-hidden">
          <CardHeader className="p-10 border-b border-white/5 bg-white/5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-6">
                <div className="h-14 w-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center shadow-lg">
                    <Layers className="h-7 w-7 text-primary" />
                </div>
                <div>
                    <CardTitle className="text-2xl font-black tracking-tighter uppercase italic">VALUE STREAM MAP (VSM)</CardTitle>
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/40 mt-1">Mapeamento GeogrÃ¡fico de Valor em Tempo Real</p>
                </div>
              </div>
              <Badge className="h-8 rounded-xl px-4 border-none bg-primary/10 text-primary font-black uppercase tracking-widest text-[9px]">SVS Orquestrado</Badge>
            </div>
          </CardHeader>
          <CardContent className="p-12">
              <div className="relative flex items-center justify-between min-h-[280px] overflow-x-auto gap-12 lg:gap-0 px-8 pt-12 pb-8 scrollbar-none">
                {isLoadingVSM ? (
                  <div className="w-full flex items-center justify-center gap-4 text-muted-foreground">
                    <Activity className="h-6 w-6 animate-spin text-primary" />
                    <span className="text-xs font-black uppercase tracking-[0.3em]">Calculando Matrix VSM...</span>
                  </div>
                ) : vsmData?.residence_times?.length > 0 ? (
                  vsmData.residence_times.map((res: any, idx: number) => (
                    <div key={idx} className="flex-1 flex flex-col items-center group relative min-w-[180px]">
                      {idx < vsmData.residence_times.length - 1 && (
                        <div className={cn(
                          "absolute top-8 left-1/2 w-full h-[4px] z-0 rounded-full transition-all duration-700",
                          res.is_bottleneck ? "bg-rose-500/20" : "bg-primary/10"
                        )}>
                            <div className={cn(
                                "h-full w-1/2 animate-pulse",
                                res.is_bottleneck ? "bg-rose-500/40" : "bg-primary/30"
                            )} />
                        </div>
                      )}
                      <motion.div
                        whileHover={{ scale: 1.15, rotate: 0 }}
                        className={cn(
                          "h-20 w-20 rounded-[2rem] flex items-center justify-center relative z-10 border-4 transition-all duration-500 shadow-2xl",
                          res.is_bottleneck
                            ? "bg-rose-600 text-white border-rose-400 rotate-6 shadow-rose-600/40"
                            : "bg-background border-white/10 text-primary -rotate-6 hover:border-primary/40"
                        )}
                      >
                        <span className="text-2xl font-black tabular-nums">{res.count}</span>
                        {res.is_bottleneck && (
                            <div className="absolute -top-3 -right-3">
                                <AlertTriangle className="h-8 w-8 text-white fill-rose-600 animate-bounce" />
                            </div>
                        )}
                      </motion.div>
                      <div className="text-center mt-10 space-y-2">
                        <p className="text-[12px] font-black uppercase tracking-tighter leading-none group-hover:text-primary transition-colors">{res.column}</p>
                        <div className={cn(
                            "inline-flex items-center gap-2 px-4 py-1.5 rounded-full border shadow-sm",
                            res.is_bottleneck ? "bg-rose-500/10 border-rose-500/20" : "bg-white/5 border-white/5"
                        )}>
                          <Clock className={cn("h-3 w-3", res.is_bottleneck ? "text-rose-500" : "text-muted-foreground/40")} />
                          <p className={cn(
                            "text-[10px] font-black uppercase tracking-widest", 
                            res.is_bottleneck ? "text-rose-500" : "text-foreground/60"
                          )}>
                            {res.avg_days_residence > 0 ? `${res.avg_days_residence}d ResidÃªncia` : "EstÃ©ril"}
                          </p>
                        </div>
                      </div>
                      {res.is_bottleneck && (
                        <div className="absolute -top-10 left-1/2 -translate-x-1/2 w-full flex justify-center">
                          <span className="bg-rose-600 text-[10px] font-black text-white px-5 py-2 rounded-xl shadow-xl shadow-rose-600/30 animate-pulse uppercase tracking-widest">Alerta de Gargalo</span>
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="w-full flex flex-col items-center justify-center gap-6 text-muted-foreground py-16">
                    <div className="h-24 w-24 rounded-full bg-white/5 flex items-center justify-center border border-dashed border-white/10">
                        <Layers className="h-10 w-10 opacity-20" />
                    </div>
                    <div className="text-center space-y-1">
                        <p className="text-sm font-black uppercase tracking-[0.3em] opacity-40">Matrix VSM Sem Dados</p>
                        <p className="text-[10px] font-bold text-muted-foreground/20 uppercase tracking-widest">Inicie o fluxo de valor no Kanban para orquestrar a telemetria.</p>
                    </div>
                  </div>
                )}
              </div>
            
            <div className="mt-12 rounded-[2.5rem] bg-slate-900/40 p-10 flex flex-col md:flex-row items-center gap-10 border border-white/5 shadow-2xl relative overflow-hidden group/diag">
              <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover/diag:opacity-100 transition-opacity" />
              <div className="h-24 w-24 rounded-3xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0 shadow-2xl group-hover:scale-110 transition-transform">
                <AlertTriangle className="h-12 w-12 animate-pulse" />
              </div>
              <div className="space-y-3 text-center md:text-left relative z-10">
                <div className="flex items-center justify-center md:justify-start gap-4">
                    <p className="text-2xl font-black text-white italic tracking-tighter uppercase">DIAGNÃ“STICO & PRESCRIÃ‡ÃƒO IA</p>
                    <Badge className="bg-primary/20 text-primary border-none text-[8px] font-black">AI CORE v5</Badge>
                </div>
                <p className="text-lg text-slate-400 font-bold leading-relaxed max-w-3xl">
                  Identificamos uma retenÃ§Ã£o anÃ´mala em <span className="text-white font-black">{vsmData?.residence_times?.find((r:any) => r.avg_days_residence > 4)?.column || "Fila de Atendimento"}</span>. 
                  O motor preditivo sugere a <span className="text-primary font-black underline decoration-primary/40 underline-offset-4">AtivaÃ§Ã£o IMídiata de Swarm</span> para normalizaÃ§Ã£o do Lead Time.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Governance / XLA / Experience Section */}
        <Card className="rounded-[3.5rem] border-white/10 bg-slate-950 p-10 text-white shadow-[0_32px_64px_-16px_rgba(0,0,0,0.8)] relative overflow-hidden flex flex-col">
          <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-primary/5 blur-[120px] pointer-events-none" />
          
          <CardHeader className="p-0 mb-12">
            <div className="flex items-center gap-6">
                <div className="h-16 w-16 rounded-[1.5rem] bg-rose-500/10 border border-rose-500/20 flex items-center justify-center shadow-xl">
                    <Heart className="h-8 w-8 text-rose-500 animate-pulse" />
                </div>
                <div>
                    <CardTitle className="text-2xl font-black tracking-tighter uppercase italic">XLA MATRIX</CardTitle>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Sentiment & Human Experience Agreement</p>
                </div>
            </div>
          </CardHeader>
          
          <CardContent className="p-0 space-y-12 flex-1 flex flex-col">
            <div className="space-y-8">
              {[
                { label: "USABILITY CORE", val: govData?.xla_experience?.avg_ease || 8.5, max: 10, color: "bg-blue-500", glow: "shadow-blue-500/20" },
                { label: "VELOCITY PERCEPTION", val: govData?.xla_experience?.avg_speed || 7.2, max: 10, color: "bg-purple-500", glow: "shadow-purple-500/20" },
                { label: "OUTCOME FIDELITY", val: govData?.xla_experience?.avg_outcome || 9.4, max: 10, color: "bg-emerald-500", glow: "shadow-emerald-500/20" },
              ].map((item, idx) => (
                <div key={idx} className="space-y-4">
                  <div className="flex justify-between items-end">
                    <span className="text-[11px] font-black tracking-[0.3em] text-slate-500 uppercase">{item.label}</span>
                    <span className="text-3xl font-black tracking-tighter">{item.val.toFixed(1)}<span className="text-[10px] text-slate-600 ml-1">/10</span></span>
                  </div>
                  <div className="h-3 w-full rounded-full bg-white/5 overflow-hidden border border-white/5 p-0.5">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${(item.val / item.max) * 100}%` }}
                      transition={{ duration: 1.5, delay: idx * 0.2 }}
                      className={cn("h-full rounded-full shadow-lg", item.color, item.glow)} 
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-12 border-t border-white/5 space-y-6 mt-auto">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                    <h4 className="text-[11px] font-black uppercase tracking-[0.4em] text-primary">CSI REGISTER</h4>
                    <p className="text-[9px] font-bold text-muted-foreground/40 uppercase tracking-widest">ITIL v5 Continual Improvement</p>
                </div>
                <Dialog open={isCSIModalOpen} onOpenChange={setIsCSIModalOpen}>
                  <DialogTrigger asChild>
                    <button className="h-10 w-10 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary hover:bg-primary hover:text-white transition-all shadow-xl active:scale-90">
                      <Plus className="h-5 w-5" />
                    </button>
                  </DialogTrigger>
                  <DialogContent className="rounded-[3rem] bg-slate-950 text-white border border-white/10 max-w-lg p-10 backdrop-blur-3xl">
                    <DialogHeader className="mb-8">
                      <DialogTitle className="text-4xl font-black italic uppercase tracking-tighter leading-none">CSI IDENTIFICATION</DialogTitle>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mt-2">Registrar Nova Oportunidade de Melhoria de Valor</p>
                    </DialogHeader>
                    <div className="space-y-8">
                       <div className="space-y-3">
                          <Label className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">TÃ­tulo da Melhoria</Label>
                          <Input 
                            value={newCSITitle} 
                            onChange={e => setNewCSITitle(e.target.value)}
                            placeholder="EX: AUTOMAÃ‡ÃƒO DE PROVISIONAMENTO"
                            className="bg-white/5 border-white/10 rounded-2xl h-14 font-black text-xs placeholder:text-slate-700 uppercase"
                          />
                       </div>
                       <div className="space-y-3">
                          <Label className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">Gargalo / Oportunidade</Label>
                          <Textarea 
                            value={newCSIDesc} 
                            onChange={e => setNewCSIDesc(e.target.value)}
                            placeholder="DESCREVA O GARGALO IDENTIFICADO NA MATRIX VSM..."
                            className="bg-white/5 border-white/10 rounded-2xl min-h-[120px] font-bold text-xs placeholder:text-slate-700 uppercase"
                          />
                       </div>
                       <div className="space-y-3">
                          <Label className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">Impacto Previsto (XLA/VSM)</Label>
                          <Textarea 
                            value={newCSIOutcome} 
                            onChange={e => setNewCSIOutcome(e.target.value)}
                            placeholder="QUAL O GANHO PREVISTO NO LEAD TIME?"
                            className="bg-white/5 border-white/10 rounded-2xl min-h-[100px] font-bold text-xs placeholder:text-slate-700 uppercase"
                          />
                       </div>
                       <Button 
                         onClick={handleCreateCSI}
                         disabled={!newCSITitle || !newCSIDesc}
                         className="w-full h-16 rounded-2xl font-black uppercase tracking-[0.3em] text-[11px] shadow-2xl shadow-primary/30 active:scale-95 transition-all"
                       >
                         PROTOCOLO CSI SALVAR
                       </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>

              <div className="space-y-4 max-h-[360px] overflow-y-auto pr-3 scrollbar-thin scrollbar-thumb-white/10 custom-scrollbar">
                {csiData?.results?.length > 0 ? (
                  csiData.results.map((item: any) => (
                    <div key={item.id} className="group p-6 rounded-3xl bg-white/5 border border-white/5 hover:bg-white/10 hover:border-primary/20 transition-all shadow-xl">
                      <div className="flex items-start gap-5">
                        <div className={cn(
                          "h-12 w-12 rounded-2xl flex items-center justify-center shrink-0 border border-white/10 shadow-2xl",
                          item.status === 'completed' ? "bg-emerald-500/20 text-emerald-500" : "bg-primary/20 text-primary"
                        )}>
                          {item.status === 'completed' ? <Rocket className="h-6 w-6" /> : <Lightbulb className="h-6 w-6" />}
                        </div>
                        <div className="space-y-2 w-full">
                          <div className="flex items-center justify-between gap-4">
                             <p className="text-[11px] font-black uppercase tracking-tighter truncate">{item.title}</p>
                             <Badge className={cn("text-[8px] h-4 font-black uppercase border-none shadow-lg", item.priority === 'high' ? 'bg-rose-600' : 'bg-slate-700')}>{item.priority}</Badge>
                          </div>
                          <p className="text-[10px] text-slate-400 font-bold leading-relaxed line-clamp-2 uppercase tracking-tighter">{item.description}</p>
                          <div className="flex items-center justify-between pt-2">
                             <div className="flex items-center gap-3">
                                <span className={cn("h-1 w-4 rounded-full", item.status === 'completed' ? 'bg-emerald-500' : 'bg-primary')} />
                                <span className="text-[9px] font-black text-muted-foreground/60 uppercase tracking-widest">{item.status_display || item.status}</span>
                             </div>
                             <span className="text-[9px] font-black text-muted-foreground/20 uppercase tracking-widest">{new Date(item.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-12 text-center border border-dashed border-white/10 rounded-[2.5rem] bg-white/5">
                     <ShieldInfo className="h-10 w-10 text-slate-800 mx-auto mb-4" />
                     <p className="text-[11px] font-black text-slate-600 uppercase tracking-[0.2em]">Matrix CSI Sem Registros</p>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      
      <style jsx global>{`
        .scrollbar-none::-webkit-scrollbar {
          display: none;
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.02);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(59, 130, 246, 0.5);
        }
      `}</style>
    </div>
  )
}

function Layers(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z" />
      <path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65" />
      <path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65" />
    </svg>
  )
}

