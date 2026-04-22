"use client"

import { useMemo, useState } from "react"
import { useFinance, Transaction } from "./use-finance"
import dynamic from "next/dynamic"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Plus, Trash2, Edit2, TrendingUp, TrendingDown, Download, Calendar, Filter, Sparkles, Loader2, Search, DollarSign } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { endOfMonth, endOfWeek, format, parseISO, startOfWeek, eachDayOfInterval } from "date-fns"
import { ptBR } from "date-fns/locale"
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

const TransactionDialog = dynamic(
  () => import("./transaction-dialog").then((m) => m.TransactionDialog),
  { ssr: false }
)

export function TransactionList() {
  const now = useMemo(() => new Date(), [])
  const [periodMode, setPeriodMode] = useState<'day' | 'week' | 'month' | 'semester' | 'year'>('month')
  const [selectedYear, setSelectedYear] = useState<number>(now.getFullYear())
  const [selectedMonth, setSelectedMonth] = useState<number>(now.getMonth() + 1)
  const [selectedSemester, setSelectedSemester] = useState<1 | 2>(now.getMonth() < 6 ? 1 : 2)
  const [selectedDate, setSelectedDate] = useState<string>(() => format(now, "yyyy-MM-dd"))
  const [searchTerm, setSearchTerm] = useState("")

  const range = useMemo(() => {
    if (periodMode === 'day') {
      const base = parseISO(selectedDate)
      const start = new Date(base.getFullYear(), base.getMonth(), base.getDate(), 0, 0, 0)
      const end = new Date(base.getFullYear(), base.getMonth(), base.getDate(), 23, 59, 59)
      return { start, end }
    }
    if (periodMode === 'week') {
      const base = parseISO(selectedDate)
      const start = startOfWeek(base, { weekStartsOn: 1 })
      const end = endOfWeek(base, { weekStartsOn: 1 })
      return { start, end }
    }
    if (periodMode === 'month') {
      const start = new Date(selectedYear, selectedMonth - 1, 1)
      const end = endOfMonth(start)
      return { start, end }
    }
    if (periodMode === 'semester') {
      const start = new Date(selectedYear, selectedSemester === 1 ? 0 : 6, 1)
      const end = endOfMonth(new Date(selectedYear, selectedSemester === 1 ? 5 : 11, 1))
      return { start, end }
    }
    const start = new Date(selectedYear, 0, 1)
    const end = new Date(selectedYear, 11, 31)
    return { start, end }
  }, [periodMode, selectedMonth, selectedSemester, selectedDate, selectedYear])

  const rangeStart = useMemo(() => format(range.start, "yyyy-MM-dd"), [range.start])
  const rangeEnd = useMemo(() => format(range.end, "yyyy-MM-dd"), [range.end])

  const { transactions, categories, isLoading, createCategory, createTransaction, updateTransaction, deleteTransaction } = useFinance({
    start: rangeStart,
    end: rangeEnd,
  })
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null)
  const [categoryFilter, setCategoryFilter] = useState<string>("all")

  const filteredTransactions = useMemo(() => {
    const start = range.start.getTime()
    const end = range.end.getTime()
    return transactions.filter((t) => {
      const dt = new Date(t.competence_date).getTime()
      const inRange = dt >= start && dt <= end
      const matchesCategory = categoryFilter === "all" || String(t.category) === categoryFilter
      const matchesSearch = t.description.toLowerCase().includes(searchTerm.toLowerCase())
      return inRange && matchesCategory && matchesSearch
    })
  }, [range.end, range.start, transactions, categoryFilter, searchTerm])

  const handleExportCSV = () => {
    const headers = ["Descrição", "Tipo", "Valor", "Vencimento", "Status", "Categoria"]
    const rows = filteredTransactions.map(t => [
      t.description,
      t.type === 'in' ? 'Receita' : 'Despesa',
      t.amount,
      t.due_date,
      t.status,
      t.category_details?.name || 'N/A'
    ])
    
    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n")
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.setAttribute("href", url)
    link.setAttribute("download", `financeiro_atlas_${format(new Date(), "yyyy-MM-dd")}.csv`)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    toast.success("CSV exportado com sucesso!")
  }

  const handleCreate = () => {
    setSelectedTransaction(null)
    setIsDialogOpen(true)
  }

  const handleEdit = (transaction: Transaction) => {
    setSelectedTransaction(transaction)
    setIsDialogOpen(true)
  }

  const totalIn = filteredTransactions
    .filter(t => t.type === 'in' && t.status === 'paid')
    .reduce((acc, curr) => acc + parseFloat(curr.amount), 0)
    
  const totalOut = filteredTransactions
    .filter(t => t.type === 'out' && t.status === 'paid')
    .reduce((acc, curr) => acc + parseFloat(curr.amount), 0)

  const balance = totalIn - totalOut

  const chartData = useMemo(() => {
    const days = eachDayOfInterval({ start: range.start, end: range.end })
    return days.map(day => {
      const dayStr = format(day, "yyyy-MM-dd")
      const dayTransactions = filteredTransactions.filter(t => t.due_date === dayStr)
      const receipts = dayTransactions.filter(t => t.type === 'in').reduce((acc, t) => acc + parseFloat(t.amount), 0)
      const expenses = dayTransactions.filter(t => t.type === 'out').reduce((acc, t) => acc + parseFloat(t.amount), 0)
      
      return {
        name: format(day, "dd/MM", { locale: ptBR }),
        receipts,
        expenses,
        balance: receipts - expenses
      }
    })
  }, [range.start, range.end, filteredTransactions])

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-1000">
      {/* Control Panel */}
      <Card className="rounded-[2.5rem] border border-white/10 bg-white/5 backdrop-blur-xl p-8 shadow-2xl relative overflow-hidden group/controls">
        <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover/controls:opacity-100 transition-opacity duration-700" />
        <CardContent className="p-0 relative z-10">
          <div className="flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
            <div className="flex flex-wrap gap-6 items-end">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 ml-1">Escopo Temporal</label>
                <Select value={periodMode} onValueChange={(v) => setPeriodMode(v as 'day' | 'week' | 'month' | 'semester' | 'year')}>
                  <SelectTrigger className="w-full md:w-48 h-11 rounded-xl border-white/10 bg-white/5 hover:bg-white/10 transition-all font-bold text-xs shadow-inner">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-2xl border-white/10 bg-background/95 backdrop-blur-xl shadow-2xl">
                    <SelectItem value="day" className="rounded-xl font-bold">Diário</SelectItem>
                    <SelectItem value="week" className="rounded-xl font-bold">Semanal</SelectItem>
                    <SelectItem value="month" className="rounded-xl font-bold">Mensal</SelectItem>
                    <SelectItem value="semester" className="rounded-xl font-bold">Semestral</SelectItem>
                    <SelectItem value="year" className="rounded-xl font-bold">Anual</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {(periodMode === 'week' || periodMode === 'day') && (
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 ml-1">{periodMode === 'week' ? 'Semana de' : 'Data Base'}</label>
                  <Input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="w-full md:w-48 h-11 rounded-xl border-white/10 bg-white/5 hover:bg-white/10 transition-all font-bold text-xs shadow-inner"
                  />
                </div>
              )}

              {periodMode === 'month' && (
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 ml-1">Mês de Referência</label>
                  <Select value={String(selectedMonth)} onValueChange={(v) => setSelectedMonth(Number(v))}>
                    <SelectTrigger className="w-full md:w-48 h-11 rounded-xl border-white/10 bg-white/5 hover:bg-white/10 transition-all font-bold text-xs shadow-inner">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-2xl border-white/10 bg-background/95 backdrop-blur-xl shadow-2xl">
                      {Array.from({ length: 12 }).map((_, idx) => {
                        const m = idx + 1
                        const label = format(new Date(2020, idx, 1), "MMMM", { locale: ptBR })
                        return (
                          <SelectItem key={m} value={String(m)} className="rounded-xl font-bold">
                            {label.charAt(0).toUpperCase() + label.slice(1)}
                          </SelectItem>
                        )
                      })}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {periodMode === 'semester' && (
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 ml-1">Semestre</label>
                  <Select value={String(selectedSemester)} onValueChange={(v) => setSelectedSemester((Number(v) as 1 | 2) || 1)}>
                    <SelectTrigger className="w-full md:w-48 h-11 rounded-xl border-white/10 bg-white/5 hover:bg-white/10 transition-all font-bold text-xs shadow-inner">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-2xl border-white/10 bg-background/95 backdrop-blur-xl shadow-2xl">
                      <SelectItem value="1" className="rounded-xl font-bold">1º Semestre</SelectItem>
                      <SelectItem value="2" className="rounded-xl font-bold">2º Semestre</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {periodMode !== 'week' && (
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 ml-1">Exercício (Ano)</label>
                  <Select value={String(selectedYear)} onValueChange={(v) => setSelectedYear(Number(v))}>
                    <SelectTrigger className="w-full md:w-32 h-11 rounded-xl border-white/10 bg-white/5 hover:bg-white/10 transition-all font-bold text-xs shadow-inner">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-2xl border-white/10 bg-background/95 backdrop-blur-xl shadow-2xl">
                      {Array.from({ length: 6 }).map((_, idx) => {
                        const y = now.getFullYear() - 2 + idx
                        return (
                          <SelectItem key={y} value={String(y)} className="rounded-xl font-bold">
                            {y}
                          </SelectItem>
                        )
                      })}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 ml-1">Segmentação</label>
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="w-full md:w-48 h-11 rounded-xl border-white/10 bg-white/5 hover:bg-white/10 transition-all font-bold text-xs shadow-inner">
                    <SelectValue placeholder="Categorias" />
                  </SelectTrigger>
                  <SelectContent className="rounded-2xl border-white/10 bg-background/95 backdrop-blur-xl shadow-2xl">
                    <SelectItem value="all" className="rounded-xl font-bold">Todas as categorias</SelectItem>
                    {categories.map((cat) => (
                      <SelectItem key={cat.id} value={String(cat.id)} className="rounded-xl font-bold">{cat.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex flex-col items-end gap-3">
              <div className="text-[10px] font-black uppercase tracking-[0.15em] text-emerald-500 bg-emerald-500/10 border border-emerald-500/20 px-4 py-1.5 rounded-full flex items-center gap-2 shadow-lg shadow-emerald-500/5">
                <Calendar className="h-3 w-3" />
                Sincronização de Fluxo Ativa
              </div>
              <div className="text-xs text-muted-foreground font-black tracking-widest opacity-60">
                {format(range.start, "dd MMM yyyy", { locale: ptBR }).toUpperCase()} — {format(range.end, "dd MMM yyyy", { locale: ptBR }).toUpperCase()}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1fr_350px]">
        {/* Chart Section */}
        <Card className="rounded-[2.5rem] border border-white/10 bg-white/5 backdrop-blur-xl p-8 shadow-2xl relative overflow-hidden flex flex-col justify-between">
           <div className="mb-6 flex items-center justify-between">
              <div className="space-y-1">
                <h3 className="text-sm font-black uppercase tracking-[0.2em] text-primary flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" /> Evolução de Caixa
                </h3>
                <p className="text-[10px] text-muted-foreground font-bold">Gráfico de desempenho financeiro no período.</p>
              </div>
              <div className="flex gap-4">
                 <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-emerald-500 shadow-lg shadow-emerald-500/40" />
                    <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Receitas</span>
                 </div>
                 <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-rose-500 shadow-lg shadow-rose-500/40" />
                    <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Despesas</span>
                 </div>
              </div>
           </div>
           
           <div className="h-[320px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorReceipts" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorExpenses" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                <XAxis 
                  dataKey="name" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 9, fill: '#64748b', fontWeight: 'bold' }}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 9, fill: '#64748b', fontWeight: 'bold' }}
                  tickFormatter={(value) => `R$ ${value}`}
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'rgba(15,15,20,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', backdropFilter: 'blur(12px)', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)' }}
                  itemStyle={{ fontSize: '11px', fontWeight: 'bold' }}
                  labelStyle={{ fontSize: '10px', color: '#64748b', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: '900' }}
                />
                <Area 
                  type="monotone" 
                  dataKey="receipts" 
                  name="RECEITAS"
                  stroke="#10b981" 
                  fillOpacity={1} 
                  fill="url(#colorReceipts)" 
                  strokeWidth={4}
                />
                <Area 
                  type="monotone" 
                  dataKey="expenses" 
                  name="DESPESAS"
                  stroke="#ef4444" 
                  fillOpacity={1} 
                  fill="url(#colorExpenses)" 
                  strokeWidth={4}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Summary Side Cards */}
        <div className="flex flex-col gap-6">
          <Card className="rounded-3xl border border-white/10 bg-emerald-500/5 backdrop-blur-md p-6 shadow-xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-5 rotate-12 group-hover:scale-110 transition-transform duration-500">
               <TrendingUp className="h-20 w-20 text-emerald-500" />
            </div>
            <div className="relative z-10 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-widest text-emerald-500/80">Receitas Realizadas</span>
                <div className="h-8 w-8 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                  <TrendingUp className="h-4 w-4 text-emerald-500" />
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-3xl font-black tracking-tighter text-emerald-500">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalIn)}
                </div>
                <p className="text-[10px] text-muted-foreground font-bold">Total consolidado no período</p>
              </div>
            </div>
          </Card>

          <Card className="rounded-3xl border border-white/10 bg-rose-500/5 backdrop-blur-md p-6 shadow-xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-5 rotate-12 group-hover:scale-110 transition-transform duration-500">
               <TrendingDown className="h-20 w-20 text-rose-500" />
            </div>
            <div className="relative z-10 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-widest text-rose-500/80">Despesas Realizadas</span>
                <div className="h-8 w-8 rounded-xl bg-rose-500/10 flex items-center justify-center">
                  <TrendingDown className="h-4 w-4 text-rose-500" />
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-3xl font-black tracking-tighter text-rose-500">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalOut)}
                </div>
                <p className="text-[10px] text-muted-foreground font-bold">Saídas totais confirmadas</p>
              </div>
            </div>
          </Card>

          <Card className={cn(
            "rounded-3xl border border-white/10 backdrop-blur-md p-6 shadow-xl relative overflow-hidden group flex-1 flex flex-col justify-center",
            balance >= 0 ? "bg-primary/5" : "bg-orange-500/5"
          )}>
            <div className="absolute top-0 right-0 p-4 opacity-5 rotate-12 group-hover:scale-110 transition-transform duration-500">
               <DollarSign className="h-20 w-20 text-primary" />
            </div>
            <div className="relative z-10 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-widest text-primary/80">Disponibilidade Líquida</span>
                <div className="h-8 w-8 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Sparkles className="h-4 w-4 text-primary" />
                </div>
              </div>
              <div className="space-y-1">
                <div className={cn("text-4xl font-black tracking-tighter", balance >= 0 ? "text-primary" : "text-orange-500")}>
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(balance)}
                </div>
                <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">Saldo do período</p>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Transactions Table Section */}
      <Card className="rounded-[2.5rem] border border-white/10 bg-white/5 backdrop-blur-xl shadow-2xl relative overflow-hidden">
        <div className="px-8 py-6 border-b border-white/10 flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between bg-white/5">
          <div className="space-y-1">
            <h3 className="text-lg font-black uppercase tracking-[0.2em] text-primary">Detalhamento de Transações</h3>
            <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest opacity-60">Livro-razão financeiro automatizado.</p>
          </div>
          
          <div className="flex flex-wrap items-center gap-4">
             <div className="relative w-full sm:w-64">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Pesquisar..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="h-10 pl-11 rounded-xl border-white/10 bg-white/5 hover:bg-white/10 focus:ring-primary/20 transition-all font-bold text-xs"
                />
             </div>
             
             <div className="flex items-center gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleExportCSV}
                  className="h-10 px-4 rounded-xl font-black uppercase tracking-widest text-[9px] border-white/10 bg-white/5 hover:bg-white/10 transition-all shadow-lg"
                >
                  <Download className="h-3.5 w-3.5 mr-2 text-primary" />
                  Exportar CSV
                </Button>
                <Button 
                  onClick={handleCreate} 
                  size="sm"
                  className="h-10 px-6 rounded-xl font-black uppercase tracking-widest text-[9px] bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20 transition-all"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Nova Transação
                </Button>
             </div>
          </div>
        </div>

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-white/5">
                <TableRow className="hover:bg-transparent border-white/5">
                  <TableHead className="px-8 text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 h-14">Descrição</TableHead>
                  <TableHead className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 h-14">Segmentação</TableHead>
                  <TableHead className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 h-14">Temporalidade</TableHead>
                  <TableHead className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 h-14">Status</TableHead>
                  <TableHead className="text-right text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 h-14">Valor Líquido</TableHead>
                  <TableHead className="px-8 text-right text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 h-14">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center h-48">
                       <div className="flex flex-col items-center gap-3">
                          <Loader2 className="h-8 w-8 text-primary animate-spin" />
                          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Processando dados...</span>
                       </div>
                    </TableCell>
                  </TableRow>
                ) : filteredTransactions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center h-48">
                       <div className="flex flex-col items-center gap-3 opacity-30">
                          <Sparkles className="h-10 w-10 text-muted-foreground" />
                          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Nenhuma transação registrada no período.</span>
                       </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredTransactions.map((transaction) => (
                    <TableRow key={transaction.id} className="group hover:bg-white/5 transition-colors border-white/5">
                      <TableCell className="px-8 py-4">
                         <div className="font-bold text-sm text-foreground/90">{transaction.description}</div>
                         <div className="text-[10px] text-muted-foreground/60 font-bold uppercase tracking-tight mt-0.5">ID: {transaction.id.slice(0, 8)}</div>
                      </TableCell>
                      <TableCell>
                        {transaction.category_details ? (
                          <div className="inline-flex items-center gap-2 rounded-lg px-3 py-1 bg-white/5 border border-white/5">
                             <div className="h-1.5 w-1.5 rounded-full shadow-lg" style={{ backgroundColor: transaction.category_details.color }} />
                             <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                               {transaction.category_details.name}
                             </span>
                          </div>
                        ) : (
                          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground opacity-30">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                         <div className="text-xs font-bold text-muted-foreground">
                           {format(new Date(transaction.due_date), 'dd MMM yyyy', { locale: ptBR }).toUpperCase()}
                         </div>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={transaction.status} />
                      </TableCell>
                      <TableCell className={cn(
                        "text-right font-black text-sm tracking-tighter",
                        transaction.type === 'in' ? 'text-emerald-500' : 'text-rose-500'
                      )}>
                        {transaction.type === 'in' ? '+' : '-'} 
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(parseFloat(transaction.amount))}
                      </TableCell>
                      <TableCell className="px-8 text-right">
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                           <Button variant="ghost" size="icon" onClick={() => handleEdit(transaction)} className="h-8 w-8 rounded-lg hover:bg-primary/10 hover:text-primary">
                             <Edit2 className="h-4 w-4" />
                           </Button>
                           <Button 
                             variant="ghost" 
                             size="icon" 
                             onClick={() => {
                               if (confirm("Deseja realmente excluir esta transação?")) {
                                 deleteTransaction.mutate(transaction.id)
                               }
                             }} 
                             className="h-8 w-8 rounded-lg hover:bg-rose-500/10 hover:text-rose-500"
                           >
                             <Trash2 className="h-4 w-4" />
                           </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <TransactionDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        transaction={selectedTransaction}
        categories={categories}
        onCreateTransaction={async (values) => {
          await createTransaction.mutateAsync(values)
        }}
        onUpdateTransaction={async (values) => {
          await updateTransaction.mutateAsync(values)
        }}
        onCreateCategory={async (values) => {
          return await createCategory.mutateAsync(values)
        }}
        isSaving={createTransaction.isPending || updateTransaction.isPending}
        isCreatingCategory={createCategory.isPending}
      />
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const configs: Record<string, { label: string, color: string, icon: any }> = {
    pending: { label: "Pendente", color: "text-amber-500 bg-amber-500/10 border-amber-500/20", icon: Calendar },
    paid: { label: "Consolidado", color: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20", icon: Sparkles },
    overdue: { label: "Em Atraso", color: "text-rose-500 bg-rose-500/10 border-rose-500/20", icon: Trash2 },
    cancelled: { label: "Estornado", color: "text-slate-500 bg-slate-500/10 border-slate-500/20", icon: Edit2 },
  }
  
  const config = configs[status] || configs.pending

  return (
    <div className={cn(
      "inline-flex items-center gap-2 rounded-lg px-3 py-1 border font-black uppercase tracking-widest text-[9px] shadow-sm",
      config.color
    )}>
      <config.icon className="h-3 w-3" />
      {config.label}
    </div>
  )
}
