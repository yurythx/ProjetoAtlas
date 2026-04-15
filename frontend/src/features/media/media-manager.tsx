"use client"

import { useState, useMemo } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api as axios } from "@/lib/axios"
import { fixImageUrl } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import Image from "next/image"
import {
    Loader2,
    Upload,
    Trash2,

    CheckCircle2,
    FileText,
    Search,

    ExternalLink,
    Info,
    Calendar,
    HardDrive,
    Copy,
    Download
} from "lucide-react"
import { toast } from "sonner"
import { useDropzone } from "react-dropzone"
import { motion, AnimatePresence } from "framer-motion"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,

} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"

interface MediaItem {
    id: string
    file_url: string
    title: string
    file_type: string
    file_size: number
    created_at: string
}

interface MediaManagerProps {
    onSelect?: (url: string) => void
    onSelectItem?: (item: MediaItem) => void
    selectable?: boolean
}

type FilterType = "all" | "image" | "document"

export function MediaManager({ onSelect, onSelectItem, selectable }: MediaManagerProps) {
    const queryClient = useQueryClient()
    const [searchTerm, setSearchTerm] = useState("")
    const [filterType, setFilterType] = useState<FilterType>("all")
    const [selectedItem, setSelectedItem] = useState<MediaItem | null>(null)
    const [isDetailsOpen, setIsDetailsOpen] = useState(false)

    // Query para buscar arquivos
    const { data: mediaItems, isLoading } = useQuery({
        queryKey: ["media"],
        queryFn: async () => {
            const response = await axios.get("/api/media/files/")
            return response.data
        },
    })

    // Mutação para upload
    const uploadMutation = useMutation({
        mutationFn: async (file: File) => {
            const formData = new FormData()
            formData.append("file", file)
            formData.append("title", file.name)

            // Usando fetch nativo para garantir controle total sobre headers (Multipart boundary)
            const token = localStorage.getItem('accessToken')
            const companySlug = localStorage.getItem('companySlug')

            const headers: HeadersInit = {}
            if (token) headers['Authorization'] = `Bearer ${token}`
            if (companySlug) headers['X-Company-Slug'] = companySlug

            const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8005'}/api/media/files/`, {
                method: 'POST',
                headers,
                body: formData
            })

            if (!response.ok) {
                const errorData = await response.json().catch(() => null)
                throw new Error(errorData?.detail || 'Erro no upload')
            }

            return response.json()
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["media"] })
        },
    })

    // Mutação para deletar
    const deleteMutation = useMutation({
        mutationFn: async (id: string) => {
            await axios.delete(`/api/media/files/${id}/`)
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["media"] })
            setIsDetailsOpen(false)
            toast.success("Arquivo removido com sucesso!")
        },
    })

    // Configuração do Dropzone
    const onDrop = async (acceptedFiles: File[]) => {
        const promises = acceptedFiles.map(file => uploadMutation.mutateAsync(file))

        toast.promise(Promise.all(promises), {
            loading: `Enviando ${acceptedFiles.length} arquivo(s)...`,
            success: "Upload concluído!",
            error: "Erro ao enviar um ou mais arquivos.",
        })
    }

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: {
            'image/*': [],
            'application/pdf': [],
            'application/msword': [],
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [],
            'text/plain': []
        }
    })

    // Itens filtrados
    const filteredItems = useMemo(() => {
        if (!mediaItems) return []

        return mediaItems.filter((item: MediaItem) => {
            const matchesSearch = item.title.toLowerCase().includes(searchTerm.toLowerCase())
            const matchesType = filterType === "all"
                || (filterType === "image" && item.file_type.startsWith("image/"))
                || (filterType === "document" && !item.file_type.startsWith("image/"))

            return matchesSearch && matchesType
        })
    }, [mediaItems, searchTerm, filterType])

    // Formatadores
    const formatFileSize = (bytes: number) => {
        if (bytes === 0) return '0 Bytes'
        const k = 1024
        const sizes = ['Bytes', 'KB', 'MB', 'GB']
        const i = Math.floor(Math.log(bytes) / Math.log(k))
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
    }

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text)
        toast.success("URL copiada para o clipboard!")
    }

    const handleItemClick = (item: MediaItem) => {
        if (selectable && onSelectItem) {
            onSelectItem(item)
        } else if (selectable && onSelect) {
            onSelect(fixImageUrl(item.file_url))
        } else {
            setSelectedItem(item)
            setIsDetailsOpen(true)
        }
    }

    return (
        <div className="flex flex-col h-full space-y-4">
            {/* Header e Barra de Ferramentas */}
            <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
                <div className="flex-1 w-full max-w-sm relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Buscar arquivos..."
                        className="pl-10"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                <div className="flex items-center gap-2">
                    <div className="flex bg-muted p-1 rounded-lg">
                        <Button
                            variant={filterType === "all" ? "secondary" : "ghost"}
                            size="sm"
                            className="h-8 px-3 rounded-md shadow-none"
                            onClick={() => setFilterType("all")}
                        >
                            Todos
                        </Button>
                        <Button
                            variant={filterType === "image" ? "secondary" : "ghost"}
                            size="sm"
                            className="h-8 px-3 rounded-md shadow-none"
                            onClick={() => setFilterType("image")}
                        >
                            Imagens
                        </Button>
                        <Button
                            variant={filterType === "document" ? "secondary" : "ghost"}
                            size="sm"
                            className="h-8 px-3 rounded-md shadow-none"
                            onClick={() => setFilterType("document")}
                        >
                            Docs
                        </Button>
                    </div>
                </div>
            </div>

            {/* Area de Dropzone e Galeria */}
            <div className="flex-1 min-h-0 flex flex-col space-y-4">
                <div
                    {...getRootProps()}
                    className={`
                        border-2 border-dashed rounded-xl p-8 transition-all flex flex-col items-center justify-center text-center cursor-pointer
                        ${isDragActive ? "border-primary bg-primary/5 active-ring" : "border-muted-foreground/20 hover:border-primary/50 hover:bg-muted/30"}
                        ${uploadMutation.isPending ? "opacity-50 pointer-events-none" : ""}
                    `}
                >
                    <input {...getInputProps()} />
                    <div className="bg-primary/10 p-3 rounded-full mb-3">
                        <Upload className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                        <p className="text-sm font-medium">
                            {isDragActive ? "Solte os arquivos aqui" : "Arraste arquivos ou clique para upload"}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                            Imagens e documentos até 10MB
                        </p>
                    </div>
                </div>

                {isLoading ? (
                    <div className="flex-1 flex items-center justify-center">
                        <Loader2 className="h-10 w-10 animate-spin text-primary/50" />
                    </div>
                ) : (
                    <div className="flex-1 overflow-y-auto">
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 pb-4">
                            <AnimatePresence>
                                {filteredItems.map((item: MediaItem) => (
                                    <motion.div
                                        key={item.id}
                                        layout
                                        initial={{ opacity: 0, scale: 0.9 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        exit={{ opacity: 0, scale: 0.9 }}
                                        transition={{ duration: 0.2 }}
                                    >
                                        <Card
                                            className="group relative overflow-hidden h-full cursor-pointer hover:ring-2 hover:ring-primary transition-all shadow-none border-border/50"
                                            onClick={() => handleItemClick(item)}
                                        >
                                            <CardContent className="p-0 aspect-square relative flex items-center justify-center bg-muted/30">
                                                {item.file_type.startsWith("image/") ? (
                                                    <div className="relative w-full h-full">
                                                        <Image
                                                            src={fixImageUrl(item.file_url)}
                                                            alt={item.title || 'Imagem'}
                                                            fill
                                                            className="object-cover transition-transform group-hover:scale-110 duration-500"
                                                            sizes="(max-width: 768px) 50vw, 25vw"
                                                            priority={false}
                                                            unoptimized
                                                        />
                                                    </div>
                                                ) : (
                                                    <div className="flex flex-col items-center justify-center text-muted-foreground group-hover:text-primary transition-colors">
                                                        <FileText className="h-12 w-12" />
                                                        <span className="text-[11px] font-medium mt-2 px-2 text-center truncate w-full uppercase">
                                                            {item.file_type.split("/")[1] || "DOC"}
                                                        </span>
                                                    </div>
                                                )}

                                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                    {selectable ? (
                                                        <CheckCircle2 className="h-8 w-8 text-white" />
                                                    ) : (
                                                        <Info className="h-8 w-8 text-white" />
                                                    )}
                                                </div>

                                                <div className="absolute bottom-0 inset-x-0 p-2 bg-gradient-to-t from-black/60 to-transparent">
                                                    <p className="text-[10px] text-white truncate font-medium">
                                                        {item.title}
                                                    </p>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    </motion.div>
                                ))}
                            </AnimatePresence>

                            {filteredItems.length === 0 && !isLoading && (
                                <div className="col-span-full h-48 border border-dashed rounded-lg flex flex-col items-center justify-center text-muted-foreground opacity-60 bg-muted/10">
                                    <Search className="h-10 w-10 mb-2" />
                                    <p>Nenhum resultado para os filtros atuais.</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Modal de Detalhes */}
            <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
                <DialogContent className="max-w-2xl overflow-hidden p-0 gap-0">
                    <DialogHeader className="p-6 pb-0">
                        <DialogTitle className="flex items-center gap-2">
                            <Info className="h-5 w-5 text-primary" />
                            Detalhes do Arquivo
                        </DialogTitle>
                        <DialogDescription>
                            Informações técnicas e metadados do ativo.
                        </DialogDescription>
                    </DialogHeader>

                    {selectedItem && (
                        <div className="flex flex-col md:flex-row min-h-[400px]">
                            <div className="flex-1 bg-muted/30 p-6 flex items-center justify-center border-b md:border-b-0 md:border-r">
                                {selectedItem.file_type.startsWith("image/") ? (
                                    <div className="relative group w-full h-[300px]">
                                        <Image
                                            src={fixImageUrl(selectedItem.file_url || '')}
                                            alt={selectedItem.title || 'Imagem'}
                                            fill
                                            className="object-contain rounded-lg shadow-lg border bg-background"
                                            sizes="(max-width: 768px) 100vw, 50vw"
                                            unoptimized
                                        />
                                        <a
                                            href={fixImageUrl(selectedItem.file_url || '')}
                                            target="_blank"
                                            className="absolute top-2 right-2 p-2 bg-black/60 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black"
                                        >
                                            <ExternalLink className="h-4 w-4" />
                                        </a>
                                    </div>
                                ) : (
                                    <div className="bg-background p-10 rounded-xl shadow-sm border flex flex-col items-center">
                                        <FileText className="h-20 w-20 text-muted-foreground mb-4" />
                                        <Badge variant="outline" className="uppercase">{selectedItem.file_type}</Badge>
                                    </div>
                                )}
                            </div>

                            <div className="w-full md:w-72 p-6 flex flex-col space-y-6">
                                <div className="space-y-4">
                                    <div className="space-y-1">
                                        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Nome do Arquivo</h4>
                                        <p className="text-sm font-medium break-all">{selectedItem.title}</p>
                                    </div>

                                    <div className="grid grid-cols-1 gap-4 pt-2">
                                        <div className="flex items-center gap-3">
                                            <HardDrive className="h-4 w-4 text-muted-foreground" />
                                            <div>
                                                <p className="text-[10px] text-muted-foreground leading-none">Tamanho</p>
                                                <p className="text-xs font-medium">{formatFileSize(selectedItem.file_size)}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <Calendar className="h-4 w-4 text-muted-foreground" />
                                            <div>
                                                <p className="text-[10px] text-muted-foreground leading-none">Adicionado em</p>
                                                <p className="text-xs font-medium">
                                                    {format(new Date(selectedItem.created_at), "dd 'de' MMM, yyyy", { locale: ptBR })}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-3 pt-4">
                                    <Button variant="outline" size="sm" className="w-full justify-start" onClick={() => copyToClipboard(fixImageUrl(selectedItem.file_url || ''))}>
                                        <Copy className="h-3 w-3 mr-2" />
                                        Copiar URL
                                    </Button>
                                    <Button asChild variant="outline" size="sm" className="w-full justify-start">
                                        <a href={fixImageUrl(selectedItem.file_url || '')} download target="_blank">
                                            <Download className="h-3 w-3 mr-2" />
                                            Baixar Arquivo
                                        </a>
                                    </Button>
                                    <Separator />
                                    <Button
                                        variant="destructive"
                                        size="sm"
                                        className="w-full justify-start"
                                        onClick={() => {
                                            if (confirm("Tem certeza que deseja excluir permanentemente este arquivo?")) {
                                                deleteMutation.mutate(selectedItem.id)
                                            }
                                        }}
                                        disabled={deleteMutation.isPending}
                                    >
                                        <Trash2 className="h-3 w-3 mr-2" />
                                        Excluir Permanente
                                    </Button>
                                </div>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    )
}
