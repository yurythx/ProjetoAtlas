"use client"

import { type ComponentType, useEffect, useMemo } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { motion } from "framer-motion"
import {
  Activity,
  BadgeDollarSign,
  BookOpen,
  Boxes,
  CalendarDays,
  Cloud,
  Headset,
  Info,
  LayoutTemplate,
  MessageCircle,
  Music,
  PlayCircle,
  Workflow,
  Wrench,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { api } from "@/lib/axios"

type PublicCompany = { name: string; slug: string; logo?: string | null }

type ServiceCard = {
  title: string
  description: string
  href: string
  external?: boolean
  icon: ComponentType<{ className?: string }>
  tone: "violet" | "blue" | "emerald" | "amber" | "rose" | "slate"
}

type ServiceCategory = {
  title: string
  description?: string
  tone: ServiceCard["tone"]
  items: ServiceCard[]
}

function toneClasses(tone: ServiceCard["tone"]) {
  const map: Record<ServiceCard["tone"], { ring: string; bg: string; glow: string; text: string }> = {
    violet: {
      ring: "ring-violet-500/20",
      bg: "bg-violet-500/10",
      glow: "shadow-[0_0_0_1px_rgba(139,92,246,0.15),0_24px_60px_-30px_rgba(139,92,246,0.45)]",
      text: "text-violet-600 dark:text-violet-300",
    },
    blue: {
      ring: "ring-sky-500/20",
      bg: "bg-sky-500/10",
      glow: "shadow-[0_0_0_1px_rgba(14,165,233,0.15),0_24px_60px_-30px_rgba(14,165,233,0.45)]",
      text: "text-sky-600 dark:text-sky-300",
    },
    emerald: {
      ring: "ring-emerald-500/20",
      bg: "bg-emerald-500/10",
      glow: "shadow-[0_0_0_1px_rgba(16,185,129,0.15),0_24px_60px_-30px_rgba(16,185,129,0.45)]",
      text: "text-emerald-600 dark:text-emerald-300",
    },
    amber: {
      ring: "ring-amber-500/20",
      bg: "bg-amber-500/10",
      glow: "shadow-[0_0_0_1px_rgba(245,158,11,0.15),0_24px_60px_-30px_rgba(245,158,11,0.45)]",
      text: "text-amber-600 dark:text-amber-300",
    },
    rose: {
      ring: "ring-rose-500/20",
      bg: "bg-rose-500/10",
      glow: "shadow-[0_0_0_1px_rgba(244,63,94,0.15),0_24px_60px_-30px_rgba(244,63,94,0.45)]",
      text: "text-rose-600 dark:text-rose-300",
    },
    slate: {
      ring: "ring-slate-500/20",
      bg: "bg-slate-500/10",
      glow: "shadow-[0_0_0_1px_rgba(100,116,139,0.15),0_24px_60px_-30px_rgba(100,116,139,0.35)]",
      text: "text-slate-700 dark:text-slate-200",
    },
  }
  return map[tone]
}

function ServiceLink({
  card,
  children,
}: {
  card: ServiceCard
  children: React.ReactNode
}) {
  if (card.external) {
    return (
      <a href={card.href} target="_blank" rel="noopener noreferrer" className="block h-full">
        {children}
      </a>
    )
  }
  return (
    <Link href={card.href} className="block h-full">
      {children}
    </Link>
  )
}

function ServiceTile({ card, categoryLabel }: { card: ServiceCard; categoryLabel: string }) {
  const Icon = card.icon
  const tone = toneClasses(card.tone)

  return (
    <ServiceLink card={card}>
      <div
        className={cn(
          "group relative overflow-hidden rounded-3xl border bg-card/50 backdrop-blur-sm h-full",
          "transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-xl hover:border-primary/20",
          "focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2 focus-within:ring-offset-background"
        )}
      >
        <div className={cn("absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300", tone.bg)} />
        <div className="relative p-6 h-full">
          <div className="flex items-start gap-4 h-full">
            <div
              className={cn(
                "h-12 w-12 rounded-2xl flex items-center justify-center ring-1",
                tone.bg,
                tone.ring,
                tone.glow
              )}
            >
              <Icon className={cn("h-6 w-6", tone.text)} aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1 h-full flex flex-col">
              <div className="flex flex-col gap-2">
                <h3 className="text-lg font-extrabold tracking-tight leading-tight break-words">
                  {card.title}
                </h3>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] px-2 py-0.5 rounded-full border bg-background/60 text-muted-foreground">
                    {categoryLabel}
                  </span>
                  {card.external && (
                    <span className="text-[11px] px-2 py-0.5 rounded-full border bg-background/60 text-muted-foreground">
                      Externo
                    </span>
                  )}
                </div>
              </div>
              <p className="mt-1 text-sm text-muted-foreground leading-relaxed line-clamp-3">
                {card.description}
              </p>
              <div className="mt-auto pt-4 inline-flex items-center gap-2 text-sm font-semibold text-primary">
                Acessar
                <span className="transition-transform duration-300 group-hover:translate-x-1">→</span>
              </div>
            </div>
          </div>
        </div>
        <div className="absolute -top-24 -right-24 h-56 w-56 rounded-full bg-gradient-to-br from-primary/10 to-transparent blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      </div>
    </ServiceLink>
  )
}

