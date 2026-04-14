"use client"
 
 import { useEffect, useState } from "react"
 import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
 import { Button } from "@/components/ui/button"
 
 type UnauthorizedEventDetail = {
   message?: string
 }
 
 export function UnauthorizedModalHost() {
   const [open, setOpen] = useState(false)
   const [message, setMessage] = useState("Você não possui autorização para executar esta ação.")
 
   useEffect(() => {
     const handler = (event: Event) => {
       const custom = event as CustomEvent<UnauthorizedEventDetail>
       const nextMessage = custom.detail?.message?.trim()
       setMessage(nextMessage || "Você não possui autorização para executar esta ação.")
       setOpen(true)
     }
 
     window.addEventListener("app-unauthorized", handler)
     return () => window.removeEventListener("app-unauthorized", handler)
   }, [])
 
   return (
     <Dialog open={open} onOpenChange={setOpen}>
       <DialogContent className="sm:max-w-[520px] rounded-2xl">
         <DialogHeader>
           <DialogTitle>Acesso negado</DialogTitle>
           <DialogDescription>{message}</DialogDescription>
         </DialogHeader>
         <DialogFooter>
           <Button type="button" onClick={() => setOpen(false)} className="rounded-xl">
             Entendi
           </Button>
         </DialogFooter>
       </DialogContent>
     </Dialog>
   )
 }
