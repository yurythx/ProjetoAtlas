'use client';

import { Globe, Lock } from 'lucide-react';
import { Label } from '@/components/ui/label';

interface VisibilityToggleProps {
    isPublic: boolean;
    onChange: (value: boolean) => void;
    disabled?: boolean;
}

export function VisibilityToggle({ isPublic, onChange, disabled }: VisibilityToggleProps) {
    return (
        <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
            <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${isPublic ? 'bg-green-100 dark:bg-green-900/30' : 'bg-orange-100 dark:bg-orange-900/30'}`}>
                    {isPublic ? (
                        <Globe className="h-5 w-5 text-green-600 dark:text-green-400" aria-hidden="true" />
                    ) : (
                        <Lock className="h-5 w-5 text-orange-600 dark:text-orange-400" aria-hidden="true" />
                    )}
                </div>
                <div>
                    <Label className="text-base font-semibold cursor-pointer">
                        {isPublic ? 'Artigo Público' : 'Artigo Privado'}
                    </Label>
                    <p className="text-sm text-muted-foreground mt-0.5">
                        {isPublic
                            ? 'Visível para todos, mesmo sem login'
                            : 'Visível apenas para membros da sua empresa'}
                    </p>
                </div>
            </div>
            <button
                type="button"
                onClick={() => !disabled && onChange(!isPublic)}
                disabled={disabled}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${isPublic
                        ? 'bg-green-600 dark:bg-green-500'
                        : 'bg-gray-200 dark:bg-gray-700'
                    } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                role="switch"
                aria-checked={isPublic}
                aria-label="Alternar visibilidade do artigo"
            >
                <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isPublic ? 'translate-x-6' : 'translate-x-1'
                        }`}
                />
            </button>
        </div>
    );
}
