import type { Page } from '@playwright/test';

/** Desktop shares the same bank; phones open it only while composing. */
export async function openWordBank(page: Page) {
  const trigger = page.getByRole('button', { name: 'Mostra parole', exact: true });
  if (await trigger.isVisible()) await trigger.click();
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
