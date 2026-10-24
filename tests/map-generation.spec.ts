import { expect, test, type Page } from '@playwright/test';

const SAVE_KEY = 'lingus.save.v2';
type WorldSave = {
  time: number;
  seed: number;
  playMode?: 'guided' | 'classic';
  mapGeneration?: { mode: 'random' | 'seed-zero'; seed: number; version: 1 };
  entities: {
    id: string;
    kind: string;
    x: number;
    y: number;
    originX?: number;
    originY?: number;
    amount: number;
  }[];
  sectors: { id: string; x: number; y: number; biome: string; cityId?: string }[];
  cities: { id: string; x: number; y: number; sectorX: number; sectorY: number }[];
};

const mapPicker = (page: Page) => page.getByRole('group', { name: 'Mappa della nuova partita' });
const welcome = (page: Page) => page.getByRole('dialog', { name: 'Benvenuto in Lingus' });
const restart = (page: Page) => page.getByRole('dialog', { name: 'Cominciare una nuova storia' });

function geometry(state: WorldSave) {
  return {
    entities: state.entities.map((entity) => ({
      id: entity.id,
      kind: entity.kind,
      x: entity.originX ?? entity.x,
      y: entity.originY ?? entity.y,
    })),
    sectors: state.sectors.map(({ id, x, y, biome, cityId }) => ({ id, x, y, biome, cityId })),
    cities: state.cities.map(({ id, x, y, sectorX, sectorY }) => ({ id, x, y, sectorX, sectorY })),
  };
}

async function readSave(page: Page): Promise<WorldSave> {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), SAVE_KEY);
}

async function saveAndRead(page: Page) {
  await page.getByRole('button', { name: 'Impostazioni e salvataggi' }).click();
  await page.getByRole('button', { name: /Salva adesso/ }).click();
  const state = await readSave(page);
  await page.getByRole('button', { name: 'Chiudi finestra' }).click();
  return state;
}

async function startAndPause(page: Page, first = true) {
  await (first ? welcome(page) : restart(page))
    .getByRole('button', { name: first ? /Dai inizio alla storia/ : /Inizia una nuova storia/ })
    .click();
  await page.getByRole('button', { name: 'Metti in pausa' }).click();
  return saveAndRead(page);
}

async function openRestart(page: Page) {
  await page.getByRole('button', { name: 'Impostazioni e salvataggi' }).click();
  await page.getByRole('button', { name: /Una nuova storia/ }).click();
  await expect(restart(page)).toBeVisible();
}

