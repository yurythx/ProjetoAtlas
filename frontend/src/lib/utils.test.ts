import { describe, it, expect } from 'vitest'
import { cn, hexToRgb, getContrastColor, slugify } from '@/lib/utils'

describe('cn (className merge)', () => {
    it('merges classes correctly', () => {
        expect(cn('foo', 'bar')).toBe('foo bar')
    })

    it('resolves tailwind conflicts (last wins)', () => {
        expect(cn('p-2', 'p-4')).toBe('p-4')
    })

    it('handles conditional classes', () => {
        expect(cn('base', false && 'ignored', 'ok')).toBe('base ok')
    })

    it('handles undefined and null gracefully', () => {
        expect(cn('base', undefined, null, 'end')).toBe('base end')
    })
})

describe('hexToRgb', () => {
    it('converts white correctly', () => {
        expect(hexToRgb('#ffffff')).toBe('255 255 255')
    })

    it('converts black correctly', () => {
        expect(hexToRgb('#000000')).toBe('0 0 0')
    })

    it('converts a midtone color', () => {
        expect(hexToRgb('#0c4b33')).toBe('12 75 51')
    })

    it('returns null for invalid hex', () => {
        expect(hexToRgb('not-a-color')).toBeNull()
        expect(hexToRgb('#gg0000')).toBeNull()
    })

    it('works without the # prefix', () => {
        expect(hexToRgb('ff0000')).toBe('255 0 0')
    })
})

describe('getContrastColor', () => {
    it('returns white text on dark backgrounds', () => {
        expect(getContrastColor('#000000')).toBe('#FFFFFF')
        expect(getContrastColor('#0c4b33')).toBe('#FFFFFF')  // dark green
        expect(getContrastColor('#111827')).toBe('#FFFFFF')  // dark slate
    })

    it('returns black text on light backgrounds', () => {
        expect(getContrastColor('#ffffff')).toBe('#000000')
        expect(getContrastColor('#f3f4f6')).toBe('#000000')  // very light gray
    })

    it('handles midtones correctly', () => {
        // Yellow — light enough for black text
        const result = getContrastColor('#ffff00')
        expect(result).toBe('#000000')
    })
})

describe('slugify', () => {
    it('converts to lowercase', () => {
        expect(slugify('Hello World')).toBe('hello-world')
    })

    it('replaces spaces with hyphens', () => {
        expect(slugify('My Article Title')).toBe('my-article-title')
    })

    it('removes special characters (exclamation, accented chars)', () => {
        expect(slugify('Cafe Bakery!')).toBe('cafe-bakery')
    })

    it('replaces & with -and-', () => {
        expect(slugify('Rock & Roll')).toBe('rock-and-roll')
        expect(slugify('Café & Bakery!')).toBe('caf-and-bakery')
    })

    it('collapses multiple hyphens', () => {
        expect(slugify('Hello  --  World')).toBe('hello-world')
    })

    it('trims leading and trailing hyphens', () => {
        expect(slugify('  --hello-- ')).toBe('hello')
    })

    it('handles empty string', () => {
        expect(slugify('')).toBe('')
    })

    it('handles already valid slug', () => {
        expect(slugify('o-futuro-do-saas')).toBe('o-futuro-do-saas')
    })
})
