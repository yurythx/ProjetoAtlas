"use client"

import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { useMutation } from "@tanstack/react-query"
import { api } from "@/lib/axios"
import { Button } from "@/components/ui/button"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { notify } from "@/lib/notifications"
import Link from "next/link"
import { ArrowLeft, Mail, ShieldCheck } from "lucide-react"
import { useState } from "react"

const formSchema = z.object({
  email: z.string().email("Email inválido."),
})

export function ForgotPasswordCard() {
  const [isSubmitted, setIsSubmitted] = useState(false)

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: "",
    },
  })

  const mutation = useMutation({
    mutationFn: async (values: z.infer<typeof formSchema>) => {
      await api.post("/api/accounts/password-reset/", values)
    },
    onSuccess: () => {
      setIsSubmitted(true)
      notify.success("Email enviado", "Se o email estiver cadastrado, você receberá um link em breve.")
    },
    onError: (error) => {
      notify.error("Erro ao solicitar recuperação", error)
    },
  })

  function onSubmit(values: z.infer<typeof formSchema>) {
    mutation.mutate(values)
  }

  return (
    <div className="w-full max-w-md bg-background rounded-3xl p-8 shadow-2xl space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="space-y-2 text-center">
        <Link
          href="/login"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-primary transition-colors mb-6 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-md"
        >
          <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" /> Voltar para o login
        </Link>
        <div className="h-16 w-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <Mail className="h-8 w-8 text-primary" aria-hidden="true" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight">Recuperar Senha</h1>
        <p className="text-muted-foreground">Insira seu email para receber um link de redefinição.</p>
      </div>

      {!isSubmitted ? (
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-bold">Email</FormLabel>
                  <FormControl>
                    <Input placeholder="seu@email.com" className="h-12 rounded-xl" {...field} />
                  </FormControl>
                  {form.formState.errors.email ? (
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
              {mutation.isPending ? "Enviando..." : "Enviar Link de Recuperação"}
            </Button>
          </form>
        </Form>
      ) : (
        <div
          className="text-center p-8 bg-primary/5 rounded-2xl border border-primary/20 animate-in fade-in zoom-in duration-500"
          role="status"
          aria-live="polite"
          aria-label="Email de recuperação enviado"
        >
          <ShieldCheck className="h-12 w-12 text-primary mx-auto mb-4" aria-hidden="true" />
          <h3 className="text-lg font-bold mb-2">Check seu email!</h3>
          <p className="text-sm text-muted-foreground">
            Se houver uma conta associada a {form.getValues("email")}, você receberá instruções de redefinição em alguns instantes.
          </p>
          <Button
            variant="outline"
            className="mt-6 w-full rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            onClick={() => setIsSubmitted(false)}
          >
            Tentar outro email
          </Button>
        </div>
      )}

      <div className="text-center text-sm text-muted-foreground">
        Ainda não tem conta?{" "}
        <Link
          href="/register"
          className="text-primary font-bold hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-md"
        >
          Solicite acesso
        </Link>
      </div>
    </div>
  )
}

