'use client';

import Link from 'next/link';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';

export interface AuthorInfo {
    id: number;
    username: string;
    full_name: string;
    avatar_url?: string | null;
    bio?: string | null;
}

interface AboutAuthorProps {
    author: AuthorInfo | null | undefined;
    companySlug?: string | null;
}

export function AboutAuthor({ author, companySlug }: AboutAuthorProps) {
    if (!author) return null;

    const initials = (author.full_name || author.username || '')
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((s) => s[0]?.toUpperCase())
        .join('');

    const qs = new URLSearchParams();
    qs.set('author', author.username);
    if (companySlug) qs.set('company_slug', companySlug);
    const href = `/p/artigos?${qs.toString()}`;

    const bio = (author.bio || '').trim();

    return (
        <section className="mt-16 pt-10 border-t border-border/50" aria-label="Sobre o autor">
            <div className="rounded-3xl border border-primary/10 bg-background/95 backdrop-blur p-6 sm:p-8 shadow-sm">
                <div className="flex flex-col sm:flex-row gap-6 items-start">
                    <Avatar className="h-16 w-16 ring-2 ring-primary/10">
                        <AvatarImage src={author.avatar_url || undefined} alt={author.full_name || author.username} />
                        <AvatarFallback className="text-sm font-bold">{initials || 'AU'}</AvatarFallback>
                    </Avatar>

                    <div className="flex-1 min-w-0 space-y-2">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                            <div className="min-w-0">
                                <h2 className="text-lg font-bold leading-tight truncate">Sobre o Autor</h2>
                                <p className="text-base font-semibold text-foreground truncate">{author.full_name || author.username}</p>
                            </div>
                            <Button asChild variant="outline" className="rounded-xl">
                                <Link href={href} aria-label={`Ver perfil e artigos de ${author.full_name || author.username}`}>
                                    Ver perfil
                                </Link>
                            </Button>
                        </div>

                        <p className="text-sm text-muted-foreground leading-relaxed">
                            {bio ? bio : 'Este autor ainda não adicionou uma bio.'}
                        </p>
                    </div>
                </div>
            </div>
        </section>
    );
}

