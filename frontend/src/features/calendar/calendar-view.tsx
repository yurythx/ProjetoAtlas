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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { format } from 'date-fns'
import { usePermission } from '@/hooks/use-permission'
import { Calendar as CalendarIcon, Clock, Tag, Sparkles, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

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
    setDateRange({ start: arg.startStr, end: arg.endStr })
  }, [])

  const handleDateClick = (arg: { date: Date }) => {
    if (!canManageEvents) return
    const start = arg.date
    const end = new Date(start.getTime() + 60 * 60 * 1000)
    setSelectedEvent(null)
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
         end_datetime: arg.event.endStr || arg.event.startStr
       })
     } catch { arg.revert() }
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
        await createEvent.mutateAsync({ ...data, is_all_day: false })
      }
      setIsDialogOpen(false)
    } catch { }
  }

  const calendarEvents = events.map(event => ({
    id: event.id,
    title: event.title,
    start: event.start_datetime,
    end: event.end_datetime,
    className: `event-category-${event.color_category}`,
    extendedProps: { original_event_id: event.original_event_id }
  }))

  return (
    <Card className="p-8 h-[calc(100vh-12rem)] bg-white/5 backdrop-blur-3xl border-white/10 rounded-[3rem] shadow-2xl relative overflow-hidden animate-in fade-in duration-1000">
      <style jsx global>{`
        .fc {
          --fc-border-color: rgba(255, 255, 255, 0.05);
          --fc-button-bg-color: rgba(255, 255, 255, 0.05);
          --fc-button-border-color: rgba(255, 255, 255, 0.1);
          --fc-button-hover-bg-color: rgba(255, 255, 255, 0.1);
          --fc-button-active-bg-color: var(--primary);
          --fc-today-bg-color: rgba(255, 255, 255, 0.03);
          font-family: inherit;
        }
        .fc .fc-toolbar-title {
          font-size: 1.75rem;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: -0.05em;
          color: var(--foreground);
          background: linear-gradient(135deg, #fff 0%, rgba(255,255,255,0.5) 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .fc .fc-toolbar {
          margin-bottom: 2rem !important;
        }
        .fc .fc-button {
          border-radius: 16px;
          padding: 0.6rem 1.2rem;
          font-size: 0.75rem;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          border: 1px solid rgba(255, 255, 255, 0.1);
          box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        }
        .fc .fc-button:hover {
          transform: translateY(-2px);
          background-color: rgba(255, 255, 255, 0.1);
          border-color: rgba(255, 255, 255, 0.2);
        }
        .fc .fc-button-primary:not(:disabled).fc-button-active {
          background: var(--primary) !important;
          border-color: var(--primary) !important;
          box-shadow: 0 0 20px rgba(var(--primary-rgb), 0.3);
        }
        .fc-theme-standard td, .fc-theme-standard th {
          border-color: rgba(255, 255, 255, 0.05);
        }
        .fc-col-header-cell {
          padding: 1rem 0 !important;
          background: rgba(255, 255, 255, 0.02);
        }
        .fc-col-header-cell-cushion {
          font-size: 0.7rem;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.2em;
          color: rgba(255, 255, 255, 0.4);
        }
        .fc-daygrid-day-number {
          font-size: 0.8rem;
          font-weight: 700;
          opacity: 0.5;
          padding: 1rem !important;
        }
        .fc-day-today .fc-daygrid-day-number {
          opacity: 1;
          color: var(--primary);
        }
        .fc-event {
          border-radius: 10px;
          padding: 4px 8px;
          font-size: 0.7rem;
          font-weight: 800;
          border: none !important;
          margin: 2px 4px !important;
          transition: all 0.2s;
          cursor: pointer;
        }
        .fc-event:hover {
          transform: scale(1.02) translateY(-1px);
          filter: brightness(1.2);
          box-shadow: 0 8px 16px rgba(0,0,0,0.2);
        }
        .event-category-blue { background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%) !important; color: white !important; }
        .event-category-green { background: linear-gradient(135deg, #10b981 0%, #059669 100%) !important; color: white !important; }
        .event-category-red { background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%) !important; color: white !important; }
        .event-category-purple { background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%) !important; color: white !important; }
        .event-category-orange { background: linear-gradient(135deg, #f97316 0%, #ea580c 100%) !important; color: white !important; }
      `}</style>
      
      <div className="flex flex-col h-full relative">
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
             day: 'Dia'
           }}
         />
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[560px] p-0 border-white/10 bg-background/95 backdrop-blur-3xl rounded-[3rem] shadow-2xl overflow-hidden">
          <DialogHeader className="px-8 pt-8 pb-6 bg-white/5 border-b border-white/10">
             <div className="flex items-center gap-3 mb-1">
                <div className="p-2 bg-primary/10 rounded-xl">
                   <CalendarIcon className="h-5 w-5 text-primary" />
                </div>
                <DialogTitle className="text-2xl font-black tracking-tighter uppercase">
                   {selectedEvent ? 'Atualizar Evento' : 'Novo Registro Agenda'}
                </DialogTitle>
             </div>
             <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 ml-12">Atlas Management System</p>
          </DialogHeader>
          
          <div className="px-8 py-8">
            <Form {...form}>
              <form id="calendar-event-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem className="space-y-3">
                      <FormLabel className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 ml-1">Título do Compromisso</FormLabel>
                      <FormControl>
                        <div className="relative group">
                           <Sparkles className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                           <Input placeholder="Descreva o objetivo da reunião..." {...field} className="h-12 pl-11 rounded-2xl border-white/10 bg-white/5 hover:bg-white/10 transition-all font-bold" />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="start_datetime"
                    render={({ field }) => (
                      <FormItem className="space-y-3">
                        <FormLabel className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 ml-1">Data e Hora Início</FormLabel>
                        <FormControl>
                          <div className="relative">
                             <Clock className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-primary/50" />
                             <Input type="datetime-local" {...field} className="h-12 pl-11 rounded-2xl border-white/10 bg-white/5 font-bold" />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="end_datetime"
                    render={({ field }) => (
                      <FormItem className="space-y-3">
                        <FormLabel className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 ml-1">Data e Hora Término</FormLabel>
                        <FormControl>
                           <div className="relative">
                              <Clock className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-primary/50" />
                              <Input type="datetime-local" {...field} className="h-12 pl-11 rounded-2xl border-white/10 bg-white/5 font-bold" />
                           </div>
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
                    <FormItem className="space-y-3">
                      <FormLabel className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 ml-1">Classificação Visual</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger className="h-12 rounded-2xl border-white/10 bg-white/5 font-bold">
                            <div className="flex items-center gap-3">
                               <Tag className="h-4 w-4 text-primary/50" />
                               <SelectValue placeholder="Selecione uma categoria" />
                            </div>
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="rounded-2xl border-white/10 bg-background/95 backdrop-blur-xl">
                          <SelectItem value="blue" className="rounded-xl font-bold">Canal Azul (Comercial)</SelectItem>
                          <SelectItem value="green" className="rounded-xl font-bold">Canal Verde (Sucesso)</SelectItem>
                          <SelectItem value="red" className="rounded-xl font-bold">Canal Vermelho (Urgência)</SelectItem>
                          <SelectItem value="purple" className="rounded-xl font-bold">Canal Roxo (Estratégico)</SelectItem>
                          <SelectItem value="orange" className="rounded-xl font-bold">Canal Laranja (Operacional)</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </form>
            </Form>
          </div>
          
          <div className="px-8 py-6 bg-white/5 border-t border-white/10 flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={() => setIsDialogOpen(false)} className="h-12 px-6 rounded-2xl font-black uppercase tracking-widest text-[10px]">Cancelar</Button>
            <Button type="submit" form="calendar-event-form" disabled={!canManageEvents || createEvent.isPending || updateEvent.isPending} className="h-12 px-10 rounded-2xl bg-primary text-primary-foreground font-black uppercase tracking-widest text-[10px] shadow-xl shadow-primary/20">
               {(createEvent.isPending || updateEvent.isPending) ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirmar Agendamento"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      
      {/* Decorative Background Elements */}
      <div className="absolute -bottom-24 -left-24 h-96 w-96 bg-primary/10 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute -top-24 -right-24 h-96 w-96 bg-blue-500/10 blur-[120px] rounded-full pointer-events-none" />
    </Card>
  )
}
