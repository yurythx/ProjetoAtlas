"use client"

import { Button } from "@/components/ui/button"
import { Calendar, CheckCircle2, AlertCircle } from "lucide-react"

export function GoogleCalendarSync() {
  // Nota: Esta é uma interface visual placeholder.
  // A integração real com a API do Google OAuth será feita no backend
  // através de uma view de redirecionamento.
  
  const isConnected = false;

  const handleConnect = () => {
    // Redireciona para o endpoint do backend que inicia o fluxo OAuth
    // window.location.href = `${process.env.NEXT_PUBLIC_API_URL}/api/calendar/google/login/`;
    alert("Fluxo OAuth do Google Calendar será iniciado aqui.");
  }

  const handleDisconnect = () => {
    // Chama o endpoint de desconexão
    alert("Desconectando do Google Calendar...");
  }

  return (
    <div className="flex items-center justify-between p-4 border rounded-xl bg-card">
      <div className="flex items-center gap-4">
        <div className="h-10 w-10 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-600">
          <Calendar className="h-5 w-5" />
        </div>
        <div>
          <h4 className="font-semibold">Google Calendar</h4>
          <div className="flex items-center gap-2 text-sm mt-1">
            {isConnected ? (
              <>
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                <span className="text-muted-foreground">Conectado e sincronizando</span>
              </>
            ) : (
              <>
                <AlertCircle className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Não conectado</span>
              </>
            )}
          </div>
        </div>
      </div>

      <Button 
        variant={isConnected ? "outline" : "default"} 
        onClick={isConnected ? handleDisconnect : handleConnect}
      >
        {isConnected ? "Desconectar" : "Conectar Conta"}
      </Button>
    </div>
  )
}