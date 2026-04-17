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
    <div className="space-y-8 pb-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight italic">MANAGER ANALYTICS</h1>
          <p className="text-muted-foreground">Governança de Fluxo e Experiência ITIL Version 5</p>
        </div>
        
        <div className="flex items-center gap-2">
          <Select value={selectedPipeline} onValueChange={setSelectedPipeline}>
            <SelectTrigger className="w-[200px] glass rounded-xl">
              <SelectValue placeholder="Selecione o Pipeline" />
            </SelectTrigger>
            <SelectContent>
              {pipelines.map(p => (
                <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <button 
            disabled={isExporting || !selectedPipeline}
            onClick={handleDownloadReport}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl font-bold text-xs hover:bg-primary/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed h-10"
          >
            {isExporting ? (
              <Activity className="h-4 w-4 animate-spin" />
            ) : (
              <FileDown className="h-4 w-4" />
            )}
            GERAR REPORT EXECUTIVO
          </button>
        </div>
      </div>

      {/* High-Level KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-white">
        <Card className="bg-primary/90 border-none shadow-xl shadow-primary/10">
          <CardContent className="pt-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-bold uppercase opacity-70">Lead Time Médio</p>
                <h3 className="text-3xl font-black">{vsmData?.avg_lead_time_days || 0}d</h3>
              </div>
              <Clock className="opacity-20 h-10 w-10" />
            </div>
            <p className="mt-2 text-[10px] opacity-70">Tempo total do pedido à entrega</p>
          </CardContent>
        </Card>

        <Card className="bg-emerald-600 border-none shadow-xl shadow-emerald-100">
          <CardContent className="pt-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-bold uppercase opacity-70">SLA Compliance</p>
                <h3 className="text-3xl font-black">{govData?.sla_compliance_rate || 100}%</h3>
              </div>
              <Target className="opacity-20 h-10 w-10" />
            </div>
            <p className="mt-2 text-[10px] opacity-70">Dentro do prazo contratual</p>
          </CardContent>
        </Card>

        <Card className="bg-slate-900 border-none shadow-xl shadow-slate-200">
          <CardContent className="pt-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-bold uppercase opacity-70">Throughput</p>
                <h3 className="text-3xl font-black">{vsmData?.throughput_weekly || 0}</h3>
              </div>
              <TrendingUp className="opacity-20 h-10 w-10" />
            </div>
            <p className="mt-2 text-[10px] opacity-70">Cards finalizados (últimos 7 dias)</p>
          </CardContent>
        </Card>

        <Card className="bg-rose-600 border-none shadow-xl shadow-rose-100">
          <CardContent className="pt-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-bold uppercase opacity-70">XLA Experience</p>
                <h3 className="text-3xl font-black">4.8/5</h3>
              </div>
              <Activity className="opacity-20 h-10 w-10" />
            </div>
            <p className="mt-2 text-[10px] opacity-70">Média de satisfação operacional</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Value Stream Map (VSM) Visualizer */}
        <Card className="lg:col-span-2 glass-morphism border-primary/10">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Layers className="h-5 w-5 text-primary" />
              Mapa do Fluxo de Valor (VSM)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-8">
            <div className="relative flex items-center justify-between pt-4 pb-8 overflow-x-auto gap-4 lg:gap-0">
               {vsmData?.residence_times.map((res: any, idx: number) => (
                 <div key={idx} className="flex-1 flex flex-col items-center group relative min-w-[120px]">
                    {idx < vsmData.residence_times.length - 1 && (
                      <div className="absolute top-5 left-1/2 w-full h-[2px] bg-border group-hover:bg-primary/30 transition-colors z-0" />
                    )}
                    <div className={cn(
                      "h-10 w-10 rounded-full flex items-center justify-center relative z-10 border-2 transition-all",
                      res.avg_days_residence > 4 ? "bg-rose-50 border-rose-500 text-rose-600" : "bg-primary/10 border-primary text-primary"
                    )}>
                      {res.count}
                    </div>
                    <div className="text-center mt-3">
                      <p className="text-[10px] font-black uppercase tracking-tighter truncate w-24">{res.column}</p>
                      <p className="text-[9px] text-muted-foreground font-mono">{res.avg_days_residence}d avg</p>
                    </div>
                    {res.avg_days_residence > 4 && (
                      <Badge variant="destructive" className="mt-2 text-[9px] h-4">Gargalo</Badge>
                    )}
                 </div>
               ))}
            </div>
            
            <div className="rounded-2xl bg-muted/30 p-4 border border-dashed flex items-center gap-4">
              <div className="h-10 w-10 rounded-xl bg-amber-100 flex items-center justify-center text-amber-600 shrink-0">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-bold">Diagnóstico de Fluxo</p>
                <p className="text-xs text-muted-foreground">A fase de <b>{vsmData?.residence_times.find((r:any) => r.avg_days_residence > 4)?.column || "Operação"}</b> possui o maior tempo de residência. Considere aumentar a capacidade de Swarming nesta área.</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Governance & XLA Detailed */}
        <Card className="glass-morphism border-primary/10">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              Experiência Operacional (XLA)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-bold">
                  <span>FACILIDADE DE USO</span>
                  <span>{govData?.xla_experience?.avg_ease?.toFixed(1) || "4.5"}/10</span>
                </div>
                <Progress value={(govData?.xla_experience?.avg_ease || 4.5) * 10} className="h-1.5" />
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-xs font-bold">
                  <span>VELOCIDADE PERCEBIDA</span>
                  <span>{govData?.xla_experience?.avg_speed?.toFixed(1) || "4.2"}/10</span>
                </div>
                <Progress value={(govData?.xla_experience?.avg_speed || 4.2) * 10} className="h-1.5" />
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-xs font-bold">
                  <span>SATISFAÇÃO COM RESULTADO</span>
                  <span>{govData?.xla_experience?.avg_outcome?.toFixed(1) || "4.9"}/10</span>
                </div>
                <Progress value={(govData?.xla_experience?.avg_outcome || 4.9) * 10} className="h-1.5" />
              </div>
            </div>

            <div className="pt-4 border-t space-y-4">
              <h4 className="text-xs font-black uppercase tracking-widest text-muted-foreground">Próximas melhorias sugeridas</h4>
              <div className="space-y-2">
                <div className="p-3 rounded-xl bg-background border flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                    <ArrowRight className="h-4 w-4" />
                  </div>
                  <p className="text-xs font-medium">Automatizar Triagem de Incidentes Críticos</p>
                </div>
                <div className="p-3 rounded-xl bg-background border flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-600">
                    <CheckCircle2 className="h-4 w-4" />
                  </div>
                  <p className="text-xs font-medium">Revisar política de Swarming em "Design"</p>
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
