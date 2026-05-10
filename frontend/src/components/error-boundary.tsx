"use client"

import React from 'react'
import * as Sentry from '@sentry/nextjs'
import { Button } from '@/components/ui/button'
import { AlertCircle, RefreshCw } from 'lucide-react'

interface ErrorBoundaryProps {
    children: React.ReactNode
    fallback?: React.ReactNode
}

interface ErrorBoundaryState {
    hasError: boolean
    error: Error | null
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
    constructor(props: ErrorBoundaryProps) {
        super(props)
        this.state = { hasError: false, error: null }
    }

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { hasError: true, error }
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        console.error('ErrorBoundary caught an error:', error, errorInfo)
        Sentry.captureException(error, { extra: { componentStack: errorInfo.componentStack } })
    }

    handleReset = () => {
        this.setState({ hasError: false, error: null })
    }

    render() {
        if (this.state.hasError) {
            // Use custom fallback if provided
            if (this.props.fallback) {
                return this.props.fallback
            }

            // Default error UI
            return (
                <div className="min-h-screen flex items-center justify-center p-4 bg-background relative overflow-hidden">
                    {/* Decorative background elements */}
                    <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/5 rounded-full blur-[120px]" />
                    <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-primary/5 rounded-full blur-[120px]" />

                    <div className="max-w-md w-full p-10 text-center space-y-8 glass-morphism shadow-premium rounded-3xl relative z-10 border-white/10">
                        <div className="flex justify-center">
                            <div className="rounded-2xl bg-destructive/10 p-5 animate-pulse">
                                <AlertCircle className="h-12 w-12 text-destructive" />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <h2 className="text-2xl font-bold tracking-tight">
                                Algo deu errado
                            </h2>
                            <p className="text-muted-foreground">
                                Desculpe, encontramos um erro inesperado. Por favor, tente novamente.
                            </p>
                        </div>

                        {process.env.NODE_ENV === 'development' && this.state.error && (
                            <div className="text-left">
                                <details className="text-xs">
                                    <summary className="cursor-pointer text-muted-foreground hover:text-foreground mb-2">
                                        Detalhes do erro (dev only)
                                    </summary>
                                    <pre className="bg-muted p-3 rounded-md overflow-auto max-h-40 text-destructive">
                                        {this.state.error.message}
                                        {'\n\n'}
                                        {this.state.error.stack}
                                    </pre>
                                </details>
                            </div>
                        )}

                        <div className="flex gap-3 justify-center">
                            <Button
                                onClick={this.handleReset}
                                variant="outline"
                                className="gap-2"
                            >
                                <RefreshCw className="h-4 w-4" />
                                Tentar Novamente
                            </Button>
                            <Button
                                onClick={() => window.location.href = '/'}
                                variant="default"
                            >
                                Voltar ao Início
                            </Button>
                        </div>
                    </div>
                </div>
            )
        }

        return this.props.children
    }
}

// HOC for easier usage
export function withErrorBoundary<P extends object>(
    Component: React.ComponentType<P>,
    fallback?: React.ReactNode
) {
    return function WithErrorBoundary(props: P) {
        return (
            <ErrorBoundary fallback={fallback}>
                <Component {...props} />
            </ErrorBoundary>
        )
    }
}
