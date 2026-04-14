import { cn } from "@/lib/utils"

export function H1({ className, children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
    return (
        <h1 className={cn("scroll-m-20 text-4xl font-extrabold tracking-tight lg:text-5xl", className)} {...props}>
            {children}
        </h1>
    )
}

export function H2({ className, children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
    return (
        <h2 className={cn("scroll-m-20 border-b pb-2 text-3xl font-semibold tracking-tight first:mt-0", className)} {...props}>
            {children}
        </h2>
    )
}

export function H3({ className, children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
    return (
        <h3 className={cn("scroll-m-20 text-2xl font-semibold tracking-tight", className)} {...props}>
            {children}
        </h3>
    )
}

export function P({ className, children, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
    return (
        <p className={cn("leading-7 [&:not(:first-child)]:mt-6", className)} {...props}>
            {children}
        </p>
    )
}

export function Large({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
    return (
        <div className={cn("text-lg font-semibold", className)} {...props}>
            {children}
        </div>
    )
}

export function Muted({ className, children, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
    return (
        <span className={cn("text-sm text-muted-foreground", className)} {...props}>
            {children}
        </span>
    )
}
