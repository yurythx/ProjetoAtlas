"use client"

import { useState, useCallback } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import ptBrLocale from '@fullcalendar/core/locales/pt-br'
import { useCalendar, CalendarEvent } from './use-calendar'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { format } from 'date-fns'
import { usePermission } from '@/hooks/use-permission'

const COLOR_CATEGORIES = ["blue", "green", "red", "purple", "orange"] as const
type ColorCategory = (typeof COLOR_CATEGORIES)[number]

function normalizeColorCategory(value: unknown): ColorCategory {
  return COLOR_CATEGORIES.includes(value as ColorCategory) ? (value as ColorCategory) : "blue"
}

const eventSchema = z.object({
  title: z.string().min(1, "Título é obrigatório"),
  start_datetime: z.string(),
  end_datetime: z.string(),
  color_category: z.enum(COLOR_CATEGORIES),
})

type EventFormValues = z.infer<typeof eventSchema>

export function CalendarView() {
  const [dateRange, setDateRange] = useState({ start: '', end: '' })
  const { events, createEvent, updateEvent } = useCalendar(dateRange.start, dateRange.end)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null)
  const { hasPermission } = usePermission()
  const canManageEvents = hasPermission("calendar.event_manage")

  const form = useForm<EventFormValues>({
    resolver: zodResolver(eventSchema),
    defaultValues: {
      title: "",
      color_category: "blue",
      start_datetime: "",
      end_datetime: ""
    }
  })

  const handleDatesSet = useCallback((arg: { startStr: string; endStr: string }) => {
    setDateRange({
      start: arg.startStr,
      end: arg.endStr
    })
  }, [])

  const handleDateClick = (arg: { date: Date }) => {
    if (!canManageEvents) return
    const start = arg.date
    const end = new Date(start.getTime() + 60 * 60 * 1000) // 1 hour default
    
    setSelectedEvent(null)
    
    // Reset form
    form.reset({
      title: "",
      color_category: "blue",
      start_datetime: format(start, "yyyy-MM-dd'T'HH:mm"),
      end_datetime: format(end, "yyyy-MM-dd'T'HH:mm")
    })
    
    setIsDialogOpen(true)
  }

  const handleEventClick = (arg: { event: { id: string } }) => {
    if (!canManageEvents) return
    const event = events.find(e => String(e.id) === arg.event.id)
    if (!event) return

    setSelectedEvent(event)
    form.reset({
      title: event.title,
      color_category: normalizeColorCategory(event.color_category),
      start_datetime: format(new Date(event.start_datetime), "yyyy-MM-dd'T'HH:mm"),
      end_datetime: format(new Date(event.end_datetime), "yyyy-MM-dd'T'HH:mm")
    })
    setIsDialogOpen(true)
  }

  const handleEventDrop = async (arg: { event: { id: string; startStr: string; endStr?: string | null }; revert: () => void }) => {
     if (!canManageEvents) return
     const event = events.find(e => String(e.id) === arg.event.id)
     if (!event) return

     try {
       await updateEvent.mutateAsync({
         id: event.id,
         original_event_id: event.original_event_id,
         start_datetime: arg.event.startStr,
         end_datetime: arg.event.endStr || arg.event.startStr // Fallback for all-day
       })
     } catch {
       arg.revert()
     }
  }

  const onSubmit = async (data: EventFormValues) => {
    try {
      if (!canManageEvents) return
      if (selectedEvent) {
        await updateEvent.mutateAsync({
          id: selectedEvent.id,
          original_event_id: selectedEvent.original_event_id,
          ...data
        })
      } else {
        await createEvent.mutateAsync({
          ...data,
          is_all_day: false // TODO: Add checkbox
        })
      }
      setIsDialogOpen(false)
    } catch {
      // Error handled in hook
    }
  }

  // Map events to FullCalendar format
  const calendarEvents = events.map(event => ({
    id: event.id,
    title: event.title,
    start: event.start_datetime,
    end: event.end_datetime,
    backgroundColor: getColor(event.color_category),
    borderColor: getColor(event.color_category),
    extendedProps: {
        original_event_id: event.original_event_id
    }
  }))

  function getColor(category: string) {
    const colors: Record<string, string> = {
      blue: '#3b82f6',
      green: '#10b981',
      red: '#ef4444',
      purple: '#8b5cf6',
      orange: '#f97316'
    }
    return colors[category] || '#3b82f6'
  }

  return (
    <Card className="p-4 h-[800px] glass">
      <FullCalendar
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        initialView="dayGridMonth"
        headerToolbar={{
          left: 'prev,next today',
          center: 'title',
          right: 'dayGridMonth,timeGridWeek,timeGridDay'
        }}
        locale={ptBrLocale}
        events={calendarEvents}
        editable={canManageEvents}
        selectable={canManageEvents}
        selectMirror={true}
        dayMaxEvents={true}
        weekends={true}
        datesSet={handleDatesSet}
        dateClick={handleDateClick}
        eventClick={handleEventClick}
        eventDrop={handleEventDrop}
        height="100%"
        buttonText={{
          today: 'Hoje',
          month: 'Mês',
          week: 'Semana',
          day: 'Dia',
          list: 'Lista'
        }}
      />

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="w-[calc(100vw-1.5rem)] sm:w-auto sm:max-w-[560px] max-h-[calc(100vh-1.5rem)] overflow-hidden p-0 grid grid-rows-[auto_1fr_auto]">
          <DialogHeader className="border-b bg-muted/30 px-4 py-4 text-left sm:px-6 sm:py-5">
            <DialogTitle>{selectedEvent ? 'Editar Evento' : 'Novo Evento'}</DialogTitle>
            <DialogDescription className="sr-only">
              Formulário de criação e edição de eventos da agenda.
            </DialogDescription>
          </DialogHeader>
          
          <div className="min-h-0 overflow-y-auto px-4 py-4 sm:px-6">
            <Form {...form}>
              <form id="calendar-event-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Título</FormLabel>
                    <FormControl>
                      <Input placeholder="Reunião de equipe..." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="start_datetime"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Início</FormLabel>
                      <FormControl>
                        <Input type="datetime-local" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="end_datetime"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Fim</FormLabel>
                      <FormControl>
                        <Input type="datetime-local" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="color_category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cor</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione uma cor" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="blue">Azul</SelectItem>
                        <SelectItem value="green">Verde</SelectItem>
                        <SelectItem value="red">Vermelho</SelectItem>
                        <SelectItem value="purple">Roxo</SelectItem>
                        <SelectItem value="orange">Laranja</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

            </form>
            </Form>
          </div>
          <div className="border-t bg-background/60 px-4 py-4 sm:px-6 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Cancelar</Button>
            <Button type="submit" form="calendar-event-form" disabled={!canManageEvents}>Salvar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
