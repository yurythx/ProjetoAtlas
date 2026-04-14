import { test, expect, loginByApi } from './fixtures';
import type { APIRequestContext, Page, Response } from '@playwright/test';

test.describe.configure({ timeout: 120_000 });

function normalizeList<T>(data: T[] | { results?: T[] }) {
  return Array.isArray(data) ? data : data.results ?? [];
}

async function fetchUsers(request: APIRequestContext, auth: Awaited<ReturnType<typeof loginByApi>>) {
  const usersRes = await request.get(`${auth.apiUrl}/api/accounts/users/`, { headers: auth.headers });
  expect(usersRes.ok()).toBeTruthy();
  return normalizeList(await usersRes.json()) as Array<{ id: number; username: string; first_name?: string; last_name?: string }>;
}

async function fetchPipelines(request: APIRequestContext, auth: Awaited<ReturnType<typeof loginByApi>>) {
  const pipelinesRes = await request.get(`${auth.apiUrl}/api/crm/pipelines/`, { headers: auth.headers });
  expect(pipelinesRes.ok()).toBeTruthy();
  return normalizeList(await pipelinesRes.json()) as Array<{
    id: number;
    name: string;
    stages: Array<{ id: number; name: string }>;
    columns: Array<{ id: number; title: string; legacy_stage?: number | null }>;
  }>;
}

async function fetchContacts(request: APIRequestContext, auth: Awaited<ReturnType<typeof loginByApi>>) {
  const contactsRes = await request.get(`${auth.apiUrl}/api/crm/contacts/`, { headers: auth.headers });
  expect(contactsRes.ok()).toBeTruthy();
  return normalizeList(await contactsRes.json()) as Array<{ id: number; name: string }>;
}

async function fetchDeals(request: APIRequestContext, auth: Awaited<ReturnType<typeof loginByApi>>) {
  const dealsRes = await request.get(`${auth.apiUrl}/api/crm/deals/?omit_legacy_stage_fields=1`, { headers: auth.headers });
  expect(dealsRes.ok()).toBeTruthy();
  return normalizeList(await dealsRes.json()) as Array<{
    id: number;
    title: string;
    column?: number | null;
    column_id?: number | null;
    priority: string;
    description?: string;
    custom_fields?: Record<string, unknown>;
  }>;
}

async function fetchDealDetail(request: APIRequestContext, auth: Awaited<ReturnType<typeof loginByApi>>, dealId: number) {
  const dealRes = await request.get(`${auth.apiUrl}/api/crm/deals/${dealId}/?omit_legacy_stage_fields=1`, { headers: auth.headers });
  expect(dealRes.ok()).toBeTruthy();
  return await dealRes.json();
}

