import { test, expect } from '@playwright/test'

test.describe('Usuários - CRUD (authenticated)', () => {
  test('cria, edita e remove um usuário', async ({ page }) => {
    const ts = Date.now()
    const username = `e2e_user_${ts}`
    const email = `e2e_${ts}@test.local`

    await page.goto('/admin/users?create=1')
    await page.waitForLoadState('networkidle')

    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText('Novo Membro da Equipe')).toBeVisible({ timeout: 15_000 })

    await dialog.locator('input[placeholder="John"]').fill('E2E')
    await dialog.locator('input[placeholder="Doe"]').fill('Tester')
    await dialog.locator('input[placeholder="john.doe"]').fill(username)
    await dialog.locator('input[placeholder="john@example.com"]').fill(email)
    await dialog.locator('input[placeholder="Defina uma senha segura"]').fill('newpassword123')

    const companyTrigger = dialog.getByText('Selecione a empresa...').first()
    if (await companyTrigger.isVisible().catch(() => false)) {
      await companyTrigger.click()
      await page.getByRole('option').first().click()
    }

    await dialog.getByText('Selecione um papel...').click()
    await page.getByRole('option').first().click()

    const createResp = page.waitForResponse(
      (r) => r.request().method() === 'POST' && r.url().includes('/api/accounts/users/') && r.status() === 201,
      { timeout: 15_000 }
    )
    await dialog.getByRole('button', { name: 'Adicionar Membro' }).click()
    await createResp

    await expect(dialog.getByText('Novo Membro da Equipe')).not.toBeVisible({ timeout: 15_000 })
    await expect(page.getByText(`@${username}`, { exact: true })).toBeVisible({ timeout: 15_000 })

    const userRow = page.locator('tr').filter({ hasText: `@${username}` }).first()
    await expect(userRow).toBeVisible()
    await userRow.getByRole('button', { name: 'Ações do usuário' }).click()
    await page.getByRole('menuitem', { name: 'Editar' }).click()

    const editDialog = page.getByRole('dialog')
    await expect(editDialog.getByText('Editar Membro')).toBeVisible({ timeout: 10_000 })
    await editDialog.locator('input[placeholder="John"]').fill('E2E Updated')

    const patchResp = page.waitForResponse(
      (r) => r.request().method() === 'PATCH' && r.url().includes('/api/accounts/users/') && r.status() === 200,
      { timeout: 15_000 }
    )
    await editDialog.getByRole('button', { name: 'Salvar Alterações' }).click()
    await patchResp
    await expect(editDialog.getByText('Editar Membro')).not.toBeVisible({ timeout: 15_000 })

    await expect(page.locator('tr').filter({ hasText: `@${username}` }).filter({ hasText: 'E2E Updated' })).toBeVisible({
      timeout: 15_000,
    })

    page.on('dialog', (d) => d.accept())
    const userRow2 = page.locator('tr').filter({ hasText: `@${username}` }).first()
    await userRow2.getByRole('button', { name: 'Ações do usuário' }).click()
    const deleteResp = page.waitForResponse(
      (r) => r.request().method() === 'DELETE' && r.url().includes('/api/accounts/users/') && r.status() === 204,
      { timeout: 15_000 }
    )
    await page.getByRole('menuitem', { name: 'Remover' }).click()
    await deleteResp

    await expect(page.locator('tr').filter({ hasText: `@${username}` })).toHaveCount(0, { timeout: 15_000 })
  })
})
