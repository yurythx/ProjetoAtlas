"use client"

import * as React from "react"
import { useDropzone } from "react-dropzone"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Camera, X } from "lucide-react"
import { cn } from "@/lib/utils"

interface AvatarUploadProps {
    value?: string | File | null
    onChange: (file: File | null) => void
    disabled?: boolean
    initials?: string
}

export function AvatarUpload({ value, onChange, disabled, initials = "US" }: AvatarUploadProps) {
    const [preview, setPreview] = React.useState<string | null>(null)

    // Sync preview with value
    React.useEffect(() => {
        if (typeof value === "string") {
            setPreview(value)
        } else if (value instanceof File) {
            const objectUrl = URL.createObjectURL(value)
            setPreview(objectUrl)
            return () => URL.revokeObjectURL(objectUrl)
        } else {
            setPreview(null)
        }
    }, [value])

    const onDrop = React.useCallback(
        (acceptedFiles: File[]) => {
            const file = acceptedFiles[0]
            if (file) {
                onChange(file)
            }
        },
        [onChange]
    )

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: {
            "image/*": [".png", ".jpg", ".jpeg", ".webp"],
        },
        maxFiles: 1,
        multiple: false,
        disabled,
    })

    return (
        <div className="flex items-center gap-6">
            <div
                {...getRootProps()}
                className={cn(
                    "relative flex h-24 w-24 shrink-0 overflow-hidden rounded-full cursor-pointer transition-all hover:opacity-90 ring-4 ring-background border-2 border-dashed border-transparent",
                    isDragActive && "border-primary opacity-50",
                    disabled && "cursor-not-allowed opacity-50"
                )}
            >
                <input {...getInputProps()} />
                <Avatar className="h-full w-full">
                    <AvatarImage src={preview || ""} className="object-cover" />
                    <AvatarFallback className="text-xl bg-muted">{initials}</AvatarFallback>
                </Avatar>

                {!disabled && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/40 opacity-0 transition-opacity hover:opacity-100">
                        <Camera className="h-6 w-6 text-white" />
                    </div>
                )}
            </div>

            <div className="space-y-1">
                <h4 className="text-sm font-medium leading-none">Foto de Perfil</h4>
                <p className="text-xs text-muted-foreground w-[200px]">
                    Clique na imagem para alterar. Suporta JPG, PNG ou WebP (max 5MB).
                </p>
                {value instanceof File && (
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-0 text-destructive hover:text-destructive hover:bg-transparent"
                        onClick={(e) => {
                            e.stopPropagation()
                            onChange(null)
                        }}
                    >
                        <X className="mr-1 h-3 w-3" />
                        Remover seleção
                    </Button>
                )}
            </div>
        </div>
    )
}
