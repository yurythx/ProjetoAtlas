"use client"

import { useEffect, useState } from "react"
import { Deal, CRMColumn, useCRM } from "./use-crm"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"

import { dateOnlyToLocalDateTime, getLocalDateYYYYMMDD, getUserDisplayName } from "./crm-utils"
import { useCRMUsers } from "./use-crm-users"

interface QuickTransitionModalProps {
  deal: Deal | null
  targetColumn: CRMColumn | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function QuickTransitionModal({
  deal,
  targetColumn,
  open,
  onOpenChange,
}: QuickTransitionModalProps) {
  const { updateDeal } = useCRM()
  const [date, setDate] = useState("")
  const [technicianId, setTechnicianId] = useState("")

  const { data: users = [], isLoading: isLoadingUsers } = useCRMUsers(open && Boolean(targetColumn?.requires_assignee))

  useEffect(() => {
    if (open && deal) {
      // Pre-fill with current values if available
      if (deal.data_agendamento) {
        setDate(deal.data_agendamento.split("T")[0])
      } else {
        setDate(getLocalDateYYYYMMDD())
      }
      
      if (deal.tecnico_responsavel) {
        setTechnicianId(deal.tecnico_responsavel.toString())
      } else {
        setTechnicianId("")
      }
    }
  }, [open, deal])

  const handleConfirm = async () => {
    if (!deal || !targetColumn) return

    const payload: Partial<Deal> & { id: number } = {
      id: deal.id,
      column: targetColumn.id,
    }

    if (targetColumn.requires_schedule) {
      const safeDateTime = dateOnlyToLocalDateTime(date, 12)
      if (!safeDateTime) {
        toast.error("Data selecionada é inválida.")
        return
      }
      payload.data_agendamento = safeDateTime
    }

    if (targetColumn.requires_assignee) {
      const parsedId = parseInt(technicianId)
      if (isNaN(parsedId)) {
        toast.error("Técnico selecionado é inválido.")
        return
      }
      payload.tecnico_responsavel = parsedId
    }

    try {
      await updateDeal.mutateAsync(payload)
      onOpenChange(false)
    } catch {
      // O erro já é tratado pelo hook useCRM via toast
    }
  }

  const isSaveDisabled =
    (targetColumn?.requires_schedule && !date) ||
    (targetColumn?.requires_assignee && !technicianId) ||
    updateDeal.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1.5rem)] sm:w-auto sm:max-w-[460px] max-h-[calc(100vh-1.5rem)] overflow-hidden rounded-3xl glass p-0 grid grid-rows-[auto_1fr_auto]">
        <DialogHeader className="border-b bg-muted/30 px-4 py-4 text-left sm:px-6 sm:py-5">
          <DialogTitle>Atualizar Informações</DialogTitle>
          <DialogDescription>
            A coluna <strong>{targetColumn?.title}</strong> exige o preenchimento dos campos abaixo para continuar.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 overflow-y-auto">
          <div className="grid gap-4 px-4 py-4 sm:px-6">
            {targetColumn?.requires_schedule && (
              <div className="grid gap-2">
                <Label htmlFor="date">Data de Agendamento</Label>
                <Input
                  id="date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="rounded-xl"
                />
              </div>
            )}

            {targetColumn?.requires_assignee && (
              <div className="grid gap-2">
                <Label htmlFor="technician">Técnico Responsável</Label>
                <Select value={technicianId} onValueChange={setTechnicianId}>
                  <SelectTrigger id="technician" className="rounded-xl">
                    <SelectValue placeholder={isLoadingUsers ? "Carregando..." : "Selecione um técnico"} />
                  </SelectTrigger>
                  <SelectContent>
                    {users.map((user) => (
                      <SelectItem key={user.id} value={user.id.toString()}>
                        {getUserDisplayName(user)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="flex flex-col gap-2 border-t bg-background/60 px-4 py-4 sm:flex-row sm:justify-end sm:px-6">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-xl w-full sm:w-auto">
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={isSaveDisabled} className="rounded-xl w-full sm:w-auto">
            {updateDeal.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Mover Card
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
