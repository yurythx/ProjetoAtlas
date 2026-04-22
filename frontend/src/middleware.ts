import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * Rotas que são explicitamente PÚBLICAS.
 * Qualquer outra rota será tratada como protegida.
 */
const PUBLIC_PATHS = [
    '/',
    '/login',
    '/register',
    '/forgot-password',
    '/reset-password',
    '/accept-invite',
    '/servicos',
    '/404',
    '/500',
]

const PUBLIC_PREFIXES = [
    '/p/',      // Portal Público
    '/api/',    // API Routes (handled by backend or specific logic)
]

function isProtected(pathname: string): boolean {
    // Se for um caminho público exato
    if (PUBLIC_PATHS.includes(pathname)) return false
    
    // Se começar com um prefixo público
    if (PUBLIC_PREFIXES.some(prefix => pathname.startsWith(prefix))) return false
    
    // Por padrão, rotas são protegidas
    return true
}

/**
 * Middleware para controlar acesso server-side baseado em cookies.
 */
export function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl
    const hasSession = request.cookies.get('hasSession')?.value === 'true'
    const debug = process.env.NODE_ENV !== 'production'

    if (pathname === "/@vite/client" || pathname.startsWith("/@vite/")) {
        return new NextResponse("", { status: 200, headers: { "content-type": "application/javascript" } })
    }

    // LOG PARA DEBUG (visível no terminal do dev server)
    if (debug) {
        console.log(`[Middleware] ${request.method} ${pathname} | hasSession: ${hasSession}`)
    }

    // ── Redirecionar se já estiver logado e tentar acessar fluxos de auth ────────
    const AUTH_FLOW_PATHS = ['/login', '/register', '/forgot-password', '/reset-password']
    if (AUTH_FLOW_PATHS.includes(pathname) && hasSession) {
        if (debug) {
            console.log(`[Middleware] ALREADY LOGGED IN ${pathname} -> /dashboard`)
        }
        return NextResponse.redirect(new URL('/dashboard', request.url))
    }

    // ── Bloqueio de rotas protegidas sem sessão ──────────────────────────────
    if (isProtected(pathname) && !hasSession) {
        if (debug) {
            console.log(`[Middleware] REDIRECT protected ${pathname} -> /login`)
        }
        const loginUrl = new URL('/login', request.url)
        loginUrl.searchParams.set('next', pathname)
        return NextResponse.redirect(loginUrl)
    }

    return NextResponse.next()
}

export const config = {
    matcher: [
        /*
         * Aplica o middleware a todas as rotas EXCETO:
         * - _next/static, _next/image, favicon.ico, sw.js, arquivos com extensão
         */
        '/((?!_next/static|_next/image|favicon.ico|sw.js|.*\\..*).*)',
    ],
}
