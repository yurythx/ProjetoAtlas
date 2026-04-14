import { test, expect, type Page, type APIRequestContext } from '@playwright/test';

const E2E_USERNAME = process.env.E2E_USERNAME || 'suporte';
const E2E_PASSWORD = process.env.E2E_PASSWORD || 'suporte123';
const E2E_COMPANY_SLUG = process.env.E2E_COMPANY_SLUG || 'raiz';
const E2E_API_URL = process.env.E2E_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8005';
const E2E_FRONTEND_URL = process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:3005';

export async function loginByApi(page: Page, request: APIRequestContext) {
  const tokenRes = await request.post(`${E2E_API_URL}/api/accounts/token/`, {
    headers: { 'X-Company-Slug': E2E_COMPANY_SLUG },
    data: { username: E2E_USERNAME, password: E2E_PASSWORD },
  });

  expect(tokenRes.ok()).toBeTruthy();
  const tokenBody = (await tokenRes.json()) as { access: string; refresh: string };
  const companiesRes = await request.get(`${E2E_API_URL}/api/core/companies/public_list/`);
  expect(companiesRes.ok()).toBeTruthy();
  const companiesBody = (await companiesRes.json()) as Array<{ name: string; slug: string }> | { value?: Array<{ name: string; slug: string }> };
  const companies = Array.isArray(companiesBody) ? companiesBody : companiesBody.value ?? [];
  const targetCompany = companies.find((company) => company.slug === E2E_COMPANY_SLUG) ?? companies[0];

  await expect
    .poll(async () => {
      const health = await request.get(`${E2E_FRONTEND_URL}/api/health`);
      return health.status();
    }, { timeout: 180_000 })
    .toBe(200);

  await page.goto('/login', { waitUntil: 'domcontentloaded', timeout: 180_000 });
  await page.locator('[aria-label="Selecionar empresa"]').waitFor({ timeout: 30_000 });
  await page.click('[aria-label="Selecionar empresa"]');
  await page.getByRole('option', { name: new RegExp(targetCompany.name, 'i') }).click();
  await page.fill('[aria-label="Nome de usuário"]', E2E_USERNAME);
  await page.fill('[aria-label="Senha"]', E2E_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(dashboard)?$/, { timeout: 180_000 });
  await page.waitForLoadState('networkidle');

  return {
    access: tokenBody.access,
    refresh: tokenBody.refresh,
    companySlug: E2E_COMPANY_SLUG,
    apiUrl: E2E_API_URL,
    headers: {
      Authorization: `Bearer ${tokenBody.access}`,
      'X-Company-Slug': E2E_COMPANY_SLUG,
    },
  };
}

export { test, expect };
