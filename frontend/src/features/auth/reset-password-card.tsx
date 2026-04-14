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
import { KeyRound, ShieldCheck, ArrowRight } from "lucide-react"
import { useEffect, useState } from "react"
import Link from "next/link"

const formSchema = z
  .object({
    new_password: z.string().min(8, "A senha deve ter pelo menos 8 caracteres."),
    confirm_password: z.string(),
  })
  .refine((data) => data.new_password === data.confirm_password, {
    message: "As senhas não coincidem.",
    path: ["confirm_password"],
  })

export function ResetPasswordCard() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isSuccess, setIsSuccess] = useState(false)

  const uid = searchParams.get("uid")
  const token = searchParams.get("token")

  useEffect(() => {
    if (!uid || !token) {
      notify.error("Link Inválido", "Faltam parâmetros de recuperação no link.")
      router.push("/login")
    }
  }, [uid, token, router])

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      new_password: "",
      confirm_password: "",
    },
  })

  const mutation = useMutation({
    mutationFn: async (values: z.infer<typeof formSchema>) => {
      await api.post("/api/accounts/password-reset/confirm/", {
        ...values,
        uid,
        token,
      })
    },
    onSuccess: () => {
      setIsSuccess(true)
      notify.success("Sucesso!", "Sua senha foi alterada com sucesso.")
      setTimeout(() => router.push("/login"), 3000)
    },
    onError: (error) => {
      notify.error("Erro ao redefinir senha", error)
    },
  })

  function onSubmit(values: z.infer<typeof formSchema>) {
    mutation.mutate(values)
  }

  return (
    <div className="w-full max-w-md bg-background rounded-3xl p-8 shadow-2xl space-y-8 animate-in fade-in zoom-in duration-500">
      <div className="space-y-2 text-center">
        <div className="h-16 w-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <KeyRound className="h-8 w-8 text-primary" aria-hidden="true" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight">Nova Senha</h1>
        <p className="text-muted-foreground">Crie uma senha forte para proteger sua conta.</p>
      </div>

      {isSuccess ? (
        <div className="text-center space-y-6" role="status" aria-live="polite" aria-label="Senha redefinida com sucesso">
          <div className="h-20 w-20 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
            <ShieldCheck className="h-10 w-10 text-green-500" aria-hidden="true" />
          </div>
          <h2 className="text-2xl font-bold">Tudo pronto!</h2>
          <p className="text-muted-foreground">Sua senha foi redefinida. Redirecionando para o login...</p>
          <Button asChild className="w-full rounded-xl h-12 mt-4 shadow-lg shadow-primary/20">
            <Link href="/login">
              Ir para o Login Agora <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
        </div>
      ) : (
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="new_password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-bold">Nova Senha</FormLabel>
                  <FormControl>
                    <Input type="password" placeholder="••••••••" className="h-12 rounded-xl" {...field} />
                  </FormControl>
                  {form.formState.errors.new_password ? (
                    <div role="alert" aria-live="assertive">
                      <FormMessage />
                    </div>
                  ) : (
                    <FormMessage />
                  )}
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="confirm_password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-bold">Confirme a Nova Senha</FormLabel>
                  <FormControl>
                    <Input type="password" placeholder="••••••••" className="h-12 rounded-xl" {...field} />
                  </FormControl>
                  {form.formState.errors.confirm_password ? (
                    <div role="alert" aria-live="assertive">
                      <FormMessage />
                    </div>
                  ) : (
                    <FormMessage />
                  )}
                </FormItem>
              )}
            />
            <Button
              type="submit"
              className="w-full h-12 rounded-xl text-lg font-bold shadow-lg shadow-primary/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              disabled={mutation.isPending}
            >
              {mutation.isPending ? "Alterando..." : "Redefinir Senha"}
            </Button>
          </form>
        </Form>
      )}
    </div>
  )
}

