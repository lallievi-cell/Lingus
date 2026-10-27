import { expect, test, type Page } from '@playwright/test';
import { closeWordBank } from './mobile-ui';

/** Prepared emergency isolates the real rescue command and responsive layout. */
async function loadColdEmergency(page: Page) {
  await page.goto('/');
  const raw = await page.evaluate(async () => {
    const { createGame } = await import('/src/game/engine.ts');
    const { WORD_ORDER, emptyInventory } = await import('/src/game/content.ts');
    const state = createGame(6842, 'guided');
    Object.assign(state, {
      started: true,
      paused: true,
      time: 335,
      tier: 3,
      entities: [],
      cities: [],
      factions: [],
      sparks: [],
      campfirePending: false,
    });
    state.resources = { ...emptyInventory(), food: 20, wood: 30 };
    state.units = state.units.slice(0, 3);
    state.units.forEach((unit, index) => {
      Object.assign(unit, {
        x: index === 0 ? 270 : 250 + index,
        y: 250,
        age: 6,
        hunger: 20,
        temp: index === 0 ? 14 : 100,
        hp: 100,
        action: 'idle',
      });
    });
    for (const id of WORD_ORDER) {
      state.words[id] = { retention: 100, custodians: state.units.map((unit) => unit.id), uses: 0 };
      for (const unit of state.units) if (!unit.knows.includes(id)) unit.knows.push(id);
    }
    state.buildings = [
      {
        id: 'emergency-fire',
        kind: 'campfire',
        ...state.home,
        hp: 100,
        active: true,
        completed: true,
      },
    ];
    return JSON.stringify(state);
  });
  await page.addInitScript((raw) => {
    if (sessionStorage.getItem('survival-mobile-fixture')) return;
    localStorage.setItem('lingus.save.v2', raw);
    localStorage.setItem('lingus.pause-events', 'false');
    sessionStorage.setItem('survival-mobile-fixture', 'applied');
  }, raw);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Riprendi il tempo', exact: true })).toBeVisible();
}

async function readSave(page: Page) {
  await page.getByRole('button', { name: 'Impostazioni e salvataggi' }).click();
  await page.getByRole('button', { name: /Salva adesso/ }).click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('lingus.save.v2')!));
  await page.getByRole('button', { name: 'Chiudi finestra' }).click();
  return saved;
}

for (const viewport of [
  { width: 390, height: 844 },
  { width: 844, height: 390 },
]) {
  test(`a real cold emergency keeps rescue and composer reachable at ${viewport.width}×${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await loadColdEmergency(page);
    const advisor = page.getByRole('alert', { name: 'Priorità della tribù' });
    await expect(advisor).toContainText('Un compagno sta gelando');
    await closeWordBank(page);
    const rescue = advisor.getByRole('button', { name: 'Raduna al riparo', exact: true });
    const composer = page.getByRole('region', { name: 'Costruttore di frasi' });
    for (const control of [
      rescue,
      page.getByRole('button', { name: 'Tutti gli adulti', exact: true }),
      page.getByRole('button', { name: 'Raduna al campo', exact: true }),
      composer.getByRole('button', { name: 'Pronuncia', exact: true }),
    ]) {
      await expect(control).toBeInViewport();
      const box = (await control.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
      expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
    }
    const mapFrame = (await page.locator('.map-frame').boundingBox())!;
    expect(mapFrame.height).toBeGreaterThanOrEqual(80);
    const toolbar = (await page.locator('.map-toolbar').boundingBox())!;
    expect(toolbar.height).toBeGreaterThanOrEqual(36);
    expect(mapFrame.y + mapFrame.height).toBeLessThanOrEqual(toolbar.y);
    expect(toolbar.y + toolbar.height).toBeLessThanOrEqual((await composer.boundingBox())!.y);
    expect(
      await page.evaluate(() => ({
        horizontal: document.documentElement.scrollWidth <= innerWidth,
        vertical: document.documentElement.scrollHeight <= innerHeight,
      })),
    ).toEqual({ horizontal: true, vertical: true });
    await page.screenshot({
      path: `/tmp/lingus-qol-cold-${viewport.width}.png`,
      fullPage: true,
    });
    await rescue.click();
    const called = await readSave(page);
    expect(called.voice).toBe(2);
    expect(called.stats.commands).toBe(1);
    expect(called.units[0]).toMatchObject({ x: 270, y: 250, temp: 14, action: 'moving' });
    expect(called.units[0].tx).toBe(250);
    expect(called.units[0].ty).toBe(250);
    await page.getByRole('button', { name: 'Riprendi il tempo', exact: true }).click();
    // Observe genuine timed simulation through its existing autosave. No tick
    // injection and no artificial movement or resources are applied by the test.
    await expect
      .poll(
        async () => {
          const state = await page.evaluate(() =>
            JSON.parse(localStorage.getItem('lingus.save.v2')!),
          );
          return state.time > 335 && state.units[0].x < 270 && state.units[0].hp > 0;
        },
        { timeout: 10_000 },
      )
      .toBe(true);
    await page.getByRole('button', { name: 'Metti in pausa', exact: true }).click();
    const walked = await readSave(page);
    expect(walked.time).toBeGreaterThan(called.time);
    expect(walked.units[0].x).toBeLessThan(270);
    expect(walked.units[0].x).toBeGreaterThanOrEqual(250);
    expect(walked.units[0].hp).toBeGreaterThan(0);
    expect(walked.stats.commands).toBe(1);
  });
}
