/**
 * Auth setup — runs ONCE before all authenticated tests.
 * Logs in with test credentials and saves auth state to disk.
 * All other tests reuse this state (no repeated login overhead).
 *
 * Requirements:
 *   - Local dev server running on port 3005
 *   - Backend running with a test user: E2E_USERNAME / E2E_PASSWORD / E2E_COMPANY_SLUG
 *   - Set these in a .env.test.local file or pass via environment
 */
import { test as setup, expect } from '@playwright/test'
import path from 'path'
import fs from 'fs'

const AUTH_FILE = path.join(__dirname, '.auth/user.json')

// Ensure the .auth directory exists
fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true })

const E2E_USERNAME = process.env.E2E_USERNAME || 'suporte'
const E2E_PASSWORD = process.env.E2E_PASSWORD || 'suporte123'
const E2E_COMPANY_SLUG = process.env.E2E_COMPANY_SLUG || 'raiz'
const E2E_API_URL = process.env.E2E_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8005'


setup.setTimeout(120_000)

setup('authenticate', async ({ page, request }) => {
    const tokenRes = await request.post(`${E2E_API_URL}/api/accounts/token/`, {
        headers: { 'X-Company-Slug': E2E_COMPANY_SLUG },
        data: { username: E2E_USERNAME, password: E2E_PASSWORD },
    })
    expect(tokenRes.ok()).toBeTruthy()
    const tokenBody = (await tokenRes.json()) as { access: string; refresh: string }

    await page.goto('/login', { waitUntil: 'domcontentloaded', timeout: 90_000 })

    await page.evaluate(
        ({ access, refresh, companySlug }) => {
            localStorage.setItem('accessToken', access)
            localStorage.setItem('refreshToken', refresh)
            localStorage.setItem('companySlug', companySlug)
            document.cookie = `hasSession=true; path=/; SameSite=Lax; max-age=${60 * 60 * 24 * 7}`
        },
        { access: tokenBody.access, refresh: tokenBody.refresh, companySlug: E2E_COMPANY_SLUG }
    )

    await expect
        .poll(() => page.evaluate(() => localStorage.getItem('companySlug')))
        .toBe(E2E_COMPANY_SLUG)

    const meStatus = await page.evaluate(
        async ({ apiUrl, access, companySlug }) => {
            const res = await fetch(`${apiUrl}/api/accounts/users/me/`, {
                headers: {
                    Authorization: `Bearer ${access}`,
                    'X-Company-Slug': companySlug,
                },
            })
            return res.status
        },
        { apiUrl: E2E_API_URL, access: tokenBody.access, companySlug: E2E_COMPANY_SLUG }
    )
    expect(meStatus).toBe(200)

    await page.goto('/dashboard', { waitUntil: 'domcontentloaded', timeout: 90_000 })

    await page.evaluate((companySlug) => localStorage.setItem('companySlug', companySlug), E2E_COMPANY_SLUG)

    await page.context().storageState({ path: AUTH_FILE })
})
