"use client"

import { useMemo } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import TextAlign from '@tiptap/extension-text-align'
import Placeholder from '@tiptap/extension-placeholder'
import { TextStyle } from '@tiptap/extension-text-style'
import { Color } from '@tiptap/extension-color'

import {
    Bold,
    Italic,
    Underline as UnderlineIcon,
    List,
    ListOrdered,
    Heading1,
    Heading2,
    Heading3,
    Quote,
    Undo,
    Redo,
    Link as LinkIcon,
    ImageIcon,
    AlignLeft,
    AlignCenter,
    AlignRight,
    AlignJustify,
    Code
} from 'lucide-react'
import { MediaDialog } from "@/features/media/media-dialog"
import { Toggle } from '@/components/ui/toggle'
import { Separator } from '@/components/ui/separator'
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger
} from "@/components/ui/tooltip"

interface RichEditorProps {
    content: string
    onChange: (content: string) => void
    placeholder?: string
    className?: string
}

type ToolbarButtonProps = {
    onClick: () => void
    isActive?: boolean
    icon: React.ComponentType<{ className?: string }>
    tooltip: string
    disabled?: boolean
}

function ToolbarButton({
    onClick,
    isActive,
    icon: Icon,
    tooltip,
    disabled = false
}: ToolbarButtonProps) {
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <Toggle
                    size="sm"
                    pressed={isActive}
                    onPressedChange={onClick}
                    disabled={disabled}
                    className="h-8 w-8 p-0"
                >
                    <Icon className="h-4 w-4" />
                </Toggle>
            </TooltipTrigger>
            <TooltipContent>
                <p>{tooltip}</p>
            </TooltipContent>
        </Tooltip>
    )
}

