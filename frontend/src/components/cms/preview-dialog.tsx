"use client"

import { useState } from "react"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import {
    Eye,
    Smartphone,
    Tablet,
    Monitor,
    Clock,
    User,
    Tag
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import Image from "next/image"

interface PreviewDialogProps {
    title: string
    content: string
    excerpt?: string
    image?: string
    categoryName?: string
    authorName?: string
    date?: string
    type: 'article' | 'page'
}

type DeviceMode = 'mobile' | 'tablet' | 'desktop'

export function PreviewDialog({
    title,
    content,
    excerpt,
    image,
    categoryName,
    authorName,
    date,
    type
}: PreviewDialogProps) {
    const [device, setDevice] = useState<DeviceMode>('desktop')

    const deviceSpecs = {
        mobile: "max-w-[375px]",
        tablet: "max-w-[768px]",
        desktop: "max-w-full"
    }

    return (
        <Dialog>
            <DialogTrigger asChild>
                <Button variant="outline" type="button" className="group" aria-label="Visualizar conteúdo">
                    <Eye className="h-4 w-4 mr-2 group-hover:text-primary transition-colors" aria-hidden="true" />
                    Visualizar
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-[95vw] w-full h-[95vh] p-0 gap-0 overflow-hidden flex flex-col border-none shadow-2xl">
                <DialogHeader className="p-4 border-b bg-background/95 backdrop-blur-md sticky top-0 z-50 flex flex-row items-center justify-between">
                    <div>
                        <DialogTitle className="text-lg font-bold flex items-center gap-2">
                            <Eye className="h-5 w-5 text-primary" aria-hidden="true" />
                            Preview do Conteúdo
                        </DialogTitle>
                        <p className="text-xs text-muted-foreground mt-0.5">Veja como seu {type === 'article' ? 'artigo' : 'página'} será exibido para seus leitores.</p>
                    </div>

                    <div className="flex bg-muted p-1 rounded-lg mr-8">
                        <Button
                            variant={device === 'mobile' ? "secondary" : "ghost"}
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => setDevice('mobile')}
                            aria-label="Modo mobile"
                        >
                            <Smartphone className="h-4 w-4" aria-hidden="true" />
                        </Button>
                        <Button
                            variant={device === 'tablet' ? "secondary" : "ghost"}
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => setDevice('tablet')}
                            aria-label="Modo tablet"
                        >
                            <Tablet className="h-4 w-4" aria-hidden="true" />
                        </Button>
                        <Button
                            variant={device === 'desktop' ? "secondary" : "ghost"}
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => setDevice('desktop')}
                            aria-label="Modo desktop"
                        >
                            <Monitor className="h-4 w-4" aria-hidden="true" />
                        </Button>
                    </div>
                </DialogHeader>

                <div className="flex-1 bg-muted/20 overflow-hidden p-4 md:p-8 flex justify-center">
                    <div className={cn(
                        "bg-background w-full h-full shadow-2xl border transition-all duration-300 overflow-hidden rounded-t-xl",
                        deviceSpecs[device]
                    )}>
                        <ScrollArea className="h-full w-full">
                            <div className="p-6 md:p-12">
                                {type === 'article' ? (
                                    <article className="mx-auto">
                                        <header className="space-y-6 mb-12">
                                            <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                                                {categoryName && (
                                                    <div className="flex items-center gap-1.5 bg-primary/10 text-primary px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wide">
                                                        <Tag className="h-3 w-3" aria-hidden="true" />
                                                        {categoryName}
                                                    </div>
                                                )}
                                                {date && (
                                                    <div className="flex items-center gap-1.5">
                                                        <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                                                        <span>{date}</span>
                                                    </div>
                                                )}
                                                {authorName && (
                                                    <div className="flex items-center gap-1.5">
                                                        <User className="h-3.5 w-3.5" aria-hidden="true" />
                                                        <span>Por {authorName}</span>
                                                    </div>
                                                )}
                                            </div>

                                            <h1 className="text-3xl md:text-5xl lg:text-6xl font-black tracking-tight leading-[1.15]">
                                                {title || "Título do Artigo"}
                                            </h1>

                                            {excerpt && (
                                                <p className="text-xl md:text-2xl text-muted-foreground leading-relaxed font-serif italic border-l-4 pl-6 border-primary/20 bg-muted/5 py-4 rounded-r-lg">
                                                    {excerpt}
                                                </p>
                                            )}
                                        </header>

                                        {image && (
                                            <div className="aspect-[21/9] relative rounded-2xl overflow-hidden mb-12 shadow-inner border">
                                                <Image
                                                    src={image}
                                                    alt={title || 'Imagem'}
                                                    fill
                                                    className="object-cover hover:scale-105 transition-transform duration-700"
                                                    sizes="(max-width: 768px) 100vw, 75vw"
                                                />
                                            </div>
                                        )}

                                        <div
                                            className="prose prose-lg sm:prose-xl dark:prose-invert max-w-none prose-headings:font-black prose-headings:tracking-tight prose-a:text-primary hover:prose-a:text-primary/80 prose-img:rounded-2xl prose-blockquote:border-primary/30 prose-blockquote:bg-muted/10 prose-blockquote:py-1"
                                            dangerouslySetInnerHTML={{ __html: content || "<p class='text-muted-foreground text-center py-20 bg-muted/5 border-2 border-dashed rounded-xl'>Escreva algo no editor para ver o preview aqui...</p>" }}
                                        />

                                        <Separator className="my-16" />

                                        <footer className="text-center text-muted-foreground text-sm py-8 space-y-2">
                                            <p>© 2026 Atlas SaaS - Todos os direitos reservados.</p>
                                            <div className="flex justify-center gap-4">
                                                <span className="hover:text-primary cursor-pointer transition-colors">Twitter</span>
                                                <span className="hover:text-primary cursor-pointer transition-colors">LinkedIn</span>
                                                <span className="hover:text-primary cursor-pointer transition-colors">Instagram</span>
                                            </div>
                                        </footer>
                                    </article>
                                ) : (
                                    <div className="mx-auto">
                                        <header className="mb-12">
                                            <h1 className="text-4xl md:text-7xl font-black tracking-tighter mb-6 leading-none">
                                                {title || "Título da Página"}
                                            </h1>
                                            <div className="h-2 w-24 bg-primary rounded-full" />
                                        </header>

                                        <div
                                            className="prose prose-lg sm:prose-2xl dark:prose-invert max-w-none prose-headings:font-black prose-headings:tracking-tight prose-a:text-primary hover:prose-a:underline prose-img:rounded-3xl"
                                            dangerouslySetInnerHTML={{ __html: content || "<p class='text-muted-foreground text-center py-20 bg-muted/5 border-2 border-dashed rounded-xl'>Escreva algo no editor para ver o preview aqui...</p>" }}
                                        />
                                    </div>
                                )}
                            </div>
                        </ScrollArea>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}
