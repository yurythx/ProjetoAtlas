"use client"

import {
    Area,
    AreaChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
    CartesianGrid
} from "recharts"
import { motion } from "framer-motion"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"

interface ChartData {
    date: string
    count: number
}

interface LegacyChartData {
    name: string
    value: number
}

interface AnalyticsChartProps {
    data: Array<ChartData | LegacyChartData>
    title: string
    isLoading?: boolean
}

export function AnalyticsChart({ data, title, isLoading }: AnalyticsChartProps) {
    if (isLoading) {
        return (
            <div className="glass-morphism p-6 rounded-3xl border shadow-sm h-full flex flex-col animate-pulse" role="status" aria-live="polite" aria-label={`Carregando gráfico: ${title}`}>
                <div className="h-6 w-1/3 bg-muted rounded-md mb-8" />
                <div className="flex-1 bg-muted/20 rounded-2xl" />
            </div>
        )
    }

    const normalizedData: ChartData[] = data
        .map((d) => {
            if ("date" in d && "count" in d) return { date: d.date, count: d.count }
            if ("name" in d && "value" in d) return { date: d.name, count: d.value }
            return null
        })
        .filter((d): d is ChartData => Boolean(d && d.date))

    if (normalizedData.length === 0) {
        return (
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="glass-morphism p-6 rounded-3xl border shadow-sm h-full flex flex-col"
            >
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h3 className="text-lg font-bold tracking-tight text-foreground">{title}</h3>
                        <p className="text-xs text-muted-foreground mt-0.5 font-medium">
                            Visualizações totais nos últimos 30 dias
                        </p>
                    </div>
                </div>
                <div className="flex-1 min-h-[300px] w-full flex items-center justify-center text-sm text-muted-foreground">
                    Sem dados para exibir.
                </div>
            </motion.div>
        )
    }

    // Sort data by date
    const sortedData = [...normalizedData].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-morphism p-6 rounded-3xl border shadow-sm h-full flex flex-col"
        >
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h3 className="text-lg font-bold tracking-tight text-foreground">{title}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5 font-medium">Visualizações totais nos últimos 30 dias</p>
                </div>
                <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-primary" aria-hidden="true" />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Views</span>
                </div>
            </div>

            <div className="flex-1 min-h-[300px] w-full" role="img" aria-label={`Gráfico de ${title}`}>
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={sortedData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <defs>
                            <linearGradient id="colorViews" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid
                            vertical={false}
                            strokeDasharray="3 3"
                            stroke="hsl(var(--muted-foreground) / 0.1)"
                        />
                        <XAxis
                            dataKey="date"
                            axisLine={false}
                            tickLine={false}
                            tickFormatter={(str) => {
                                const dt = new Date(str)
                                return Number.isNaN(dt.getTime()) ? String(str) : format(dt, "dd MMM", { locale: ptBR })
                            }}
                            tick={{ fontSize: 10, fontWeight: 600, fill: "hsl(var(--muted-foreground))" }}
                            dy={10}
                        />
                        <YAxis
                            axisLine={false}
                            tickLine={false}
                            tick={{ fontSize: 10, fontWeight: 600, fill: "hsl(var(--muted-foreground))" }}
                        />
                        <Tooltip
                            contentStyle={{
                                backgroundColor: "var(--glass-bg)",
                                borderRadius: "16px",
                                border: "1px solid var(--border)",
                                backdropFilter: "blur(16px)",
                                padding: "12px",
                                boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)"
                            }}
                            labelStyle={{ color: "hsl(var(--foreground))", fontWeight: "bold", marginBottom: "4px" }}
                            itemStyle={{ color: "var(--color-primary)", fontSize: "12px", fontWeight: "600" }}
                            labelFormatter={(label) => {
                                const dt = new Date(label)
                                return Number.isNaN(dt.getTime())
                                    ? String(label)
                                    : format(dt, "dd 'de' MMMM", { locale: ptBR })
                            }}
                        />
                        <Area
                            type="monotone"
                            dataKey="count"
                            stroke="var(--color-primary)"
                            strokeWidth={3}
                            fillOpacity={1}
                            fill="url(#colorViews)"
                            animationDuration={2000}
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </motion.div>
    )
}
