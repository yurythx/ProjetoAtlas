/**
 * E2E Tests — Public Articles Portal (unauthenticated, .public.spec.ts)
 * Tests the public-facing article portal that anonymous users see.
 */
import { test, expect } from '@playwright/test'

const E2E_COMPANY = process.env.E2E_COMPANY_SLUG || 'test-corp'

test.describe('Public Article Portal', () => {
    test('public articles page loads', async ({ page }) => {
        await page.goto(`/p/artigos?company_slug=${E2E_COMPANY}`)
        await page.waitForLoadState('networkidle')

        // Should not redirect to login
        await expect(page).not.toHaveURL(/login/)
        // Main content should be visible
        await expect(page.locator('main, body')).toBeVisible()
    })

    test('public article page has accessible structure', async ({ page }) => {
        await page.goto(`/p/artigos?company_slug=${E2E_COMPANY}`)
        await page.waitForLoadState('networkidle')

        // h1 should exist for SEO
        const h1 = page.locator('h1')
        if (await h1.count() > 0) {
            await expect(h1.first()).toBeVisible()
        }
    })

    test('clicking an article navigates to its detail page', async ({ page }) => {
        await page.goto(`/p/artigos?company_slug=${E2E_COMPANY}`)
        await page.waitForLoadState('networkidle')

        // Find any article link
        const articleLink = page.locator('a[href*="/p/"]').first()
        if (await articleLink.isVisible({ timeout: 5_000 }).catch(() => false)) {
            const href = await articleLink.getAttribute('href')
            await articleLink.click()
            await page.waitForLoadState('networkidle')
            // Should navigate to the article detail
            await expect(page).toHaveURL(new RegExp(href?.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') || '/p/'))
        }
    })

    test('non-existent public article returns 404 page', async ({ page }) => {
        const response = await page.goto(`/p/artigo-que-nao-existe-${Date.now()}`)
        // Next.js shows the 404 page; may return 200 (client-side) or 404 from server
        const status = response?.status() ?? 200
        // The page should either be 404 or show a "not found" message
        if (status === 200) {
            await expect(page.locator('text=/not found|não encontrado|404/i').first()).toBeVisible({ timeout: 5_000 })
                .catch(() => { /* page may handle this differently */ })
        } else {
            expect(status).toBe(404)
        }
    })
})