async function openCRM(page: Page, pipelineId: number) {
  await page.goto(`/crm?pipeline=${pipelineId}`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await expect(page.getByRole('heading', { level: 1, name: 'CRM & Atendimento' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Novo Card' })).toBeVisible({ timeout: 30_000 });
}

async function createDeal(page: Page, dealTitle: string) {
  await page.getByRole('button', { name: 'Novo Card' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  await expect(dialog.getByRole('heading', { name: 'Novo Card no CRM' })).toBeVisible({ timeout: 15_000 });

  await dialog.locator('input[name="title"]').fill(dealTitle);

  const comboBoxes = dialog.locator('button[role="combobox"]');
  await comboBoxes.nth(0).click();
  await page.locator('[role="option"]').first().click();

  await comboBoxes.nth(1).click();
  await page.getByRole('option', { name: 'Média' }).click();

  await comboBoxes.nth(2).click();
  const novoOption = page.getByRole('option', { name: /^Novo$/ });
  if (await novoOption.count()) {
    await novoOption.first().click();
  } else {
    await page.locator('[role="option"]').first().click();
  }

  const createRequest = page.waitForResponse(
    (response: Response) =>
      response.url().includes('/api/crm/deals/?omit_legacy_stage_fields=1') &&
      response.request().method() === 'POST' &&
      response.ok(),
    { timeout: 20_000 }
  );

  await dialog.getByRole('button', { name: 'Salvar Card' }).click();
  const createResponse = await createRequest;
  const createdDeal = await createResponse.json();
  await expect(page.locator('[data-sonner-toast]')).toBeVisible({ timeout: 15_000 });
  await expect(dialog).not.toBeVisible({ timeout: 15_000 });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { level: 1, name: 'CRM & Atendimento' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Novo Card' })).toBeVisible({ timeout: 30_000 });
  return createdDeal;
}

test.describe('CRM E2E Flow', () => {
  let auth: Awaited<ReturnType<typeof loginByApi>>;
  let pipelineId: number;
  let canDealEdit: boolean;

  test.beforeEach(async ({ page, request }) => {
    auth = await loginByApi(page, request);

    const meRes = await request.get(`${auth.apiUrl}/api/accounts/users/me/`, { headers: auth.headers });
    expect(meRes.ok()).toBeTruthy();
    const me = (await meRes.json()) as { is_superuser?: boolean; role_details?: { permissions?: string[] } };
    const perms = Array.isArray(me.role_details?.permissions) ? me.role_details?.permissions : [];
    canDealEdit = Boolean(me.is_superuser) || perms.includes('*') || perms.includes('crm.deal_edit');

    const pipelinesRes = await request.get(`${auth.apiUrl}/api/crm/pipelines/`, { headers: auth.headers });
    expect(pipelinesRes.ok()).toBeTruthy();
    const pipelines = normalizeList<{ id: number }>(await pipelinesRes.json());

    pipelineId = pipelines[0]?.id;
    if (!pipelineId) {
      const createPipelineRes = await request.post(`${auth.apiUrl}/api/crm/pipelines/`, {
        headers: auth.headers,
        data: { name: 'Pipeline E2E', description: 'Pipeline criado automaticamente para testes' },
      });
      expect(createPipelineRes.ok()).toBeTruthy();
      pipelineId = (await createPipelineRes.json()).id;
    }

    const contactsRes = await request.get(`${auth.apiUrl}/api/crm/contacts/`, { headers: auth.headers });
    expect(contactsRes.ok()).toBeTruthy();
    const contacts = normalizeList(await contactsRes.json());

    if (contacts.length === 0) {
      const createContactRes = await request.post(`${auth.apiUrl}/api/crm/contacts/`, {
        headers: auth.headers,
        data: {
          name: 'Contato E2E',
          email: `contato-e2e-${Date.now()}@example.com`,
          phone: '11999999999',
          company_name: 'Empresa E2E',
        },
      });
      expect(createContactRes.ok()).toBeTruthy();
    }
  });
  
  test('deve criar um novo Deal no Kanban', async ({ page, request }) => {
    test.skip(!canDealEdit, 'Usuário E2E não possui permissão crm.deal_edit para criar cards.');
    const dealTitle = `Test Deal ${Date.now()}`;
    await openCRM(page, pipelineId);
    const createdDeal = await createDeal(page, dealTitle);
    expect(createdDeal?.title).toBe(dealTitle);

    await expect(async () => {
      const savedDeal = await fetchDealDetail(request, auth, createdDeal.id);
      expect(savedDeal?.title).toBe(dealTitle);
    }).toPass({ timeout: 20_000 });
  });

  test('deve abrir um card pela visualização em tabela', async ({ page, request }) => {
    test.skip(!canDealEdit, 'Usuário E2E não possui permissão crm.deal_edit para criar cards.');
    const pipelines = await fetchPipelines(request, auth);
    const contacts = await fetchContacts(request, auth);
    const activePipeline = pipelines[0];
    const safeColumn =
      activePipeline?.columns?.find((column) => column.title === 'Novo') ??
      activePipeline?.columns?.find((column) => column.title === 'Em Andamento') ??
      activePipeline?.columns?.[0];
    expect(activePipeline).toBeTruthy();
    expect(safeColumn).toBeTruthy();
    expect(contacts.length).toBeGreaterThan(0);

    const createDealRes = await request.post(`${auth.apiUrl}/api/crm/deals/`, {
      headers: auth.headers,
      data: {
        title: `Tabela Deal ${Date.now()}`,
        contact: contacts[0].id,
        column: safeColumn?.id,
        priority: 'MEDIUM',
      },
    });
    expect(createDealRes.ok()).toBeTruthy();
    const createdDeal = await createDealRes.json();

    await openCRM(page, pipelineId);
    await page.getByRole('tab', { name: 'Tabela' }).click();
    const searchbox = page.getByPlaceholder('Buscar por título...');
    await expect(searchbox).toBeVisible({ timeout: 30_000 });
    await searchbox.fill(createdDeal.title);

    const row = page.getByLabel(`Abrir card ${createdDeal.title}`).first();
    await expect(row).toBeVisible({ timeout: 20_000 });
    await row.focus();
    await row.press('Enter');

    await expect(page.getByRole('heading', { name: createdDeal.title })).toBeVisible({ timeout: 15_000 });
  });

  test('deve mover um Deal de coluna (Drag and Drop)', async ({ page, request }) => {
    test.skip(!canDealEdit, 'Usuário E2E não possui permissão crm.deal_edit para criar/mover cards.');
    await openCRM(page, pipelineId);

    const firstCard = page.locator('.glass-card').first();
    if ((await firstCard.count()) === 0) {
      await createDeal(page, `Drag Deal ${Date.now()}`);
    }

    await expect(page.locator('.glass-card').first()).toBeVisible({ timeout: 20_000 });
    const currentFirstCard = page.locator('.glass-card').first();

    const cardTitle = await currentFirstCard.locator('h4').first().innerText();
    const dealsBefore = await fetchDeals(request, auth);
    const dealBefore = dealsBefore.find((deal) => deal.title === cardTitle);
    expect(dealBefore).toBeTruthy();
    const currentColumnId = dealBefore?.column_id || dealBefore?.column;
    await currentFirstCard.click();
    await expect(page.getByRole('heading', { name: cardTitle })).toBeVisible({ timeout: 15_000 });

    const primarySection = page.locator('section').filter({ hasText: 'Campos principais' });
    await primarySection.locator('button[role="combobox"]').first().click();
    const options = page.locator('[role="option"]:not([data-disabled]):not([aria-disabled="true"])');
    await expect(options.first()).toBeVisible({ timeout: 15_000 });
    await options.first().click();

    await page.getByRole('button', { name: 'Salvar alterações' }).click();

    await expect(async () => {
      const dealsAfter = await fetchDeals(request, auth);
      const updated = dealsAfter.find((deal) => deal.id === dealBefore?.id);
      expect(updated).toBeTruthy();
      const nextColumnId = updated?.column_id || updated?.column;
      expect(nextColumnId).toBeTruthy();
      expect(nextColumnId).not.toBe(currentColumnId);
    }).toPass({ timeout: 45_000 });
  });

  test('deve editar um card com prioridade, usuários relacionados e descrição', async ({ page, request }) => {
    test.skip(!canDealEdit, 'Usuário E2E não possui permissão crm.deal_edit para editar cards.');
    await openCRM(page, pipelineId);

    const users = await fetchUsers(request, auth);
    expect(users.length).toBeGreaterThan(0);
    const relatedUser = users[0];
    const relatedUserName = `${relatedUser.first_name ?? ''} ${relatedUser.last_name ?? ''}`.trim() || relatedUser.username;

    const firstCard = page.locator('.glass-card').first();
    if ((await firstCard.count()) === 0) {
      await createDeal(page, `Editable Deal ${Date.now()}`);
    }

    await expect(page.locator('.glass-card').first()).toBeVisible({ timeout: 20_000 });
    const currentFirstCard = page.locator('.glass-card').first();
    const cardTitle = await currentFirstCard.locator('h4').first().innerText();
    const dealsBefore = await fetchDeals(request, auth);
    const dealBefore = dealsBefore.find((deal) => deal.title === cardTitle);
    expect(dealBefore).toBeTruthy();

    await currentFirstCard.click();
    await expect(page.getByRole('heading', { name: cardTitle })).toBeVisible({ timeout: 15_000 });

    const primarySection = page.locator('section').filter({ hasText: 'Campos principais' });
    await primarySection.locator('button[role="combobox"]').nth(1).click();
    await page.getByRole('option', { name: 'Alta' }).click();

    const description = `Descrição editada no E2E ${Date.now()}`;
    await page.getByPlaceholder('Descreva o andamento, bloqueios, próximos passos e contexto do card...').fill(description);

    const userRow = page.locator('label').filter({ hasText: relatedUserName }).first();
    await userRow.locator('button[role="checkbox"]').click();

    await page.getByRole('button', { name: 'Salvar alterações' }).click();

    await expect(async () => {
      const updated = await fetchDealDetail(request, auth, dealBefore!.id);
      expect(updated.priority).toBe('HIGH');
      expect(updated.description).toBe(description);
      const related = updated.custom_fields?.related_user_ids ?? [];
      expect(Array.isArray(related)).toBeTruthy();
      expect(related.map((v: unknown) => Number(v))).toContain(relatedUser.id);
    }).toPass({ timeout: 45_000 });
  });

  test('deve manter o card em Concluído após mover de Em Andamento', async ({ page, request }) => {
    test.skip(!canDealEdit, 'Usuário E2E não possui permissão crm.deal_edit para criar/mover cards.');
    const pipelines = await fetchPipelines(request, auth);
    const activePipeline = pipelines[0];
    expect(activePipeline).toBeTruthy();

    const inProgressColumn = activePipeline?.columns.find((column) => column.title === 'Em Andamento');
    const doneColumn = activePipeline?.columns.find((column) => column.title === 'Concluído');
    const contacts = await fetchContacts(request, auth);
    expect(inProgressColumn).toBeTruthy();
    expect(doneColumn).toBeTruthy();
    expect(contacts.length).toBeGreaterThan(0);

    const createDealRes = await request.post(`${auth.apiUrl}/api/crm/deals/`, {
      headers: auth.headers,
      data: {
        title: `Concluir Deal ${Date.now()}`,
        contact: contacts[0].id,
        column: inProgressColumn?.id,
        priority: 'MEDIUM',
      },
    });
    expect(createDealRes.ok()).toBeTruthy();
    const createdDeal = await createDealRes.json();

    const updateDealRes = await request.patch(`${auth.apiUrl}/api/crm/deals/${createdDeal.id}/`, {
      headers: auth.headers,
      data: { column: doneColumn?.id },
    });
    expect(updateDealRes.ok()).toBeTruthy();
    const updatedDeal = await updateDealRes.json();
    expect(updatedDeal.column_id || updatedDeal.column).toBe(doneColumn?.id);

    await expect(async () => {
      const dealAfter = await fetchDealDetail(request, auth, createdDeal.id);
      expect(dealAfter?.column_id || dealAfter?.column).toBe(doneColumn?.id);
    }).toPass({ timeout: 20_000 });
  });

  test('deve permitir criar nova Pipeline na página inicial do CRM (Visão Geral)', async ({ page, request }) => {
    const meRes = await request.get(`${auth.apiUrl}/api/accounts/users/me/`, { headers: auth.headers });
    expect(meRes.ok()).toBeTruthy();
    const me = (await meRes.json()) as { is_superuser?: boolean; role_details?: { permissions?: string[] } };
    const perms = Array.isArray(me.role_details?.permissions) ? me.role_details?.permissions : [];
    const canManage = Boolean(me.is_superuser) || perms.includes('*') || perms.includes('crm.pipeline_manage');
    test.skip(!canManage, 'Usuário E2E não possui permissão crm.pipeline_manage para criar pipelines via UI.')

    await page.goto('/crm', { waitUntil: 'domcontentloaded', timeout: 90_000 })
    await expect(page.getByRole('heading', { level: 1, name: 'Pipelines (Visão Geral)' })).toBeVisible({ timeout: 30_000 })

    const newPipelineName = `Pipeline UI ${Date.now()}`

    await page.getByRole('button', { name: 'Nova Pipeline' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible({ timeout: 15_000 })
    await expect(dialog.getByRole('heading', { name: 'Gerenciar Pipelines' })).toBeVisible({ timeout: 15_000 })
    await dialog.getByPlaceholder('Ex: Suporte TI').fill(newPipelineName)

    const createRequest = page.waitForResponse(
      (response: Response) =>
        response.url().includes('/api/crm/pipelines/') &&
        response.request().method() === 'POST' &&
        response.ok(),
      { timeout: 30_000 }
    )

    await dialog.getByRole('button', { name: 'Criar pipeline' }).click()
    await createRequest
    await page.keyboard.press('Escape')
    await expect(dialog).not.toBeVisible({ timeout: 30_000 })

    await expect(async () => {
      const pipelinesRes = await request.get(`${auth.apiUrl}/api/crm/pipelines/`, { headers: auth.headers });
      expect(pipelinesRes.ok()).toBeTruthy();
      const list = normalizeList<{ id: number; name: string }>(await pipelinesRes.json());
      expect(list.some((p) => p.name === newPipelineName)).toBeTruthy();
    }).toPass({ timeout: 45_000 });
  })

});
