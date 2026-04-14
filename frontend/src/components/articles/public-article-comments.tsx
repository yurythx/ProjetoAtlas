'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { showApiError } from '@/lib/toast-helpers';
import { toast } from 'sonner';
import axios from 'axios';
import { useAuth } from '@/hooks/use-auth';
import { Link2 } from 'lucide-react';

interface Comment {
    id: number;
    content: string;
    created_at: string;
    author_name?: string | null;
    name?: string | null;
    reply_count?: number;
    replies?: Array<{
        id: number;
        content: string;
        created_at: string;
        author_name?: string | null;
        name?: string | null;
    }>;
}

type CommentReply = NonNullable<Comment["replies"]>[number]

interface PublicArticleCommentsProps {
    articleId: number;
    articleSlug?: string | null;
    companySlug?: string | null;
}

export function PublicArticleComments({ articleId, articleSlug, companySlug }: PublicArticleCommentsProps) {
    const queryClient = useQueryClient();
    const { user } = useAuth();
    const [name, setName] = React.useState('');
    const [email, setEmail] = React.useState('');
    const [content, setContent] = React.useState('');
    const [submitted, setSubmitted] = React.useState(false);
    const [emailError, setEmailError] = React.useState<string | null>(null);
    const [replyTo, setReplyTo] = React.useState<Comment | null>(null);
    const [website, setWebsite] = React.useState('');
    const prefilledRef = React.useRef(false);
    const [highlightId, setHighlightId] = React.useState<string | null>(null)
    const maxLength = 1500;
    const highlightTimeoutRef = React.useRef<number | null>(null)
    const [repliesByParent, setRepliesByParent] = React.useState<Record<number, { items: CommentReply[]; next: string | null; isLoading: boolean }>>({})

    const parseNextPage = (nextUrl: string | null) => {
        if (!nextUrl) return undefined
        try {
            const url = new URL(nextUrl, 'http://localhost')
            const p = url.searchParams.get('page')
            const n = p ? Number(p) : NaN
            return Number.isFinite(n) && n > 0 ? n : undefined
        } catch {
            return undefined
        }
    }

    const normalizedEmail = React.useMemo(() => email.trim(), [email]);
    const isEmailValid = React.useMemo(() => {
        if (!normalizedEmail) return true;
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail);
    }, [normalizedEmail]);

    React.useEffect(() => {
        if (!normalizedEmail) {
            setEmailError(null);
            return;
        }
        setEmailError(isEmailValid ? null : 'Informe um email válido.');
    }, [isEmailValid, normalizedEmail]);

    React.useEffect(() => {
        if (submitted) setSubmitted(false);
    }, [name, email, content, submitted]);

    React.useEffect(() => {
        if (prefilledRef.current) return;
        if (!user) return;
        prefilledRef.current = true;

        const fullName = `${user.first_name || ''} ${user.last_name || ''}`.trim();
        const fallbackName = fullName || user.username || '';
        if (!name.trim() && fallbackName) setName(fallbackName);
        if (!email.trim() && user.email) setEmail(user.email);
    }, [email, name, user]);

    const { data, isLoading } = useQuery({
        queryKey: ['public-article-comments', articleId, companySlug],
        queryFn: async ({ signal }) => {
            const res = await api.get<Comment[] | { results: Comment[] }>('/api/articles/public/comments/', {
                params: { article: articleId },
                headers: companySlug ? { 'X-Company-Slug': companySlug } : {},
                signal,
            });
            return Array.isArray(res.data) ? res.data : (res.data.results || []);
        },
        enabled: Number.isFinite(articleId) && articleId > 0,
        staleTime: 30_000,
        retry: 1,
    });

    const comments = Array.isArray(data) ? data : [];

    const copyLink = async (hashId: string) => {
        if (typeof window === 'undefined') return
        try {
            const url = new URL(window.location.href)
            url.hash = `#${hashId}`
            await navigator.clipboard.writeText(url.toString())
            toast.success('Link copiado')
        } catch {
            toast.error('Não foi possível copiar o link')
        }
    }

    React.useEffect(() => {
        if (typeof window === 'undefined') return
        const hash = window.location.hash || ''
        if (!hash.startsWith('#comentario-') && !hash.startsWith('#resposta-')) return
        const id = hash.slice(1)
        const el = document.getElementById(id)
        if (!el) return
        el.scrollIntoView({ behavior: 'smooth', block: 'start' })
        setHighlightId(id)
        if (highlightTimeoutRef.current) window.clearTimeout(highlightTimeoutRef.current)
        highlightTimeoutRef.current = window.setTimeout(() => {
            setHighlightId(null)
        }, 2500)
    }, [comments.length])

    const loadMoreReplies = async (parentId: number) => {
        setRepliesByParent((prev) => {
            const cur = prev[parentId]
            return { ...prev, [parentId]: { items: cur?.items ?? [], next: cur?.next ?? null, isLoading: true } }
        })
        try {
            const cur = repliesByParent[parentId]
            const pageParam = parseNextPage(cur?.next ?? null) ?? 1
            const res = await api.get<{ results?: CommentReply[]; next?: string | null } | CommentReply[]>(
                `/api/articles/public/comments/${parentId}/replies/`,
                {
                params: { page: pageParam },
                headers: companySlug ? { 'X-Company-Slug': companySlug } : {},
                }
            )
            const body: unknown = res.data
            const newItems: CommentReply[] = Array.isArray(body)
                ? (body as CommentReply[])
                : (typeof body === "object" && body && Array.isArray((body as { results?: unknown }).results)
                    ? ((body as { results: CommentReply[] }).results)
                    : [])
            const next =
                Array.isArray(body)
                    ? null
                    : (typeof body === "object" && body ? ((body as { next?: string | null }).next ?? null) : null)
            setRepliesByParent((prev) => {
                const existing = prev[parentId]?.items ?? []
                const seen = new Set(existing.map((x) => x.id))
                const merged = [...existing, ...newItems.filter((x) => !seen.has(x.id))]
                return { ...prev, [parentId]: { items: merged, next, isLoading: false } }
            })
        } catch {
            setRepliesByParent((prev) => {
                const cur2 = prev[parentId]
                return { ...prev, [parentId]: { items: cur2?.items ?? [], next: cur2?.next ?? null, isLoading: false } }
            })
        }
    }

    const createMutation = useMutation({
        mutationFn: async () => {
            const trimmed = content.trim();
            if (!trimmed) throw new Error('Conteúdo do comentário é obrigatório.');
            if (!isEmailValid) throw new Error('Informe um email válido.');
            if (trimmed.length > maxLength) throw new Error(`O comentário deve ter no máximo ${maxLength} caracteres.`);

            const payload: Record<string, unknown> = {
                content: trimmed,
            };
            if (articleSlug) payload.article_slug = articleSlug;
            else payload.article = articleId;
            if (name.trim()) payload.name = name.trim();
            if (normalizedEmail) payload.email = normalizedEmail;
            if (replyTo?.id) payload.parent = replyTo.id;
            if (website.trim()) payload.website = website.trim();

            const res = await api.post('/api/articles/public/comments/', payload, {
                headers: companySlug ? { 'X-Company-Slug': companySlug } : {},
            });
            return res.data;
        },
        onSuccess: () => {
            setContent('');
            setReplyTo(null);
            setSubmitted(true);
            toast.success('Comentário enviado', { description: 'Ele ficará visível após aprovação.' });
            queryClient.invalidateQueries({ queryKey: ['public-article-comments', articleId, companySlug] });
        },
        onError: (err) => {
            if (axios.isAxiosError(err) && err.response?.status === 429) {
                const detail =
                    typeof err.response.data === 'object' && err.response.data && 'detail' in err.response.data
                        ? String((err.response.data as { detail?: unknown }).detail || '')
                        : ''
                toast.error('Limite atingido', {
                    description: detail || 'Você enviou muitos comentários. Tente novamente mais tarde.',
                })
                return
            }
            showApiError(err, 'Erro ao enviar comentário.');
        },
    });

    return (
        <section id="comentarios" className="mt-12 pt-10 border-t border-border/50" aria-label="Comentários">
            <div className="space-y-6">
                <div className="space-y-1">
                    <h2 className="text-lg font-bold">Comentários</h2>
                    <p className="text-sm text-muted-foreground">Veja o que outras pessoas estão dizendo.</p>
                </div>

                <div className="rounded-2xl border border-primary/10 bg-background/95 backdrop-blur p-5 space-y-4">
                    <div className="space-y-1">
                        <h3 className="text-sm font-semibold">Deixe seu comentário</h3>
                        <p className="text-xs text-muted-foreground">Comentários passam por moderação antes de aparecer.</p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <div className="text-xs font-medium text-muted-foreground">Nome (opcional)</div>
                            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Seu nome" />
                        </div>
                        <div className="space-y-1">
                            <div className="text-xs font-medium text-muted-foreground">Email (opcional)</div>
                            <Input
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="seu@email.com"
                                inputMode="email"
                            />
                            {emailError && (
                                <div className="text-xs text-destructive">{emailError}</div>
                            )}
                        </div>
                    </div>
                    <div className="hidden">
                        <Input
                            value={website}
                            onChange={(e) => setWebsite(e.target.value)}
                            placeholder="website"
                            autoComplete="off"
                            tabIndex={-1}
                        />
                    </div>

                    <div className="space-y-1">
                        <div className="text-xs font-medium text-muted-foreground">Comentário</div>
                        {replyTo && (
                            <div className="flex items-center justify-between gap-3 rounded-xl border border-border/50 bg-muted/20 px-3 py-2">
                                <div className="text-xs text-muted-foreground truncate">
                                    Respondendo a{' '}
                                    <span className="font-semibold text-foreground">
                                        {(replyTo.author_name || replyTo.name || 'Anônimo').trim()}
                                    </span>
                                </div>
                                <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setReplyTo(null)}>
                                    Cancelar
                                </Button>
                            </div>
                        )}
                        <Textarea
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                            placeholder="Escreva seu comentário..."
                            className="min-h-[120px]"
                            maxLength={maxLength}
                        />
                        <div className="text-[11px] text-muted-foreground text-right">
                            {content.length}/{maxLength}
                        </div>
                    </div>

                    <div className="flex items-center justify-between gap-3">
                        <div className="text-xs text-muted-foreground">
                            {submitted ? 'Enviado para moderação.' : ''}
                        </div>
                        <Button
                            onClick={() => createMutation.mutate()}
                            disabled={createMutation.isPending || !content.trim() || !isEmailValid}
                            className="rounded-xl"
                        >
                            {createMutation.isPending ? 'Enviando...' : 'Enviar'}
                        </Button>
                    </div>
                </div>

                {isLoading && (
                    <div className="space-y-4" role="status" aria-live="polite" aria-label="Carregando comentários">
                        {Array.from({ length: 3 }).map((_, i) => (
                            <div key={i} className="rounded-2xl border border-primary/10 bg-background/95 p-5 space-y-3">
                                <div className="flex items-center justify-between gap-4">
                                    <Skeleton className="h-4 w-40 rounded-lg" />
                                    <Skeleton className="h-4 w-20 rounded-lg" />
                                </div>
                                <Skeleton className="h-4 w-full rounded-lg" />
                                <Skeleton className="h-4 w-5/6 rounded-lg" />
                            </div>
                        ))}
                    </div>
                )}

                {!isLoading && comments.length === 0 && (
                    <div className="rounded-3xl border-2 border-dashed bg-muted/10 p-10 text-center">
                        <p className="text-sm text-muted-foreground font-medium">Seja o primeiro a comentar</p>
                    </div>
                )}

                {!isLoading && comments.length > 0 && (
                    <div className="space-y-4" role="list" aria-label={`${comments.length} comentários`}>
                        {comments.map((c) => {
                            const dt = new Date(c.created_at);
                            const dateLabel = Number.isNaN(dt.getTime())
                                ? ''
                                : new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).format(dt);
                            const displayName = (c.author_name || c.name || 'Anônimo').trim();
                            const repliesInitial = Array.isArray(c.replies) ? c.replies : [];
                            const repliesState = repliesByParent[c.id]
                            const replies = (repliesState?.items && Array.isArray(repliesState.items) ? repliesState.items : repliesInitial) || []
                            const replyCount = Number.isFinite(Number(c.reply_count)) ? Number(c.reply_count) : repliesInitial.length

                            return (
                                <div
                                    key={c.id}
                                    id={`comentario-${c.id}`}
                                    role="listitem"
                                    className={[
                                        "rounded-2xl border border-primary/10 bg-background/95 backdrop-blur p-5 transition-colors",
                                        highlightId === `comentario-${c.id}` ? "ring-2 ring-primary/40 bg-primary/5" : "",
                                    ].filter(Boolean).join(" ")}
                                >
                                    <div className="flex items-center justify-between gap-4">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <div className="font-semibold truncate">{displayName}</div>
                                            <Badge variant="secondary" className="text-[10px] rounded-full px-3">
                                                Comentário público
                                            </Badge>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <div className="text-xs text-muted-foreground">{dateLabel}</div>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                className="h-8 px-2"
                                                onClick={() => copyLink(`comentario-${c.id}`)}
                                                aria-label={`Copiar link do comentário ${c.id}`}
                                            >
                                                <Link2 className="h-4 w-4" aria-hidden="true" />
                                            </Button>
                                        </div>
                                    </div>
                                    <div className="mt-3 text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                                        {c.content}
                                    </div>
                                    <div className="mt-3 flex items-center justify-between">
                                        <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => setReplyTo(c)}>
                                            Responder
                                        </Button>
                                        {replyCount > replies.length && (
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                className="h-8 px-2"
                                                onClick={() => loadMoreReplies(c.id)}
                                                disabled={!!repliesState?.isLoading}
                                            >
                                                {repliesState?.isLoading ? 'Carregando...' : `Ver mais respostas (${replyCount - replies.length})`}
                                            </Button>
                                        )}
                                    </div>
                                    {replies.length > 0 && (
                                        <div className="mt-4 space-y-3 pl-4 border-l border-border/50">
                                            {replies.map((r) => {
                                                const dt2 = new Date(r.created_at);
                                                const date2 = Number.isNaN(dt2.getTime())
                                                    ? ''
                                                    : new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).format(dt2);
                                                const name2 = (r.author_name || r.name || 'Anônimo').trim();

                                                return (
                                                    <div
                                                        key={r.id}
                                                        id={`resposta-${r.id}`}
                                                        className={[
                                                            "rounded-xl border border-border/50 bg-muted/10 p-4 transition-colors",
                                                            highlightId === `resposta-${r.id}` ? "ring-2 ring-primary/40 bg-primary/5" : "",
                                                        ].filter(Boolean).join(" ")}
                                                    >
                                                        <div className="flex items-center justify-between gap-4">
                                                            <div className="font-semibold truncate">{name2}</div>
                                                            <div className="flex items-center gap-2">
                                                                <div className="text-xs text-muted-foreground">{date2}</div>
                                                                <Button
                                                                    size="sm"
                                                                    variant="ghost"
                                                                    className="h-8 px-2"
                                                                    onClick={() => copyLink(`resposta-${r.id}`)}
                                                                    aria-label={`Copiar link da resposta ${r.id}`}
                                                                >
                                                                    <Link2 className="h-4 w-4" aria-hidden="true" />
                                                                </Button>
                                                            </div>
                                                        </div>
                                                        <div className="mt-2 text-sm whitespace-pre-wrap">{r.content}</div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </section>
    );
}
