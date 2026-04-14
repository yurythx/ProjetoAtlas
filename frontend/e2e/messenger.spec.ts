import { test, expect } from '@playwright/test';

test.describe('Messenger - Fluxo de Chat', () => {
    // Reutiliza o estado de autenticação salvo no setup
    test.use({ storageState: 'e2e/.auth/user.json' });

    test.beforeEach(async ({ page }) => {
        await page.goto('/messenger');
        // Aguarda carregar as conversas
        await page.waitForSelector('h2:has-text("Mensagens")');
    });

    test('deve permitir selecionar um contato e enviar uma mensagem', async ({ page }) => {
        // 1. Seleciona o primeiro contato da lista (que não seja o grupo)
        const contactItem = page.locator('[role="button"]').filter({ hasText: /@/ }).first();
        await contactItem.click();

        // 2. Aguarda a janela de chat abrir
        await expect(page.getByPlaceholder(/Escreva uma mensagem/i)).toBeVisible();

        // 3. Envia uma mensagem de teste
        const testMessage = `E2E Test Message - ${Date.now()}`;
        await page.fill('[aria-label="Campo de mensagem"]', testMessage);
        await page.click('[aria-label="Enviar mensagem"]');

        // 4. Verifica se a mensagem aparece no log
        await expect(page.locator(`text=${testMessage}`)).toBeVisible();
    });

    test('deve permitir excluir uma mensagem (soft delete)', async ({ page }) => {
        // 1. Seleciona um contato
        await page.locator('[role="button"]').filter({ hasText: /@/ }).first().click();

        // 2. Envia uma mensagem para deletar
        const deleteMsg = `Mensagem para deletar - ${Date.now()}`;
        await page.fill('[aria-label="Campo de mensagem"]', deleteMsg);
        await page.click('[aria-label="Enviar mensagem"]');

        const msgLocator = page.locator(`div:has-text("${deleteMsg}")`).last();
        await expect(msgLocator).toBeVisible();

        // 3. Abre o menu da mensagem
        // O botão de menu aparece no hover do elemento group
        await msgLocator.hover();
        const menuBtn = page.locator('[aria-label="Abrir menu da mensagem"]').last();
        await menuBtn.click();

        // 4. Clica em Excluir
        await page.click('text=Excluir');

        // 5. Verifica se o placeholder de mensagem excluída aparece
        await expect(page.locator('text=Mensagem excluída').last()).toBeVisible();
        await expect(page.locator(`text=${deleteMsg}`)).not.toBeVisible();
    });

    test('deve permitir fixar e silenciar uma conversa', async ({ page }) => {
        const contactItem = page.locator('[role="button"]').filter({ hasText: /@/ }).first();

        // 1. Fixar conversa via hover no sidebar
        await contactItem.hover();
        const pinBtn = contactItem.locator('[aria-label="Fixar"]');
        await pinBtn.click();

        // Verifica se o ícone de pin aparece no título
        await expect(contactItem.locator('.lucide-pin')).toBeVisible();

        // 2. Silenciar conversa
        const muteBtn = contactItem.locator('[aria-label="Silenciar"]');
        await muteBtn.click();

        // Verifica se o ícone de silenciado aparece
        await expect(contactItem.locator('.lucide-bell-off')).toBeVisible();
    });
});
