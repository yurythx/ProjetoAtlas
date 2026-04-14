/**
 * E2E Tests — Login Page (unauthenticated, .public.spec.ts)
 * Tests the login form flow and validation.
 */
import { test, expect } from '@playwright/test'

test.describe('Login Page', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/login')
        // Wait for companies to load
        await page.waitForSelector('[aria-label="Selecionar empresa"]', { timeout: 10_000 })
    })

    test('renders login form correctly', async ({ page }) => {
        await expect(page).toHaveTitle(/Atlas|Login/i)
        await expect(page.locator('[aria-label="Selecionar empresa"]')).toBeVisible()
        await expect(page.locator('[aria-label="Nome de usuário"]')).toBeVisible()
        await expect(page.locator('[aria-label="Senha"]')).toBeVisible()
        await expect(page.locator('button[type="submit"]')).toBeVisible()
    })

    test('shows validation errors when submitting empty form', async ({ page }) => {
        await page.click('button[type="submit"]')

        // Expect a toast or inline error about company or credentials
        // (the form uses toast.error for validation feedback)
        const toast = page.locator('[data-sonner-toast]')
        await expect(toast).toBeVisible({ timeout: 5_000 })
    })

    test('shows error on invalid credentials', async ({ page }) => {
        // Pick the first available company
        await page.click('[aria-label="Selecionar empresa"]')
        await page.locator('[role="option"]').first().click()

        await page.fill('[aria-label="Nome de usuário"]', 'wrong_user')
        await page.fill('[aria-label="Senha"]', 'wrong_password')
        await page.click('button[type="submit"]')

        // Should show an error alert
        const errorAlert = page.locator('[role="alert"]')
        await expect(errorAlert).toBeVisible({ timeout: 10_000 })
        await expect(errorAlert).toContainText(/incorretos|inválid|erro/i)
    })

    test('submit button shows loading state during login', async ({ page }) => {
        await page.click('[aria-label="Selecionar empresa"]')
        await page.locator('[role="option"]').first().click()

        await page.fill('[aria-label="Nome de usuário"]', 'testuser')
        await page.fill('[aria-label="Senha"]', 'password123')

        // Click and immediately check loading state
        const submitBtn = page.locator('button[type="submit"]')
        await submitBtn.click()

        // Button text should change to loading state
        await expect(page.locator('text=Autenticando')).toBeVisible({ timeout: 3_000 })
    })

    test('redirects to / after successful login', async ({ page }) => {
        const E2E_USERNAME = process.env.E2E_USERNAME || 'admin'
        const E2E_PASSWORD = process.env.E2E_PASSWORD || 'admin123'
        const E2E_COMPANY = process.env.E2E_COMPANY_SLUG || 'test-corp'

        await page.click('[aria-label="Selecionar empresa"]')
        await page.getByRole('option', { name: new RegExp(E2E_COMPANY, 'i') }).first().click()

        await page.fill('[aria-label="Nome de usuário"]', E2E_USERNAME)
        await page.fill('[aria-label="Senha"]', E2E_PASSWORD)
        await page.click('button[type="submit"]')

        // Expect redirect to dashboard
        await page.waitForURL('/', { timeout: 20_000 })
        await expect(page).not.toHaveURL('/login')
    })
})
