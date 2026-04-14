import '@testing-library/jest-dom'
import { afterAll, beforeAll, vi } from 'vitest'

// Mock localStorage
const localStorageMock = (() => {
    let store: Record<string, string> = {}
    return {
        getItem: (key: string) => store[key] ?? null,
        setItem: (key: string, value: string) => { store[key] = String(value) },
        removeItem: (key: string) => { delete store[key] },
        clear: () => { store = {} },
    }
})()

Object.defineProperty(window, 'localStorage', { value: localStorageMock })

// Mock next/navigation
vi.mock('next/navigation', () => ({
    useRouter: () => ({
        push: vi.fn(),
        replace: vi.fn(),
        prefetch: vi.fn(),
        back: vi.fn(),
    }),
    useSearchParams: () => new URLSearchParams(),
    usePathname: () => '/',
    redirect: vi.fn(),
}))

// Mock next/image — returns a plain <img> to avoid Next.js image loader requirements
vi.mock('next/image', () => ({
    default: ({ src, alt, ...props }: { src: string; alt: string;[key: string]: unknown }) =>
        Object.assign(document.createElement('img'), { src, alt, ...props }),
}))

// Suppress noisy React act() and Warning: console errors during tests
const originalError = console.error
beforeAll(() => {
    console.error = (...args: unknown[]) => {
        if (
            typeof args[0] === 'string' &&
            (args[0].includes('Warning:') || args[0].includes('act('))
        ) {
            return
        }
        originalError(...args)
    }
})

afterAll(() => {
    console.error = originalError
})
