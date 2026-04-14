import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/axios"
import { toast } from "sonner"

export interface CalendarEvent {
  id: string
  uuid: string
  title: string
  description?: string
  start_datetime: string
  end_datetime: string
  is_all_day: boolean
  rrule?: string
  color_category: string
  is_recurrence?: boolean
  original_event_id?: number
}

function ensureIsoDateTime(value: string | undefined) {
  if (!value) return value
  const trimmed = value.trim()
  if (!trimmed) return value
  const hasTimezone = /Z$|[+-]\d{2}:\d{2}$/.test(trimmed)
  if (hasTimezone) return trimmed
  const date = new Date(trimmed)
  if (Number.isNaN(date.getTime())) return trimmed
  return date.toISOString()
}

export function useCalendar(startStr?: string, endStr?: string) {
  const queryClient = useQueryClient()

  // Fetch Events
  const { data: events = [], isLoading } = useQuery({
    queryKey: ['calendar-events', startStr, endStr],
    queryFn: async () => {
      if (!startStr || !endStr) return []
      const response = await api.get<CalendarEvent[]>('/api/calendar/events/', {
        params: { start: startStr, end: endStr }
      })
      return response.data
    },
    enabled: !!startStr && !!endStr,
  })

  // Create Event
  const createEvent = useMutation({
    mutationFn: async (newEvent: Partial<CalendarEvent>) => {
      const response = await api.post('/api/calendar/events/', {
        ...newEvent,
        start_datetime: ensureIsoDateTime(newEvent.start_datetime),
        end_datetime: ensureIsoDateTime(newEvent.end_datetime),
      })
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar-events'] })
      toast.success("Evento criado com sucesso!")
    },
    onError: (error) => {
      console.error(error)
      toast.error("Erro ao criar evento.")
    }
  })

  // Update Event
  const updateEvent = useMutation({
    mutationFn: async ({ id, original_event_id, ...data }: Partial<CalendarEvent> & { id: string, original_event_id?: number }) => {
      // Determine the real ID to update
      let realId = id
      
      // Check if it's a recurring instance (e.g., "uuid_timestamp")
      if (id.includes('_') && original_event_id) {
          // If we have original_event_id, we update the main series event
          // TODO: Implement "This and following" or "Just this instance" logic later
          // For now, always update the series
          realId = original_event_id.toString()
      } else if (id.includes('_')) {
          // Fallback if original_event_id is missing but looks like composite ID
          // Try to extract if backend supports UUID, otherwise this might fail if it expects INT PK
           // The ID format from backend is "uuid_timestamp"
           // We can't easily get the INT PK from just UUID without lookup, 
           // but our CalendarEvent interface has `original_event_id` populated by backend.
           console.error("Missing original_event_id for recurring event update")
           throw new Error("Cannot update recurring event instance without original ID")
      }

      const response = await api.patch(`/api/calendar/events/${realId}/`, {
        ...data,
        start_datetime: ensureIsoDateTime(data.start_datetime),
        end_datetime: ensureIsoDateTime(data.end_datetime),
      })
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar-events'] })
      toast.success("Evento atualizado!")
    },
    onError: () => toast.error("Erro ao atualizar evento.")
  })

  return {
    events,
    isLoading,
    createEvent,
    updateEvent
  }
}
