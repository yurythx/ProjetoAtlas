"use client"

import { useState } from "react"
import { motion } from "framer-motion"
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
  FileDown
} from "lucide-react"
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
      console.error("Erro ao gerar relatório:", error)
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div className="space-y-8 pb-20 max-w-[1600px] mx-auto">
      {/* Premium Header */}
      <div className="relative overflow-hidden rounded-[2.5rem] bg-slate-950 p-8 text-white shadow-2xl">
        <div className="absolute right-0 top-0 h-full w-1/3 bg-gradient-to-l from-primary/20 to-transparent" />
        <div className="absolute -left-20 -top-20 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
        
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-white/10 p-3 backdrop-blur-md">
                 <BarChart3 className="h-6 w-6 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-4xl font-black tracking-tighter italic uppercase leading-none">MANAGER ANALYTICS</h1>
                <p className="text-slate-400 font-medium text-sm mt-1">Value Stream Management & ITIL Version 5 Governance</p>
              </div>
            </div>
          </div>
          
          <div className="flex flex-wrap items-center gap-3">
            <Select value={selectedPipeline} onValueChange={setSelectedPipeline}>
              <SelectTrigger className="w-[240px] h-12 bg-white/5 border-white/10 rounded-2xl backdrop-blur-xl text-white font-bold">
                <SelectValue placeholder="Selecione o Pipeline" />
              </SelectTrigger>
              <SelectContent className="rounded-2xl border-white/10 bg-slate-900 text-white">
                {pipelines.map(p => (
                  <SelectItem key={p.id} value={p.id.toString()} className="focus:bg-primary focus:text-white uppercase text-[10px] font-bold">
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <button 
              disabled={isExporting || !selectedPipeline}
              onClick={handleDownloadReport}
              className="group relative flex items-center gap-3 px-8 h-12 bg-primary hover:bg-white hover:text-primary text-white rounded-2xl font-black text-[11px] tracking-widest transition-all shadow-xl shadow-primary/20 disabled:opacity-50 active:scale-95"
            >
              {isExporting ? (
                <Activity className="h-4 w-4 animate-spin" />
              ) : (
                <FileDown className="h-5 w-5" />
              )}
              GERAR RELATÓRIO EXECUTIVO PDF
            </button>
          </div>
        </div>
      </div>

      {/* High-Level KPIs with Glass Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { label: "Lead Time Médio", value: `${vsmData?.avg_lead_time_days || 0}d`, icon: Clock, sub: "Time-to-Value", color: "from-blue-600/20 to-blue-600/5", border: "border-blue-500/20" },
          { label: "SLA Compliance", value: `${govData?.sla_compliance_rate || 100}%`, icon: Target, sub: "Acordos de Nível", color: "from-emerald-600/20 to-emerald-600/5", border: "border-emerald-500/20" },
          { label: "Throughput", value: vsmData?.throughput_weekly || 0, icon: TrendingUp, sub: "Produtividade Semanal", color: "from-purple-600/20 to-purple-600/5", border: "border-purple-500/20" },
          { label: "XLA Experience", value: "4.8/5", icon: Activity, sub: "User Satisfaction", color: "from-rose-600/20 to-rose-600/5", border: "border-rose-500/20" },
        ].map((kpi, i) => (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            key={i}
            className={cn(
              "relative overflow-hidden rounded-[2rem] border bg-gradient-to-br p-6 shadow-sm group hover:shadow-xl transition-all",
              kpi.color,
              kpi.border
            )}
          >
            <div className="relative z-10 flex justify-between items-start">
              <div className="space-y-1">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">{kpi.label}</p>
                <h3 className="text-4xl font-black tracking-tighter">{kpi.value}</h3>
                <p className="text-[10px] font-bold italic text-muted-foreground/60">{kpi.sub}</p>
              </div>
              <div className="rounded-2xl bg-background/50 p-3 group-hover:scale-110 transition-transform">
                <kpi.icon className="h-6 w-6 text-foreground/50" />
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        {/* Value Stream Visualizer Section */}
        <Card className="xl:col-span-2 rounded-[2.5rem] border-primary/5 bg-card/40 backdrop-blur-sm shadow-xl overflow-hidden">
          <CardHeader className="p-8 border-b border-primary/5">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xl font-black flex items-center gap-3">
                <Layers className="h-6 w-6 text-primary" />
                VALUE STREAM MAP (VSM)
              </CardTitle>
              <Badge variant="outline" className="rounded-full px-4 border-primary/20 text-primary font-bold">Mapeamento em Tempo Real</Badge>
            </div>
          </CardHeader>
          <CardContent className="p-8">
            <div className="relative flex items-center justify-between min-h-[220px] overflow-x-auto gap-8 lg:gap-0 px-4">
               {vsmData?.residence_times?.map((res: any, idx: number) => (
                 <div key={idx} className="flex-1 flex flex-col items-center group relative min-w-[140px]">
                    {idx < vsmData.residence_times.length - 1 && (
                      <div className="absolute top-7 left-1/2 w-full h-[3px] bg-muted/40 group-hover:bg-primary/20 transition-all z-0 rounded-full" />
                    )}
                    <motion.div 
                      whileHover={{ scale: 1.1 }}
                      className={cn(
                        "h-14 w-14 rounded-2xl flex items-center justify-center relative z-10 border-4 transition-all shadow-lg",
                        res.avg_days_residence > 4 
                          ? "bg-rose-500 text-white border-rose-200/50 rotate-3" 
                          : "bg-background border-primary/20 text-primary -rotate-3 hover:rotate-0"
                      )}
                    >
                      <span className="text-lg font-black">{res.count}</span>
                    </motion.div>
                    <div className="text-center mt-6 space-y-1">
                      <p className="text-[11px] font-black uppercase tracking-tighter leading-tight">{res.column}</p>
                      <div className="flex items-center justify-center gap-1">
                        <Clock className="h-3 w-3 text-muted-foreground" />
                        <p className="text-[10px] text-muted-foreground font-black italic">{res.avg_days_residence}d residência</p>
                      </div>
                    </div>
                    {res.avg_days_residence > 4 && (
                      <div className="absolute -top-6 left-1/2 -translate-x-1/2">
                         <span className="bg-rose-600 text-[9px] font-black text-white px-3 py-1 rounded-full animate-pulse uppercase">Gargalo Crítico</span>
                      </div>
                    )}
                 </div>
               ))}
            </div>
            
            <div className="mt-8 rounded-[2rem] bg-slate-900 p-6 flex flex-col md:flex-row items-center gap-6 border-l-8 border-primary">
              <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center text-primary shrink-0 shadow-lg">
                <AlertTriangle className="h-8 w-8" />
              </div>
              <div className="space-y-1 text-center md:text-left">
                <p className="text-lg font-black text-white italic">DIAGNÓSTICO E PRESCRIÇÃO</p>
                <p className="text-sm text-slate-400 font-medium">
                  Identificamos que a etapa de <span className="text-white font-bold">{vsmData?.residence_times?.find((r:any) => r.avg_days_residence > 4)?.column || "Work in Progress"}</span> está retendo valor. 
                  Sugerimos a ativação de um <span className="text-primary font-bold">Swarm Automático</span> para as próximas 48h.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Governance / XLA / Experience Section */}
        <Card className="rounded-[2.5rem] border-primary/5 bg-slate-950 p-8 text-white shadow-2xl relative overflow-hidden">
          <div className="absolute -right-10 -bottom-10 h-40 w-40 rounded-full bg-primary/5 blur-3xl" />
          
          <CardHeader className="p-0 mb-8">
            <CardTitle className="text-xl font-black flex items-center gap-3">
              <Users className="h-6 w-6 text-primary" />
              XLA / EMPLOYEE EXPERIENCE
            </CardTitle>
            <p className="text-xs text-slate-400 font-medium mt-1">Pontuação qualitativa da operação</p>
          </CardHeader>
          
          <CardContent className="p-0 space-y-8">
            <div className="space-y-6">
              {[
                { label: "FACILIDADE DE USO", val: govData?.xla_experience?.avg_ease || 8.5, max: 10, color: "bg-blue-500" },
                { label: "VELOCIDADE PERCEBIDA", val: govData?.xla_experience?.avg_speed || 7.2, max: 10, color: "bg-purple-500" },
                { label: "RESULTADO ESPERADO", val: govData?.xla_experience?.avg_outcome || 9.4, max: 10, color: "bg-emerald-500" },
              ].map((item, idx) => (
                <div key={idx} className="space-y-3">
                  <div className="flex justify-between items-end">
                    <span className="text-[10px] font-black tracking-widest text-slate-400 uppercase">{item.label}</span>
                    <span className="text-xl font-black">{item.val.toFixed(1)}<span className="text-xs text-slate-600">/10</span></span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-white/5 overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${(item.val / item.max) * 100}%` }}
                      className={cn("h-full rounded-full", item.color)} 
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-8 border-t border-white/5 space-y-4">
              <h4 className="text-xs font-black uppercase tracking-[0.2em] text-primary">CSI REGISTER (SUGESTÕES AI)</h4>
              <div className="space-y-3">
                <div className="group p-4 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all cursor-pointer">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-primary/20 flex items-center justify-center text-primary">
                      <ArrowRight className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-xs font-black">AUTOMAÇÃO DE TRIAGEM</p>
                      <p className="text-[10px] text-slate-400">Impacto previsto: -1.2d Lead Time</p>
                    </div>
                  </div>
                </div>
                <div className="group p-4 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all cursor-pointer">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-emerald-500/20 flex items-center justify-center text-emerald-500">
                      <CheckCircle2 className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-xs font-black">POLÍTICA DE SWARMING</p>
                      <p className="text-[10px] text-slate-400">Redução de gargalos em "Design"</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function cn(...inputs: any[]) {
  return inputs.filter(Boolean).join(" ")
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
