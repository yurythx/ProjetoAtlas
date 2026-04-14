import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useDebounce } from '@/hooks/use-debounce'

describe('useDebounce', () => {
    beforeEach(() => {
        vi.useFakeTimers()
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it('returns initial value immediately', () => {
        const { result } = renderHook(() => useDebounce('initial', 500))
        expect(result.current).toBe('initial')
    })

    it('does not update value before delay has passed', () => {
        const { result, rerender } = renderHook(
            ({ value, delay }) => useDebounce(value, delay),
            { initialProps: { value: 'initial', delay: 500 } }
        )

        rerender({ value: 'updated', delay: 500 })

        // Advance by less than the delay
        act(() => { vi.advanceTimersByTime(300) })

        expect(result.current).toBe('initial')
    })

    it('updates value after delay has passed', () => {
        const { result, rerender } = renderHook(
            ({ value, delay }) => useDebounce(value, delay),
            { initialProps: { value: 'initial', delay: 500 } }
        )

        rerender({ value: 'updated', delay: 500 })

        act(() => { vi.advanceTimersByTime(500) })

        expect(result.current).toBe('updated')
    })

    it('resets debounce timer on rapid updates', () => {
        const { result, rerender } = renderHook(
            ({ value, delay }) => useDebounce(value, delay),
            { initialProps: { value: 'a', delay: 500 } }
        )

        rerender({ value: 'b', delay: 500 })
        act(() => { vi.advanceTimersByTime(200) })

        rerender({ value: 'c', delay: 500 })
        act(() => { vi.advanceTimersByTime(200) })

        // Total: 400ms — not enough for any single debounce to fire
        expect(result.current).toBe('a')

        // Now let the final debounce complete
        act(() => { vi.advanceTimersByTime(300) })
        expect(result.current).toBe('c')
    })

    it('works with typed values (numbers)', () => {
        const { result, rerender } = renderHook(
            ({ value }) => useDebounce(value, 300),
            { initialProps: { value: 0 } }
        )

        rerender({ value: 42 })
        act(() => { vi.advanceTimersByTime(300) })

        expect(result.current).toBe(42)
    })
})