export default function PublicServicesEcosystemPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const companySlugFromQuery = (searchParams.get("company_slug") || "").trim() || null

  const { data: companies, isLoading: isLoadingCompanies } = useQuery({
    queryKey: ["public-companies"],
    queryFn: async ({ signal }) => {
      const res = await api.get<PublicCompany[]>("/api/core/companies/public_list/", { signal })
      return Array.isArray(res.data) ? res.data : []
    },
    staleTime: 10 * 60 * 1000,
    retry: 1,
  })

  const effectiveCompanySlug = companySlugFromQuery || null

  useEffect(() => {
    if (effectiveCompanySlug) return
    if (isLoadingCompanies) return
    const list = companies ?? []
    if (list.length !== 1) return
    router.replace(`/p/ecossistema-de-servicos?company_slug=${encodeURIComponent(list[0].slug)}`)
  }, [companies, effectiveCompanySlug, isLoadingCompanies, router])

  const categories: ServiceCategory[] = useMemo(
    () => [
      {
        title: "Institucional",
        description: "Quem somos e o que estamos construindo.",
        tone: "slate",
        items: [
          {
            title: "Sobre o Projeto",
            description: "Conheça o Atlas, nossa visão e tudo o que fazemos por aqui.",
            href: "/p/sobre",
            icon: Info,
            tone: "slate",
          },
        ],
      },
      {
        title: "Conhecimento",
        description: "Documentação, tutoriais e novidades.",
        tone: "violet",
        items: [
          {
            title: "Central de Artigos",
            description: "Base de conhecimento com guias, tutoriais e publicações.",
            href: "/p/artigos",
            icon: BookOpen,
            tone: "violet",
          },
        ],
      },
      {
        title: "CRM",
        description: "Operação comercial e suporte em um só lugar.",
        tone: "rose",
        items: [
          {
            title: "CRM / Suporte",
            description: "Gestão de cards, funil e atendimento interno.",
            href: "/crm",
            icon: Headset,
            tone: "rose",
          },
        ],
      },
      {
        title: "Agenda",
        description: "Compromissos, eventos e rotinas do time.",
        tone: "blue",
        items: [
          {
            title: "Calendário",
            description: "Agenda centralizada com visualizações e integrações.",
            href: "/calendar",
            icon: CalendarDays,
            tone: "blue",
          },
        ],
      },
      {
        title: "Financeiro",
        description: "Controle e visibilidade do financeiro.",
        tone: "emerald",
        items: [
          {
            title: "Financeiro",
            description: "Gestão de lançamentos e acompanhamento financeiro.",
            href: "/finance",
            icon: BadgeDollarSign,
            tone: "emerald",
          },
        ],
      },
      {
        title: "Comunicação",
        description: "Conecte times e clientes com canais integrados.",
        tone: "blue",
        items: [
          {
            title: "Atlas Messenger",
            description: "Chat em tempo real integrado ao ecossistema.",
            href: "/messenger",
            icon: MessageCircle,
            tone: "blue",
          },
          {
            title: "Evolution API",
            description: "Integração com WhatsApp Business para automação de mensagens.",
            href: "https://evolution.projetoravenna.cloud/",
            external: true,
            icon: Workflow,
            tone: "emerald",
          },
          {
            title: "Atendimento",
            description: "Plataforma de atendimento com tickets e múltiplos canais.",
            href: "https://atendimento.projetoravenna.cloud/",
            external: true,
            icon: Headset,
            tone: "rose",
          },
        ],
      },
      {
        title: "Produtividade",
        description: "Organização, conteúdo e colaboração.",
        tone: "emerald",
        items: [
          {
            title: "Criador de Páginas",
            description: "Crie e gerencie páginas com editor visual e controle de publicação.",
            href: "/cms",
            icon: LayoutTemplate,
            tone: "emerald",
          },
          {
            title: "Nextcloud",
            description: "Colaboração e compartilhamento de arquivos com privacidade.",
            href: "https://nextcloud.projetoravenna.cloud/",
            external: true,
            icon: Cloud,
            tone: "blue",
          },
        ],
      },
      {
        title: "Entretenimento",
        description: "Bibliotecas e streaming pessoal.",
        tone: "amber",
        items: [
          {
            title: "Jellyfin",
            description: "Servidor de mídia para vídeos, músicas e fotos.",
            href: "https://jellyfin.projetoravenna.cloud/",
            external: true,
            icon: PlayCircle,
            tone: "amber",
          },
          {
            title: "Komga",
            description: "Biblioteca de quadrinhos e mangás com leitor web.",
            href: "https://komga.projetoravenna.cloud/",
            external: true,
            icon: BookOpen,
            tone: "violet",
          },
          {
            title: "Navidrome",
            description: "Servidor de música moderno compatível com Subsonic.",
            href: "https://navidrome.projetoravenna.cloud/",
            external: true,
            icon: Music,
            tone: "rose",
          },
        ],
      },
      {
        title: "Automação",
        description: "Workflows e integrações para eliminar tarefas repetitivas.",
        tone: "slate",
        items: [
          {
            title: "n8n",
            description: "Automação de workflows conectando serviços com baixo código.",
            href: "https://n8n.projetoravenna.cloud/",
            external: true,
            icon: Workflow,
            tone: "slate",
          },
        ],
      },
      {
        title: "Monitoramento",
        description: "Visibilidade e saúde dos serviços.",
        tone: "blue",
        items: [
          {
            title: "Zabbix",
            description: "Monitoramento de infraestrutura e alertas em tempo real.",
            href: "https://zabbix.projetoravenna.cloud/",
            external: true,
            icon: Activity,
            tone: "blue",
          },
        ],
      },
      {
        title: "Gerenciamento",
        description: "Administração e suporte de TI.",
        tone: "emerald",
        items: [
          {
            title: "Portainer",
            description: "Gerenciamento de containers e stacks Docker via interface.",
            href: "https://portainer.projetoravenna.cloud/",
            external: true,
            icon: Boxes,
            tone: "emerald",
          },
          {
            title: "GLPI",
            description: "Gestão de ativos e help desk para suporte técnico.",
            href: "https://glpi.projetoravenna.cloud/",
            external: true,
            icon: Wrench,
            tone: "amber",
          },
        ],
      },
    ],
    []
  )

  const services = useMemo(
    () =>
      categories.flatMap((cat) =>
        cat.items.map((item) => ({
          categoryLabel: cat.title,
          card: item,
        }))
      ),
    [categories]
  )

  return (
    <div className="py-10 sm:py-12 space-y-10">
      <header className="text-center max-w-3xl mx-auto space-y-4">
        <div className="flex justify-center">
          <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Boxes className="h-6 w-6 text-primary" aria-hidden="true" />
          </div>
        </div>
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
          Ecossistema de Serviços
        </h1>
        <p className="text-muted-foreground text-base sm:text-lg">
          Acesse aplicativos e ferramentas organizados por categoria. Tudo com um clique.
        </p>
        {!effectiveCompanySlug && (
          <div className="pt-4 space-y-3">
            <p className="text-sm text-muted-foreground">
              Selecione uma empresa para continuar.
            </p>
            <div className="flex flex-col sm:flex-row gap-2 justify-center">
              {(companies ?? []).map((c) => (
                <Button
                  key={c.slug}
                  type="button"
                  variant="outline"
                  className="rounded-xl"
                  onClick={() => router.replace(`/p/ecossistema-de-servicos?company_slug=${encodeURIComponent(c.slug)}`)}
                >
                  {c.name}
                </Button>
              ))}
            </div>
          </div>
        )}
      </header>

      <motion.div
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: "-80px" }}
        variants={{
          hidden: {},
          show: {
            transition: { staggerChildren: 0.04 },
          },
        }}
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 items-stretch"
      >
        {services.map(({ card, categoryLabel }) => (
          <motion.div
            key={`${categoryLabel}:${card.title}`}
            variants={{
              hidden: { opacity: 0, y: 10 },
              show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: "easeOut" } },
            }}
            className="h-full"
          >
            <ServiceTile card={card} categoryLabel={categoryLabel} />
          </motion.div>
        ))}
      </motion.div>

      <div className="text-center pt-2">
        <Button asChild className="rounded-xl">
          <Link href="/p/artigos">Ver novidades</Link>
        </Button>
      </div>
    </div>
  )
}
