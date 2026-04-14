"use client"

import { usePresence } from "@/hooks/use-presence"
import { useEffect } from "react"

/**
 * Componente sem interface que garante a conexão do WebSocket de presença
 * ativa em todo o dashboard.
 */
export function PresenceHeartbeat() {
    // O hook usePresence já inicia a conexão WebSocket ao ser montado
    const { onlineUsers } = usePresence()

    useEffect(() => {
        // Log apenas para debug em desenvolvimento, se necessário
        // console.log("[PresenceHeartbeat] Conexão ativa. Usuários online:", onlineUsers.size)
    }, [onlineUsers])

    return null
}
