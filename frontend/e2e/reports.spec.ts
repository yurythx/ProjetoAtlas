/**
 * E2E Tests — Reports Export Modal
 *
 * Tests the full export flow: open modal → select format → trigger task →
 * verify pending state appears.  The actual file download (done state) is not
 * asserted here because it requires a live Celery worker; instead we verify
 * that the API POST succeeds and the UI enters "processing" correctly.
 *
 * Covered scenarios:
 *  - Articles page: "Exportar" button opens the modal
 *  - Modal shows the correct report label
 *  - CSV/PDF radio toggle works
 *  - "Gerar relatório" POST reaches the backend and returns 202
 *  - UI transitions to the processing spinner
 *  - Finance page: "Exportar CSV" button opens the modal
 *  - Closing the modal resets state
 */
import { test, expect, loginByApi } from './fixtures'
import type { Response } from '@playwright/test'

test.describe.configure({ timeout: 120_000 })

test.describe('Reports — Articles Export', () => {
  let auth: Awaited<ReturnType<typeof loginByApi>>

  test.beforeEach(async ({ page, request }) => {
    auth = await loginByApi(page, request)
    await page.goto('/artigos', { waitUntil: 'domcontentloaded', timeout: 90_000 })
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 30_000 })
  })

  test('Exportar button is visible on articles page', async ({ page }) => {
    const exportBtn = page.getByRole('button', { name: /exportar/i })
    await expect(exportBtn).toBeVisible({ timeout: 15_000 })
  })

  test('clicking Exportar opens the export modal', async ({ page }) => {
    await page.getByRole('button', { name: /exportar/i }).click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible({ timeout: 10_000 })
    await expect(dialog.getByText(/Base de Conhecimento/i)).toBeVisible()
  })

  test('modal has CSV and PDF format options', async ({ page }) => {
    await page.getByRole('button', { name: /exportar/i }).click()

    const dialog = page.getByRole('dialog')
    await expect(dialog.getByLabel('CSV')).toBeVisible({ timeout: 5_000 })
    await expect(dialog.getByLabel('PDF')).toBeVisible({ timeout: 5_000 })
  })

  test('can switch to PDF format', async ({ page }) => {
    await page.getByRole('button', { name: /exportar/i }).click()

    const dialog = page.getByRole('dialog')
    const pdfRadio = dialog.getByLabel('PDF')
    await pdfRadio.click()
    await expect(pdfRadio).toBeChecked()
  })

  test('Gerar relatório posts to export endpoint and shows processing state', async ({ page }) => {
    await page.getByRole('button', { name: /exportar/i }).click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible({ timeout: 10_000 })

    // Intercept the export POST
    const exportRequest = page.waitForResponse(
      (res: Response) =>
        res.url().includes('/api/reports/articles/export/') &&
        res.request().method() === 'POST',
      { timeout: 20_000 },
    )

    await dialog.getByRole('button', { name: /gerar relatório/i }).click()

    const exportRes = await exportRequest
    expect(exportRes.status()).toBe(202)

    const body = await exportRes.json() as { task_id?: string }
    expect(body.task_id).toBeTruthy()

    // UI should enter processing state
    await expect(
      page.getByText(/gerando arquivo|iniciando exportação/i),
    ).toBeVisible({ timeout: 10_000 })
  })

  test('closing the modal while processing resets state', async ({ page }) => {
    await page.getByRole('button', { name: /exportar/i }).click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible({ timeout: 10_000 })

    await dialog.getByRole('button', { name: /gerar relatório/i }).click()

    // Wait briefly for processing state to appear
    await page.waitForTimeout(800)

    // Close via Escape
    await page.keyboard.press('Escape')
    await expect(dialog).not.toBeVisible({ timeout: 5_000 })

    // Re-open — should be back in idle state
    await page.getByRole('button', { name: /exportar/i }).click()
    await expect(dialog.getByRole('button', { name: /gerar relatório/i })).toBeVisible({ timeout: 5_000 })
  })
})

test.describe('Reports — Finance Export', () => {
  let auth: Awaited<ReturnType<typeof loginByApi>>

  test.beforeEach(async ({ page, request }) => {
    auth = await loginByApi(page, request)
    await page.goto('/financeiro', { waitUntil: 'domcontentloaded', timeout: 90_000 })
    await expect(page.locator('main')).toBeVisible({ timeout: 30_000 })
  })

  test('finance page loads without error', async ({ page }) => {
    // Should not show a generic error page
    await expect(page.locator('text=/erro interno|500/i')).toHaveCount(0)
  })

  test('Exportar CSV button opens the finance export modal', async ({ page }) => {
    const exportBtn = page.getByRole('button', { name: /exportar csv/i })

    // Button may not be visible if finance module is disabled for the test tenant
    const isVisible = await exportBtn.isVisible({ timeout: 10_000 }).catch(() => false)
    if (!isVisible) {
      test.skip(true, 'Finance module not enabled for this tenant — skipping export modal test.')
      return
    }

    await exportBtn.click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible({ timeout: 10_000 })
    await expect(dialog.getByText(/Relatório Financeiro/i)).toBeVisible()
  })

  test('finance export POST returns 202', async ({ page }) => {
    const exportBtn = page.getByRole('button', { name: /exportar csv/i })
    const isVisible = await exportBtn.isVisible({ timeout: 10_000 }).catch(() => false)
    if (!isVisible) {
      test.skip(true, 'Finance module not enabled for this tenant.')
      return
    }

    await exportBtn.click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible({ timeout: 10_000 })

    const exportRequest = page.waitForResponse(
      (res: Response) =>
        res.url().includes('/api/reports/finance/export/') &&
        res.request().method() === 'POST',
      { timeout: 20_000 },
    )

    await dialog.getByRole('button', { name: /gerar relatório/i }).click()
    const exportRes = await exportRequest
    expect(exportRes.status()).toBe(202)
  })
})

test.describe('Reports — Task Status Polling', () => {
  let auth: Awaited<ReturnType<typeof loginByApi>>

  test.beforeEach(async ({ page, request }) => {
    auth = await loginByApi(page, request)
  })

  test('task status endpoint returns expected shape', async ({ request }) => {
    // POST to create a CRM report task via API
    const res = await request.post(
      `${auth.apiUrl}/api/reports/crm/deals/export/`,
      {
        headers: { ...auth.headers, 'Content-Type': 'application/json' },
        data: { format: 'csv' },
      },
    )
    expect(res.ok()).toBeTruthy()
    const body = await res.json() as { task_id: string }
    expect(body.task_id).toBeTruthy()

    // Poll status — should be "processing" or "done", never missing
    const statusRes = await request.get(
      `${auth.apiUrl}/api/reports/tasks/${body.task_id}/`,
      { headers: auth.headers },
    )
    expect(statusRes.ok()).toBeTruthy()
    const statusBody = await statusRes.json() as { status: string }
    expect(['processing', 'done', 'error']).toContain(statusBody.status)
  })

  test('task status for unknown id returns 404', async ({ request }) => {
    const statusRes = await request.get(
      `${auth.apiUrl}/api/reports/tasks/nonexistent-task-id-xyz/`,
      { headers: auth.headers },
    )
    expect(statusRes.status()).toBe(404)
  })
})
