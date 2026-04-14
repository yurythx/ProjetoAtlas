"use client"

import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/axios"
import { Button } from "@/components/ui/button"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Loader2, User, Mail, UserCheck, Save } from "lucide-react"
import { toast } from "sonner"
import { Skeleton } from "@/components/ui/skeleton"
import { AvatarUpload } from "@/components/avatar-upload"
import { usePresence } from "@/hooks/use-presence"
import { cn } from "@/lib/utils"
import { useAuth } from "@/hooks/use-auth"

const profileSchema = z.object({
  username: z.string().min(2, "O nome de usuário deve ter pelo menos 2 caracteres."),
  email: z.string().min(1, "O e-mail é obrigatório."),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  bio: z.string().max(280, "A bio deve ter no máximo 280 caracteres.").optional(),
})

export function ProfileForm() {
  const queryClient = useQueryClient()
  const { userStatuses, updateStatus } = usePresence()

  const { user, isLoading } = useAuth()

  // Schema now accepts File or string for avatar
  const extendedSchema = profileSchema.extend({
    avatar: z.union([z.instanceof(File), z.string(), z.null()]).optional()
  })

  const form = useForm<z.infer<typeof extendedSchema>>({
    resolver: zodResolver(extendedSchema),
    defaultValues: {
      username: "",
      email: "",
      first_name: "",
      last_name: "",
      bio: "",
      avatar: null,
    },
    values: user ? {
      username: user.username,
      email: user.email || "",
      first_name: user.first_name || "",
      last_name: user.last_name || "",
      bio: user.bio || "",
      avatar: user.avatar_url || user.avatar || null,
    } : undefined
  })

  const mutation = useMutation({
    mutationFn: async (values: z.infer<typeof extendedSchema>) => {
      const formData = new FormData()
      formData.append('username', values.username)
      if (values.first_name) formData.append('first_name', values.first_name)
      if (values.last_name) formData.append('last_name', values.last_name)
      if (values.bio) formData.append('bio', values.bio)

      // Avatar handling
      if (values.avatar instanceof File) {
        formData.append('avatar', values.avatar)
      } else if (values.avatar === null && user?.avatar) {
        // Handle removal if needed, but for now we just support update
        // To support deletion we might need a separate flag or empty string logic in backend
      }

      await api.patch('/api/accounts/users/me/', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth', 'user'] }) // Update global auth context
      toast.success("Perfil atualizado com sucesso!")
    },
    onError: (error) => {
      toast.error("Falha ao atualizar perfil")
      console.error(error)
    }
  })

  if (isLoading) {
    return (
      <Card role="status" aria-live="polite" aria-label="Carregando dados do perfil">
        <CardHeader>
          <Skeleton className="h-8 w-1/3 mb-2" />
          <Skeleton className="h-4 w-1/2" />
        </CardHeader>
        <CardContent className="space-y-6">
          <Skeleton className="h-24 w-24 rounded-full" />
          <Skeleton className="h-12 w-full" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        </CardContent>
      </Card>
    )
  }

  function onSubmit(values: z.infer<typeof extendedSchema>) {
    mutation.mutate(values)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 border-b pb-6">
        <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
          <UserCheck className="h-6 w-6 text-primary" aria-hidden="true" />
        </div>
        <div>
          <h2 className="text-xl font-bold tracking-tight">Dados Pessoais</h2>
          <p className="text-sm text-muted-foreground">Gerencie suas informações de acesso e exibição.</p>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8 max-w-3xl">

          {/* Avatar & Status Section */}
          <div className="bg-muted/30 p-6 rounded-2xl border border-border/50 space-y-6">
            <FormField
              control={form.control}
              name="avatar"
              render={({ field }) => (
                <FormItem className="flex flex-col sm:flex-row items-center gap-6 space-y-0">
                  <FormControl>
                    <div className="relative group/avatar">
                      <AvatarUpload
                        value={field.value}
                        onChange={field.onChange}
                        initials={user?.username?.substring(0, 2).toUpperCase()}
                      />
                      <span
                        className={cn(
                          "absolute bottom-0 right-12 h-5 w-5 rounded-full border-4 border-background shadow-sm transition-colors",
                          (userStatuses.get(user?.id || 0) || user?.status) === 'online' ? "bg-green-500" :
                            (userStatuses.get(user?.id || 0) || user?.status) === 'busy' ? "bg-amber-500" : "bg-slate-400"
                        )}
                      />
                    </div>
                  </FormControl>
                  <div className="text-center sm:text-left space-y-1">
                    <FormLabel className="text-base font-semibold">Sua Foto</FormLabel>
                    <FormDescription>
                      Isso será exibido no seu perfil e em conversas.
                    </FormDescription>
                    <FormMessage />
                  </div>
                </FormItem>
              )}
            />

            <div className="pt-4 border-t flex flex-col gap-3">
              <FormLabel className="font-semibold text-sm">Seu Status de Presença</FormLabel>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant={(userStatuses.get(user?.id || 0) || user?.status) === 'online' ? "default" : "outline"}
                  size="sm"
                  className="rounded-full gap-2 transition-all px-4"
                  onClick={() => updateStatus('online')}
                >
                  <span className="h-2 w-2 rounded-full bg-green-500" />
                  Online
                </Button>
                <Button
                  type="button"
                  variant={(userStatuses.get(user?.id || 0) || user?.status) === 'busy' ? "default" : "outline"}
                  size="sm"
                  className="rounded-full gap-2 transition-all px-4"
                  onClick={() => updateStatus('busy')}
                >
                  <span className="h-2 w-2 rounded-full bg-amber-500" />
                  Ocupado
                </Button>
                <Button
                  type="button"
                  variant={(userStatuses.get(user?.id || 0) || user?.status) === 'offline' ? "default" : "outline"}
                  size="sm"
                  className="rounded-full gap-2 transition-all px-4"
                  onClick={() => updateStatus('offline')}
                >
                  <span className="h-2 w-2 rounded-full bg-slate-400" />
                  Offline
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Altere como os outros vêm sua disponibilidade em tempo real.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <FormField
              control={form.control}
              name="username"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-semibold">Nome de Usuário</FormLabel>
                  <FormControl>
                    <div className="relative group">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" aria-hidden="true" />
                      <Input placeholder="seu.usuario" className="pl-10 h-11 bg-background/50" {...field} />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-semibold">E-mail</FormLabel>
                  <FormControl>
                    <div className="relative group opacity-80">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                      <Input placeholder="seu@email.com" className="pl-10 h-11 bg-muted/50" {...field} disabled />
                    </div>
                  </FormControl>
                  <FormDescription className="text-xs">Para alterar seu e-mail, contate o suporte.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="bio"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="font-semibold">Bio</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Conte um pouco sobre você (aparece em artigos e no seu perfil)."
                    className="min-h-[120px] bg-background/50"
                    {...field}
                    value={field.value || ''}
                  />
                </FormControl>
                <FormDescription className="text-xs">Até 280 caracteres.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <FormField
              control={form.control}
              name="first_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-semibold">Primeiro Nome</FormLabel>
                  <FormControl>
                    <Input placeholder="Ex: João" className="h-11 bg-background/50" {...field} value={field.value || ''} />
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
                  <FormLabel className="font-semibold">Sobrenome</FormLabel>
                  <FormControl>
                    <Input placeholder="Ex: Silva" className="h-11 bg-background/50" {...field} value={field.value || ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="pt-4 border-t">
            <Button type="submit" size="lg" className="rounded-xl px-8 shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all" disabled={mutation.isPending}>
              {mutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Save className="mr-2 h-4 w-4" aria-hidden="true" />
              )}
              Salvar Alterações
            </Button>
          </div>
        </form>
      </Form>
    </div>
  )
}
