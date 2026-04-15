import {
  LayoutDashboard,
  MessageSquare,
  FileText,
  Settings,
  Shield,
  Users,
  Package,
  TrendingUp,
  Globe,
  KeyRound,
  Calendar,
  DollarSign,
  ClipboardList,
  BarChart3,
  Headset
} from "lucide-react"
import React from "react"

export interface NavItem {
  title: string
  label?: string // Alias for title used in some places
  href: string
  icon: React.ComponentType<{ className?: string }>
  module?: string
  permission?: string
  exact?: boolean
  requireSuperuser?: boolean
}

export interface NavSection {
  title?: string
  items: NavItem[]
}

export const SIDEBAR_CONFIG: NavSection[] = [
  {
    items: [
      {
        title: "Visão Geral",
        href: "/admin",
        icon: LayoutDashboard,
        exact: true,
      },
      {
        title: "Insights",
        href: "/insights",
        icon: TrendingUp,
        permission: "admin.view_dashboard",
      },
    ]
  },
  {
    title: "Módulos",
    items: [
      {
        title: "Agenda",
        href: "/calendar",
        icon: Calendar,
        module: "calendar",
      },
      {
        title: "Service Desk",
        href: "/crm",
        icon: Headset,
        module: "crm",
        exact: true,
      },
      {
        title: "Processos",
        href: "/crm/pipelines",
        icon: BarChart3,
        module: "crm",
      },
      {
        title: "Financeiro",
        href: "/finance",
        icon: DollarSign,
        module: "finance",
      },
      {
        title: "Mensagens",
        href: "/messenger",
        icon: MessageSquare,
        module: "messenger",
      },
      {
        title: "Páginas",
        href: "/cms",
        icon: Globe,
        module: "pages",
      },
      {
        title: "Artigos",
        href: "/artigos",
        icon: FileText,
        module: "articles",
      },
    ]
  },
  {
    title: "Administração",
    items: [
      {
        title: "Membros",
        href: "/admin/users",
        icon: Users,
        permission: "admin.user_manage",
      },
      {
        title: "LDAP",
        href: "/admin/ldap",
        icon: KeyRound,
        permission: "admin.settings_manage",
      },
      {
        title: "Papéis e Permissões",
        href: "/admin/roles",
        icon: Shield,
        permission: "admin.user_manage",
      },
      {
        title: "Módulos do Sistema",
        href: "/admin/modules",
        icon: Package,
        permission: "admin.settings_manage",
      },
      {
        title: "Empresas",
        href: "/admin/companies",
        icon: LayoutDashboard,
        requireSuperuser: true,
      },
      {
        title: "Configurações",
        href: "/settings",
        icon: Settings,
      },
      {
        title: "Meu Perfil",
        href: "/perfil",
        icon: Users,
      },
    ]
  },
]

export const HEADER_NAV_ITEMS: NavItem[] = [
  { title: "Painel Admin", href: "/admin", icon: LayoutDashboard },
  { title: "Páginas", href: "/cms", icon: Globe, module: "pages" },
  { title: "Artigos", href: "/artigos", icon: FileText, module: "articles" },
  { title: "Service Desk", href: "/crm", icon: Headset, module: "crm" },
  { title: "Agenda", href: "/calendar", icon: Calendar, module: "calendar" },
]
