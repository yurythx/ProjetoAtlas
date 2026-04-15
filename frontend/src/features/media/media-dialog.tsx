"use client"

import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { MediaManager } from "./media-manager"
import { Button } from "@/components/ui/button"
import { Image as ImageIcon } from "lucide-react"
import type { ReactNode } from "react"

interface MediaDialogProps {
    onSelect: (url: string) => void
    onSelectItem?: (item: { id: string; file_url: string; title: string; file_type: string; file_size: number; created_at: string }) => void
    trigger?: ReactNode
    children?: ReactNode
}

export function MediaDialog({ onSelect, onSelectItem, trigger, children }: MediaDialogProps) {
    return (
        <Dialog>
            <DialogTrigger asChild>
                {trigger || children || (
                    <Button variant="outline" size="sm">
                        <ImageIcon className="h-4 w-4 mr-2" />
                        Biblioteca de Mídia
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Selecionar Mídia</DialogTitle>
                </DialogHeader>
                <MediaManager selectable onSelect={onSelect} onSelectItem={onSelectItem} />
            </DialogContent>
        </Dialog>
    )
}
