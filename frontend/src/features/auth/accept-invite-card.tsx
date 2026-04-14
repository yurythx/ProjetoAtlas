"use client"

import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { useMutation } from "@tanstack/react-query"
import { api } from "@/lib/axios"
import { Button } from "@/components/ui/button"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { notify } from "@/lib/notifications"
import { useRouter, useSearchParams } from "next/navigation"
import { UserPlus, ShieldCheck, ArrowRight, Loader2 } from "lucide-react"
import { useEffect, useState } from "react"
import Link from "next/link"

const formSchema = z
  .object({
    first_name: z.string().min(1, "Primeiro nome é obrigatório."),
    last_name: z.string().min(1, "Sobrenome é obrigatório."),
    password: z.string().min(8, "A senha deve ter pelo menos 8 caracteres."),
    confirm_password: z.string(),
  })
  .refine((data) => data.password === data.confirm_password, {
    message: "As senhas não coincidem.",
    path: ["confirm_password"],
  })

export function AcceptInviteCard() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isSuccess, setIsSuccess] = useState(false)

  const token = searchParams.get("token")

  useEffect(() => {
    if (!token) {
      notify.error("Link Inválido", "O token de convite está ausente.")
      router.push("/login")
    }
  }, [token, router])

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      first_name: "",
      last_name: "",
      password: "",
      confirm_password: "",
    },
  })

  const mutation = useMutation({
    mutationFn: async (values: z.infer<typeof formSchema>) => {
      await api.post("/api/accounts/invitations/accept/", {
        ...values,
        token,
      })
    },
    onSuccess: () => {
      setIsSuccess(true)
      notify.success("Bem-vindo!", "Sua conta foi criada com sucesso.")
      setTimeout(() => router.push("/login"), 3000)
    },
    onError: (error: unknown) => {
      const message =
        typeof error === "object" && error !== null && "response" in error
          ? (error as { response?: { data?: { detail?: string } } }).response?.data?.detail || "Falha ao aceitar convite"
          : "Falha ao aceitar convite"
      notify.error("Erro ao aceitar convite", message)
    },
  })

  function onSubmit(values: z.infer<typeof formSchema>) {
    mutation.mutate(values)
  }

  return (
    <div className="w-full max-w-md bg-background rounded-3xl p-8 shadow-2xl space-y-8 animate-in fade-in zoom-in duration-500">
      <div className="space-y-2 text-center">
        <div className="h-16 w-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <UserPlus className="h-8 w-8 text-primary" aria-hidden="true" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight">{isSuccess ? "Bem-vindo(a)!" : "Quase lá!"}</h1>
        <p className="text-muted-foreground">
          {isSuccess ? "Sua conta foi criada com sucesso." : "Complete seu perfil para acessar o Atlas."}
        </p>
      </div>

      {isSuccess ? (
        <div className="text-center space-y-6 animate-in fade-in zoom-in duration-500" role="status" aria-live="polite" aria-label="Convite aceito">
          <div className="h-20 w-20 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
            <ShieldCheck className="h-10 w-10 text-green-500" aria-hidden="true" />
          </div>
          <h2 className="text-2xl font-bold">Bem-vindo(a) ao Atlas!</h2>
          <p className="text-muted-foreground">Sua conta foi criada com sucesso. Redirecionando para o login...</p>
          <Button asChild className="w-full rounded-xl h-12 shadow-lg shadow-primary/20">
            <Link href="/login">
              Fazer Login Agora <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
        </div>
      ) : (
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="first_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-bold">Nome</FormLabel>
                    <FormControl>
                      <Input placeholder="John" className="h-12 rounded-xl" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="last_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-bold">Sobrenome</FormLabel>
                    <FormControl>
                      <Input placeholder="Doe" className="h-12 rounded-xl" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-bold">Crie sua Senha</FormLabel>
                  <FormControl>
                    <Input type="password" placeholder="••••••••" className="h-12 rounded-xl" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="confirm_password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-bold">Confirme a Senha</FormLabel>
                  <FormControl>
                    <Input type="password" placeholder="••••••••" className="h-12 rounded-xl" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button
              type="submit"
              className="w-full h-12 rounded-xl text-lg font-bold shadow-lg shadow-primary/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              disabled={mutation.isPending}
            >
              {mutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> Finalizando...
                </>
              ) : (
                "Concluir Cadastro"
              )}
            </Button>
          </form>
        </Form>
      )}
    </div>
  )
}

