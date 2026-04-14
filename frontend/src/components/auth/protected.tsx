 "use client"
 
 import { ReactNode, useEffect, useState } from "react"
 import { usePermission } from "@/hooks/use-permission"
 import { useAuth } from "@/hooks/use-auth"
 import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
 import { ShieldAlert, ArrowLeft } from "lucide-react"
 import Link from "next/link"
 
 interface ProtectedProps {
   children: ReactNode
   requiredPermissions?: string[]
   requiredRoles?: string[]
   requireStaff?: boolean
  unauthorizedMode?: "page" | "modal"
 }
 
 export function Protected({
   children,
   requiredPermissions = [],
   requiredRoles = [],
   requireStaff = false,
  unauthorizedMode = "page",
 }: ProtectedProps) {
   const [mounted, setMounted] = useState(false)
   const { user, isLoading } = useAuth()
   const { hasPermission, hasRole } = usePermission()
 
   useEffect(() => {
     setMounted(true)
   }, [])
 
   if (!mounted || isLoading) {
     return (
       <div className="flex h-[calc(100vh-theme(spacing.32))] items-center justify-center border border-border/50 rounded-2xl bg-background/50 backdrop-blur-sm shadow-sm">
         <ShieldAlert className="h-6 w-6 animate-pulse text-primary" />
       </div>
     )
   }
 
   const isSuperuser = !!user?.is_superuser
   const isStaff = !!user?.is_staff
 
   const permsOk = requiredPermissions.length === 0 || requiredPermissions.every(p => hasPermission(p))
   const rolesOk = requiredRoles.length === 0 || requiredRoles.some(r => hasRole(r))
   const staffOk = !requireStaff || isStaff
 
   const allowed = isSuperuser || (permsOk && rolesOk && staffOk)
 
   if (!allowed) {
    if (unauthorizedMode === "modal") {
      return (
        <Dialog open>
          <DialogContent className="sm:max-w-[520px] rounded-2xl">
            <DialogHeader>
              <DialogTitle>Acesso negado</DialogTitle>
              <DialogDescription>
                Você não possui permissão para acessar esta área.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button asChild variant="default" className="rounded-xl">
                <Link href="/" aria-label="Voltar para a página inicial">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Voltar
                </Link>
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )
    }
     return (
       <div className="flex h-[calc(100vh-theme(spacing.32))] items-center justify-center">
         <div className="max-w-md w-full p-8 rounded-2xl border border-border/50 bg-background/50 backdrop-blur-sm text-center space-y-6 shadow-sm">
           <div className="h-12 w-12 rounded-2xl bg-primary/10 mx-auto flex items-center justify-center">
             <ShieldAlert className="h-6 w-6 text-primary" />
           </div>
           <h2 className="text-xl font-bold">Acesso negado</h2>
           <p className="text-sm text-muted-foreground">
             Você não possui permissão para acessar esta área.
           </p>
           <div className="flex justify-center">
             <Button asChild variant="default" className="rounded-xl">
               <Link href="/" aria-label="Voltar para a página inicial">
                 <ArrowLeft className="h-4 w-4 mr-2" />
                 Voltar
               </Link>
             </Button>
           </div>
         </div>
       </div>
     )
   }
 
   return <>{children}</>
 }
