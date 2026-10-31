import { expect, test, type Page } from '@playwright/test';

test.use({ isMobile: true, hasTouch: true, deviceScaleFactor: 1.5 });

/** Prepared UI state: screen usability and paid lessons, not campaign balance. */
async function scene(page: Page, pending = false) {
  await page.goto('/');
  const raw = await page.evaluate(async (pending) => {
    const { createGame } = await import('/src/game/engine.ts');
    const { WORD_ORDER } = await import('/src/game/content.ts');
    const s = createGame(6842, 'guided');
    // Historical prepared council: ordinary +20 teaching and seasonal erosion.
    delete s.openingBalanceVersion;
    delete s.openingCouncilsCompleted;
    Object.assign(s, {
      started: true,
      paused: true,
      tier: 5,
      time: 200,
      cities: [],
      sparks: [],
      campfirePending: pending,
    });
    for (const u of s.units) Object.assign(u, { hp: 90, hunger: 20, temp: 100 });
    s.units[0].hunger = 96;
    s.units[1].temp = 18;
    s.units[5].age = 14;
    for (const id of WORD_ORDER)
      s.words[id] = { retention: 80, custodians: [s.units[0].id, s.units[1].id], uses: 0 };
    for (const id of ['O_05', 'V_06'])
      s.words[id] = { retention: 25, custodians: [s.units[5].id], uses: 0 };
    s.resources.wood = 2;
    s.resources.food = 20;
    s.attention = 0;
    s.buildings = [
      { id: 'fire', kind: 'campfire', ...s.home, hp: 100, active: true, completed: true },
      { id: 'palace', kind: 'palace', ...s.home, hp: 500, active: true, completed: true },
      { id: 'menhir', kind: 'menhir', ...s.home, hp: 500, active: true, completed: true },
    ];
    return JSON.stringify(s);
  }, pending);
  await page.addInitScript((raw) => {
    if (sessionStorage.getItem('screen-review-fixture')) return;
    localStorage.setItem('lingus.save.v2', raw);
    sessionStorage.setItem('screen-review-fixture', 'yes');
  }, raw);
  await page.reload();
}
const nav = (page: Page) => page.getByRole('navigation', { name: 'Sezioni di gioco' });
async function saved(page: Page) {
  await page.getByRole('button', { name: 'Impostazioni e salvataggi' }).tap();
  await page.getByRole('button', { name: /Salva adesso/ }).tap();
  const s = await page.evaluate(() => JSON.parse(localStorage.getItem('lingus.save.v2')!));
  await page.getByRole('button', { name: 'Chiudi finestra', exact: true }).tap();
  return s;
}
for (const viewport of [
  { width: 360, height: 640 },
  { width: 390, height: 744 },
])
  test(`people and urgent needs precede secondary community data at ${viewport.width}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await scene(page);
    await nav(page)
      .getByRole('button', { name: /^Tribù/ })
      .tap();
    const notice = page.getByLabel('Ultimi custodi a rischio');
    expect((await notice.boundingBox())!.height).toBeLessThan(230);
    await expect(
      page.getByRole('button', { name: 'Seleziona Korg', exact: true }),
    ).toBeInViewport();
    await page.getByRole('button', { name: 'Mostra urgenze', exact: true }).tap();
    await expect(page.locator('.unit-list .unit-card')).toHaveCount(2);
    await expect(page.locator('.unit-list')).toContainText('Fame estrema');
    await expect(page.locator('.unit-list')).toContainText('Freddo intenso');
    await page.getByRole('button', { name: 'Tutta la tribù', exact: true }).tap();
    await expect(page.locator('.unit-list .unit-card')).toHaveCount(7);
    await page.getByRole('button', { name: 'Seleziona Uma', exact: true }).tap();
    await expect(page.locator('.person-details')).toContainText('Anziana');
    await expect(page.locator('.person-details')).toContainText('Ultima custode');
    await page.screenshot({ path: test.info().outputPath('person.png') });
  });
for (const viewport of [
  { width: 390, height: 744 },
  { width: 844, height: 390 },
])
  test(`lesson search and filters lead to a real paid new custodian at ${viewport.width}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await scene(page);
    await nav(page).getByRole('button', { name: 'Pensiero', exact: true }).tap();
    await page.getByRole('button', { name: /Attorno al falò/ }).tap();
    const dialog = page.getByRole('dialog', { name: 'Attorno al falò' });
    await dialog.getByRole('button', { name: /Brucia 2 unità di legno/ }).tap();
    await dialog.getByRole('button', { name: 'A rischio', exact: true }).tap();
    await expect(dialog.locator('.teaching-row')).toHaveCount(2);
    await dialog.getByRole('searchbox', { name: 'Cerca una parola da tramandare' }).fill('fuoco');
    await expect(dialog.locator('.teaching-row')).toHaveCount(1);
    await dialog.getByRole('button', { name: 'Tutte', exact: true }).tap();
    const word = dialog.getByLabel('Parola da tramandare: Fuoco', { exact: true });
    await expect(word).toContainText('Racconta: Uma');
    await expect(word).toContainText('Imparerà: Ilo');
    await word.getByRole('button', { name: /Tramanda/ }).tap();
    await expect(dialog.locator('.teaching-outcome')).toContainText('Ilo');
    await dialog.getByRole('button', { name: 'Chiudi finestra', exact: true }).tap();
    const after = await saved(page);
    expect(after.attention).toBe(0);
    expect(after.resources.wood).toBe(0);
    expect(after.words.O_05.custodians).toHaveLength(2);
    expect(after.stats.taught).toBe(1);
  });
