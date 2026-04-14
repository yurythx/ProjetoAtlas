"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { useRouter } from "next/navigation"
import { api } from "@/lib/axios"
import { Button } from "@/components/ui/button"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Loader2, Building2, User, Mail, Lock, Sparkles, ArrowRight } from "lucide-react"
import { toast } from "sonner"
import Link from "next/link"
 

const registerSchema = z.object({
  username: z.string().min(2, "O nome de usuário deve ter pelo menos 2 caracteres."),
  email: z.string().email("Endereço de e-mail inválido."),
  password: z.string().min(6, "A senha deve ter pelo menos 6 caracteres."),
  company_name: z.string().min(2, "O nome da empresa é obrigatório."),
  company_slug: z.string().min(3, "O slug deve ter pelo menos 3 caracteres.").regex(/^[a-z0-9-]+$/, "O slug deve conter apenas letras minúsculas, números e hífens."),
})

export function RegisterForm() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)

  const form = useForm<z.infer<typeof registerSchema>>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      username: "",
      email: "",
      password: "",
      company_name: "",
      company_slug: "",
    },
  })

  async function onSubmit(values: z.infer<typeof registerSchema>) {
    setIsLoading(true)

    try {
      await api.post('/api/accounts/register/', values)
      toast.success("Conta criada com sucesso! Você já pode entrar.")
      router.push('/login')
    } catch (err: unknown) {
      console.error(err)
      const message =
        typeof err === 'object' && err !== null
          ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail || "Falha no registro. Por favor, tente novamente."
          : "Falha no registro. Por favor, tente novamente."
      toast.error(message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-6 w-full max-w-[450px]">
      <div className="space-y-2 text-center">
        <h1 className="text-3xl font-bold tracking-tight">Crie sua conta</h1>
        <p className="text-muted-foreground text-sm flex items-center justify-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
          Comece seu teste gratuito de 14 dias agora.
        </p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="p-4 border rounded-2xl bg-muted/5 space-y-4">
            <h3 className="text-sm font-bold flex items-center gap-2 px-1">
              <Building2 className="h-4 w-4 text-primary" aria-hidden="true" />
              Empresa
            </h3>

            <FormField
              control={form.control}
              name="company_name"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Input placeholder="Nome da Empresa (ex: Acme Corp)" className="bg-background" {...field} />
                  </FormControl>
                  <FormMessage className="text-xs" />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="company_slug"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <div className="relative group">
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-bold text-muted-foreground/50">.atlas.io</span>
                      <Input placeholder="slug-da-empresa" className="bg-background pr-24" {...field} />
                    </div>
                  </FormControl>
                  <FormDescription className="text-[10px] px-1">Seu URL exclusivo: slug.atlas.io</FormDescription>
                  <FormMessage className="text-xs" />
                </FormItem>
              )}
            />
          </div>

          <div className="p-4 border rounded-2xl bg-muted/5 space-y-4">
            <h3 className="text-sm font-bold flex items-center gap-2 px-1">
              <User className="h-4 w-4 text-primary" />
              Administrador
            </h3>

            <FormField
              control={form.control}
              name="username"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <div className="relative group">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" aria-hidden="true" />
                      <Input placeholder="Nome de usuário" className="bg-background pl-10" {...field} />
                    </div>
                  </FormControl>
                  <FormMessage className="text-xs" />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <div className="relative group">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" aria-hidden="true" />
                      <Input type="email" placeholder="email@empresa.com" className="bg-background pl-10" {...field} />
                    </div>
                  </FormControl>
                  <FormMessage className="text-xs" />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <div className="relative group">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" aria-hidden="true" />
                      <Input type="password" placeholder="Sua senha secreta" className="bg-background pl-10" {...field} />
                    </div>
                  </FormControl>
                  <FormMessage className="text-xs" />
                </FormItem>
              )}
            />
          </div>

          <Button
            type="submit"
            className="w-full h-14 text-lg font-bold shadow-lg shadow-primary/20 transition-all active:scale-[0.98] group"
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-6 w-6 animate-spin" aria-hidden="true" />
                Criando conta...
              </>
            ) : (
              <span className="flex items-center gap-2">
                Começar agora
                <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" aria-hidden="true" />
              </span>
            )}
          </Button>

          <div className="text-center text-sm text-muted-foreground pt-4">
            Já tem uma conta?{" "}
            <Link href="/login" className="font-bold text-primary hover:underline underline-offset-4">
              Faça login
            </Link>
          </div>
        </form>
      </Form>
    </div>
  )
}