test('new stories default to different random maps and reload preserves the saved world', async ({
  page,
}) => {
  await page.goto('/');
  await expect(mapPicker(page).getByRole('button', { name: /^Casuale/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(welcome(page).getByRole('button', { name: /^Guidata/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const first = await startAndPause(page);
  expect(first.mapGeneration?.mode).toBe('random');
  await openRestart(page);
  const next = await startAndPause(page, false);
  expect(next.mapGeneration?.mode).toBe('random');
  expect(next.mapGeneration?.seed).not.toBe(first.mapGeneration?.seed);
  expect(geometry(next)).not.toEqual(geometry(first));

  await page.reload();
  await expect(page.getByRole('button', { name: 'Riprendi il tempo' })).toBeVisible();
  const loaded = await saveAndRead(page);
  expect(loaded.mapGeneration).toEqual(next.mapGeneration);
  expect(loaded.entities).toEqual(next.entities);
  expect(geometry(loaded)).toEqual(geometry(next));
  await page.getByRole('button', { name: 'Impostazioni e salvataggi' }).click();
  await expect(page.getByLabel('Mappa attuale')).toContainText(String(next.mapGeneration!.seed));
});

test('an explicit map seed reproduces its geometry independently from Guided or Classic', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel('Seed della mappa', { exact: true }).fill('123');
  const guided = await startAndPause(page);
  expect(guided.mapGeneration).toEqual({ mode: 'random', seed: 123, version: 1 });

  await openRestart(page);
  await page.getByLabel('Seed della mappa', { exact: true }).fill('123');
  await restart(page)
    .getByRole('button', { name: /^Classica/ })
    .click();
  const classic = await startAndPause(page, false);
  expect(classic.playMode).toBe('classic');
  expect(classic.mapGeneration).toEqual(guided.mapGeneration);
  expect(geometry(classic)).toEqual(geometry(guided));
});

test('Seed Zero remains a fixed scenario independent of the difficulty selection', async ({
  page,
}) => {
  await page.goto('/');
  await mapPicker(page)
    .getByRole('button', { name: /^Seed Zero/ })
    .click();
  await welcome(page)
    .getByRole('button', { name: /^Classica/ })
    .click();
  await expect(mapPicker(page).getByRole('button', { name: /^Seed Zero/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const state = await startAndPause(page);
  expect(state.playMode).toBe('classic');
  expect(state.mapGeneration?.mode).toBe('seed-zero');
  expect(
    state.entities.some((entity) => entity.kind === 'tree' && entity.x === 223 && entity.y === 229),
  ).toBe(true);
  expect(
    state.entities.some(
      (entity) => entity.kind === 'berries' && entity.x === 243 && entity.y === 244,
    ),
  ).toBe(true);
});

test('the picker rejects invalid seeds and accepts the reproducible seed zero', async ({
  page,
}) => {
  await page.goto('/');
  const seed = page.getByLabel('Seed della mappa', { exact: true });
  const begin = welcome(page).getByRole('button', { name: /Dai inizio alla storia/ });
  for (const invalid of ['-1', '1.5', '4294967296']) {
    await seed.fill(invalid);
    await expect(begin).toBeDisabled();
  }
  await seed.fill('0');
  await expect(begin).toBeEnabled();
  const state = await startAndPause(page);
  expect(state.mapGeneration).toEqual({ mode: 'random', seed: 0, version: 1 });
});

test('map options remain accessible on mobile and canceling restart preserves the old map', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  await page.getByLabel('Seed della mappa', { exact: true }).fill('54321');
  const previous = await startAndPause(page);
  await openRestart(page);
  await page.getByLabel('Seed della mappa', { exact: true }).fill('42');
  await restart(page)
    .getByRole('button', { name: /^Classica/ })
    .click();
  await mapPicker(page)
    .getByRole('button', { name: /^Seed Zero/ })
    .click();
  const dimensions = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth,
    viewport: innerWidth,
  }));
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport);
  expect(geometry(await readSave(page))).toEqual(geometry(previous));
  await restart(page).getByRole('button', { name: 'Chiudi finestra' }).click();
  await page.getByRole('button', { name: 'Chiudi finestra' }).click();
  const after = await saveAndRead(page);
  expect(after.mapGeneration).toEqual(previous.mapGeneration);
  expect(after.playMode).toBe(previous.playMode);
  expect(geometry(after)).toEqual(geometry(previous));
});

test('importing a played random map keeps depleted resources instead of generating it again', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel('Seed della mappa', { exact: true }).fill('741');
  await startAndPause(page);
  const played = await page.evaluate(async (key) => {
    const { issueCommand, parseGame, serializeGame, tick } = await import('/src/game/engine.ts');
    let state = parseGame(localStorage.getItem(key)!)!;
    state = { ...state, paused: false };
    const tree = state.entities
      .filter((entity) => entity.kind === 'tree')
      .sort(
        (a, b) =>
          Math.hypot(a.x - state.home.x, a.y - state.home.y) -
          Math.hypot(b.x - state.home.x, b.y - state.home.y),
      )[0];
    const initial = tree.amount;
    state = issueCommand(state, ['S_01', 'V_03'], {
      type: 'entity',
      id: tree.id,
      x: tree.x,
      y: tree.y,
    });
    for (let i = 0; i < 80; i++) state = tick(state, 0.25);
    state = { ...state, paused: true };
    const changed = state.entities.find((entity) => entity.id === tree.id)!;
    return {
      raw: serializeGame(state),
      treeId: tree.id,
      initial,
      remaining: changed.amount,
      seed: state.mapGeneration!.seed,
    };
  }, SAVE_KEY);
  expect(played.remaining).toBeLessThan(played.initial);
  await page.getByRole('button', { name: 'Impostazioni e salvataggi' }).click();
  await page.getByRole('button', { name: /Importa partita/ }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: 'played-random.json',
    mimeType: 'application/json',
    buffer: Buffer.from(played.raw),
  });
  await expect(page.locator('.toast')).toContainText('Partita importata in pausa');
  const imported = await saveAndRead(page);
  expect(imported.mapGeneration?.seed).toBe(played.seed);
  expect(imported.entities.find((entity) => entity.id === played.treeId)?.amount).toBe(
    played.remaining,
  );
  await page.reload();
  const loaded = await saveAndRead(page);
  expect(loaded.entities).toEqual(imported.entities);
});

test('starting the same seed again restores the initial camera instead of keeping the old zoom', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel('Seed della mappa', { exact: true }).fill('42');
  const previous = await startAndPause(page);
  const zoom = page.locator('.lingus-world__control-stack > span');
  await expect(zoom).toHaveText('450%');
  await page.getByRole('button', { name: 'Ingrandisci la mappa', exact: true }).click();
  await page.getByRole('button', { name: 'Ingrandisci la mappa', exact: true }).click();
  await expect(zoom).toHaveText('510%');
  await openRestart(page);
  await page.getByLabel('Seed della mappa', { exact: true }).fill('42');
  const next = await startAndPause(page, false);
  expect(geometry(next)).toEqual(geometry(previous));
  await expect(zoom).toHaveText('450%');
});