test('reviewed dialogs retain a reachable close control after reading long content', async ({
  page,
}) => {
  test.setTimeout(70_000);
  await page.setViewportSize({ width: 390, height: 744 });
  await scene(page);
  await nav(page).getByRole('button', { name: 'Pensiero', exact: true }).tap();
  for (const label of [
    /Il lessico della tribù/,
    /Le frasi della materia/,
    /Il codice dello Stato/,
    /La Pietra Sacra/,
    /Gli altri popoli/,
    /Il destino della civiltà/,
  ]) {
    await page.getByRole('button', { name: label }).tap();
    const dialog = page.getByRole('dialog');
    await dialog.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    const close = dialog.getByRole('button', { name: 'Chiudi finestra', exact: true });
    await expect(close).toBeInViewport();
    expect(
      await close.evaluate((element) => {
        const r = element.getBoundingClientRect();
        return element.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
      }),
    ).toBe(true);
    expect((await close.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: test.info().outputPath(`${label.source.replace(/\W/g, '')}.png`),
    });
    await close.tap();
  }
});
test('the seasonal council can conclude from its persistent header with actual memory erosion', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 744 });
  await scene(page, true);
  const dialog = page.getByRole('dialog', { name: 'Attorno al falò' });
  await expect(dialog.getByRole('button', { name: 'Chiudi finestra' })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Concludi consiglio', exact: true }).tap();
  await expect(dialog).not.toBeVisible();
  const after = await saved(page);
  expect(after.campfirePending).toBe(false);
  expect(after.words.O_03.retention).toBeLessThan(80);
  expect(after.stats.taught).toBe(0);
  expect(after.resources.wood).toBe(2);
});
test('an invalid order explains itself without consuming Voice, and one replacement repairs it', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 744 });
  await scene(page);
  await page.getByRole('button', { name: 'Mostra parole', exact: true }).tap();
  await page.getByRole('button', { name: 'Apri catalogo delle parole', exact: true }).tap();
  await page.getByRole('button', { name: 'Tutte', exact: true }).tap();
  for (const label of ['Gruppo', 'Mangiare', 'Legno'])
    await page.getByRole('button', { name: new RegExp(`^${label}:`) }).tap();
  await page.getByRole('button', { name: 'Chiudi parole', exact: true }).tap();
  await expect(page.locator('.sentence-feedback.has-issue')).toBeVisible();
  await page.getByRole('button', { name: 'Pronuncia', exact: true }).tap();
  expect((await saved(page)).voice).toBe(3);
  await page.getByRole('button', { name: 'Modifica Mangiare', exact: true }).tap();
  await page.getByRole('button', { name: /^Colpire:/ }).tap();
  await expect(page.getByRole('group', { name: 'Spazi della frase' })).toContainText('Legno');
  await page.getByRole('button', { name: 'Chiudi parole', exact: true }).tap();
  await expect(page.locator('.sentence-feedback.has-issue')).toHaveCount(0);
  expect((await saved(page)).stats.commands).toBe(0);
});
