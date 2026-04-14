'use client';

import { Globe, Lock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface VisibilityBadgeProps {
    isPublic: boolean;
    className?: string;
}

export function VisibilityBadge({ isPublic, className = '' }: VisibilityBadgeProps) {
    return (
        <Badge
            variant={isPublic ? 'default' : 'secondary'}
            className={`gap-1.5 ${className}`}
        >
            {isPublic ? (
                <>
                    <Globe className="h-3 w-3" />
                    Público
                </>
            ) : (
                <>
                    <Lock className="h-3 w-3" />
                    Privado
                </>
            )}
        </Badge>
    );
}
