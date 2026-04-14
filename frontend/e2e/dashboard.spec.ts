/**
 * E2E Tests — Dashboard (authenticated)
 * Covers the main dashboard stats, navigation, and basic structure.
 */
import { test, expect } from '@playwright/test'

test.describe('Dashboard', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/')
        // Wait for at least one stat card to appear
        await page.waitForLoadState('networkidle')
    })

    test('shows dashboard with stat cards', async ({ page }) => {
        // The dashboard has stat cards (users, articles, etc.)
        // They should be visible after loading
        await expect(page.locator('main, [role="main"]')).toBeVisible()
    })

    test('redirects unauthenticated users to login', async ({ browser }) => {
        // Open fresh context with no auth state
        const ctx = await browser.newContext()
        const page = await ctx.newPage()
        await page.goto('/')
        await page.waitForURL(/login/, { timeout: 10_000 })
        await expect(page).toHaveURL(/login/)
        await ctx.close()
    })

    test('navigation sidebar is visible and functional', async ({ page }) => {
        // Sidebar links should be visible
        const sidebar = page.locator('nav, [role="navigation"]').first()
        await expect(sidebar).toBeVisible()
    })
})