export function RichEditor({ content, onChange, placeholder, className }: RichEditorProps) {
    const extensions = useMemo(() => [
        StarterKit.configure({
            heading: {
                levels: [1, 2, 3],
            },
        }),
        Image.configure({

            HTMLAttributes: {
                class: 'rounded-lg border border-border shadow-sm max-w-full h-auto my-4',
            },
        }),
        TextAlign.configure({
            types: ['heading', 'paragraph'],
        }),
        Placeholder.configure({
            placeholder: placeholder || 'Comece a escrever a magia...',
            emptyEditorClass: 'is-editor-empty before:text-muted-foreground before:content-[attr(data-placeholder)] before:float-left before:h-0 before:pointer-events-none',
        }),
        TextStyle,
        Color,
    ], [placeholder])

    const editor = useEditor({
        extensions,
        content: content,
        onUpdate: ({ editor }) => {
            onChange(editor.getHTML())
        },
        editorProps: {
            attributes: {
                class: 'prose prose-sm sm:prose-base dark:prose-invert max-w-none focus:outline-none min-h-[300px] px-4 py-4 scroll-smooth selection:bg-primary/20',
            },
        },
        immediatelyRender: false,
    })

    if (!editor) {
        return null
    }

    return (
        <TooltipProvider delayDuration={400}>
            <div className={`flex flex-col border rounded-xl bg-background shadow-sm overflow-hidden transition-all focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary/40 ${className}`}>
                <div className="flex flex-wrap items-center gap-0.5 p-1.5 border-b bg-muted/20 backdrop-blur-sm sticky top-0 z-10">
                    <ToolbarButton
                        icon={Heading1}
                        tooltip="Título 1"
                        isActive={editor.isActive('heading', { level: 1 })}
                        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
                    />
                    <ToolbarButton
                        icon={Heading2}
                        tooltip="Título 2"
                        isActive={editor.isActive('heading', { level: 2 })}
                        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                    />
                    <ToolbarButton
                        icon={Heading3}
                        tooltip="Título 3"
                        isActive={editor.isActive('heading', { level: 3 })}
                        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
                    />

                    <Separator orientation="vertical" className="h-6 mx-1 bg-border/60" />

                    <ToolbarButton
                        icon={Bold}
                        tooltip="Negrito"
                        isActive={editor.isActive('bold')}
                        onClick={() => editor.chain().focus().toggleBold().run()}
                    />
                    <ToolbarButton
                        icon={Italic}
                        tooltip="Itálico"
                        isActive={editor.isActive('italic')}
                        onClick={() => editor.chain().focus().toggleItalic().run()}
                    />
                    <ToolbarButton
                        icon={UnderlineIcon}
                        tooltip="Sublinhado"
                        isActive={editor.isActive('underline')}
                        onClick={() => editor.chain().focus().toggleUnderline().run()}
                    />
                    <ToolbarButton
                        icon={Code}
                        tooltip="Código"
                        isActive={editor.isActive('code')}
                        onClick={() => editor.chain().focus().toggleCode().run()}
                    />

                    <Separator orientation="vertical" className="h-6 mx-1 bg-border/60" />

                    <ToolbarButton
                        icon={AlignLeft}
                        tooltip="Alinhar à Esquerda"
                        isActive={editor.isActive({ textAlign: 'left' })}
                        onClick={() => editor.chain().focus().setTextAlign('left').run()}
                    />
                    <ToolbarButton
                        icon={AlignCenter}
                        tooltip="Centralizar"
                        isActive={editor.isActive({ textAlign: 'center' })}
                        onClick={() => editor.chain().focus().setTextAlign('center').run()}
                    />
                    <ToolbarButton
                        icon={AlignRight}
                        tooltip="Alinhar à Direita"
                        isActive={editor.isActive({ textAlign: 'right' })}
                        onClick={() => editor.chain().focus().setTextAlign('right').run()}
                    />
                    <ToolbarButton
                        icon={AlignJustify}
                        tooltip="Justificar"
                        isActive={editor.isActive({ textAlign: 'justify' })}
                        onClick={() => editor.chain().focus().setTextAlign('justify').run()}
                    />

                    <Separator orientation="vertical" className="h-6 mx-1 bg-border/60" />

                    <ToolbarButton
                        icon={List}
                        tooltip="Lista com Marcadores"
                        isActive={editor.isActive('bulletList')}
                        onClick={() => editor.chain().focus().toggleBulletList().run()}
                    />
                    <ToolbarButton
                        icon={ListOrdered}
                        tooltip="Lista Numerada"
                        isActive={editor.isActive('orderedList')}
                        onClick={() => editor.chain().focus().toggleOrderedList().run()}
                    />
                    <ToolbarButton
                        icon={Quote}
                        tooltip="Citação"
                        isActive={editor.isActive('blockquote')}
                        onClick={() => editor.chain().focus().toggleBlockquote().run()}
                    />

                    <Separator orientation="vertical" className="h-6 mx-1 bg-border/60" />

                    <MediaDialog
                        onSelect={(url) => {
                            editor.chain().focus().setImage({ src: url }).run()
                        }}
                        trigger={
                            <div className="contents">
                                <ToolbarButton
                                    icon={ImageIcon}
                                    tooltip="Imagem"
                                    onClick={() => { }}
                                />
                            </div>
                        }
                    />

                    <div className="flex items-center gap-1 px-1">
                        <input
                            type="color"
                            onInput={e => editor.chain().focus().setColor((e.target as HTMLInputElement).value).run()}
                            value={editor.getAttributes('textStyle').color || '#000000'}
                            className="h-6 w-6 rounded border-none bg-transparent cursor-pointer"
                        />
                    </div>

                    <ToolbarButton
                        icon={LinkIcon}
                        tooltip="Adicionar Link"
                        isActive={editor.isActive('link')}
                        onClick={() => {
                            const previousUrl = editor.getAttributes('link').href
                            const url = window.prompt('URL do link:', previousUrl)

                            if (url === null) return
                            if (url === '') {
                                editor.chain().focus().extendMarkRange('link').unsetLink().run()
                                return
                            }

                            editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
                        }}
                    />

                    <div className="ml-auto flex items-center gap-0.5">
                        <ToolbarButton
                            icon={Undo}
                            tooltip="Desfazer"
                            disabled={!editor.can().undo()}
                            onClick={() => editor.chain().focus().undo().run()}
                        />
                        <ToolbarButton
                            icon={Redo}
                            tooltip="Refazer"
                            disabled={!editor.can().redo()}
                            onClick={() => editor.chain().focus().redo().run()}
                        />
                    </div>
                </div>

                <div className="flex-1 relative overflow-auto p-2 bg-gradient-to-b from-transparent to-muted/5">
                    <EditorContent editor={editor} />
                </div>
            </div>
        </TooltipProvider>
    )
}
