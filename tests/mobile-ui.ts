import type { Page } from '@playwright/test';

/** Library-oriented tests explicitly expand the phone catalog. The everyday
 * compact palette has its own flow tests and never opens this catalog for free. */
export async function openWordBank(page: Page) {
  const trigger = page.getByRole('button', { name: 'Mostra parole', exact: true });
  if (await trigger.isVisible()) await trigger.click();
  const catalog = page.getByRole('button', { name: 'Apri catalogo delle parole', exact: true });
  if (await catalog.isVisible()) await catalog.click();
}

export async function closeWordBank(page: Page) {
  const trigger = page.getByRole('button', { name: 'Nascondi parole', exact: true });
  if (await trigger.isVisible()) await trigger.click();
}

export async function showRecentPhrases(page: Page) {
  await openWordBank(page);
  const tools = page.locator('.mobile-order-tools');
  if (
    (await tools.isVisible()) &&
    !(await tools.evaluate((node) => (node as HTMLDetailsElement).open))
  )
    await tools.locator('summary').click();
  return page.locator('.echo-shelf[aria-label="Frasi recenti"]:visible');
}
