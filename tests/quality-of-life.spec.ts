import { expect, test, type Page } from '@playwright/test';

/** Explicit UI fixtures. Actions, receipts and deaths use the real engine. */
async function loadScene(
  page: Page,
  variant: 'orders' | 'season' | 'loss' | 'anonymous' | 'fog' | 'council' | 'army' = 'orders',
) {
  await page.goto('/');
  const raw = await page.evaluate(async (variant) => {
    const { createGame } = await import('/src/game/engine.ts');
    const { killUnit, seasonalCore } = await import('/src/game/simulation.ts');
    const { WORD_ORDER, emptyInventory, HOME } = await import('/src/game/content.ts');
    const s = createGame(variant === 'council' ? 1 : 6842, 'guided');
    Object.assign(s, {
      started: true,
      paused: true,
      tier: 3,
      time: 20,
      cities: [],
      factions: [],
      entities: [],
      sparks: [],
      buildings: [],
    });
    s.units = s.units.slice(0, 4);
    s.resources = { ...emptyInventory(), wood: 20, stone: 20, food: 15 };
    for (const [index, u] of s.units.entries())
      Object.assign(u, {
        ...HOME,
        x: 245 + index * 3,
        age: index === 3 ? 1 : 6,
        hp: 100,
        hunger: index === 1 ? 80 : 0,
        temp: 100,
        action: 'idle',
        progress: 0,
      });
    for (const id of WORD_ORDER)
      if (!(variant === 'anonymous' && ['S_02', 'O_08'].includes(id))) {
        s.words[id] = { retention: 100, custodians: s.units.map((u) => u.id), uses: 0 };
        for (const u of s.units) if (!u.knows.includes(id)) u.knows.push(id);
      }
    s.buildings = [
      { id: 'depot', kind: 'depot', x: 260, y: 260, hp: 150, active: true, completed: true },
      {
        id: 'farm',
        kind: 'farm',
        x: 265,
        y: 250,
        hp: 100,
        active: true,
        completed: true,
        workerIds: [],
      },
    ];
    if (variant === 'orders') {
      s.units[0].action = 'returning';
      s.units[0].carry = { resource: 'wood', amount: 3 };
      s.units[0].command = ['S_01', 'V_04', 'O_03'];
    }
    if (variant === 'season') {
      s.time = 260;
      s.resources.stone = 0;
      s.resources.meat = 20;
      s.resources.cooked = 0;
      s.buildings.push({
        id: 'house',
        kind: 'house',
        ...HOME,
        hp: 400,
        active: true,
        completed: true,
      });
      s.buildings.push({
        id: 'fire',
        kind: 'campfire',
        ...HOME,
        hp: 100,
        active: true,
        completed: true,
      });
    }
    if (variant === 'loss') {
      const elder = s.units[0];
      elder.name = 'Uma';
      elder.age = 14;
      s.words.V_06.custodians = [elder.id];
      for (const u of s.units)
        if (u.id !== elder.id) u.knows = u.knows.filter((id) => id !== 'V_06');
      killUnit(s, elder, 'oldAge');
    }
    if (variant === 'fog') {
      s.entities = [
        {
          id: 'hidden-source',
          kind: 'tree',
          x: 450,
          y: 450,
          amount: 37,
          hp: 100,
          maxHp: 100,
          maxAmount: 37,
        },
      ];
      for (const sector of s.sectors) sector.explored = sector.x === 2 && sector.y === 2;
    }
    if (variant === 'council') {
      s.units = s.units.slice(0, 2);
      for (const memory of Object.values(s.words)) memory.custodians = s.units.map((u) => u.id);
      for (const unit of s.units)
        Object.assign(unit, {
          x: 250,
          y: 250,
          hunger: 20,
          age: 6,
          action: 'sleeping',
          sleptThisNight: true,
        });
      s.buildings = [
        { id: 'fire', kind: 'campfire', ...HOME, hp: 100, active: true, completed: true },
      ];
      s.time = 90;
      seasonalCore(s);
      if (s.stats.births !== 1 || !s.campfirePending)
        throw new Error('Expected a real birth and pending council.');
    }
    if (variant === 'army') {
      const capital = {
        ...createGame(6842).cities[0],
        id: 'capital',
        name: 'Campo',
        capital: true,
        factionId: 'player',
        ...HOME,
        sectorX: 2,
        sectorY: 2,
        resources: s.resources,
        cohorts: { workers: 4, warriors: 0, sages: 0, slaves: 0 },
        buildingIds: s.buildings.map((b) => b.id),
      };
      s.cities = [capital];
      s.battalions = [
        {
          id: 'army',
          name: 'Guardia',
          factionId: 'player',
          cityId: capital.id,
          ...HOME,
          hp: 1000,
          maxHp: 1000,
          morale: 1,
          action: 'idle',
          catapult: false,
          occupation: 0,
          metalWeapons: 20,
        },
      ];
    }
    return JSON.stringify(s);
  }, variant);
  await page.addInitScript((raw) => {
    localStorage.setItem('lingus.save.v2', raw);
  }, raw);
  await page.reload();
  if (variant !== 'council')
    await expect(
      page.getByRole('button', { name: 'Riprendi il tempo', exact: true }),
    ).toBeVisible();
  return page.getByRole('region', { name: 'Costruttore di frasi' });
}
async function readSaved(page: Page) {
  await page.getByRole('button', { name: 'Impostazioni e salvataggi' }).click();
  await page.getByRole('button', { name: /Salva adesso/ }).click();
  const s = await page.evaluate(() => JSON.parse(localStorage.getItem('lingus.save.v2')!));
  await page.getByRole('button', { name: 'Chiudi finestra' }).click();
  return s;
}
async function compose(page: Page, labels: string[]) {
  const composer = page.getByRole('region', { name: 'Costruttore di frasi' });
  for (const label of labels)
    await composer.getByRole('button', { name: new RegExp(`^${label}:`) }).click();
  return composer;
}

test('order preview names the one real artisan, warns about cargo and never charges before Pronuncia', async ({
  page,
}) => {
  await loadScene(page);
  const before = await readSaved(page);
  const composer = await compose(page, ['Gruppo', 'Scheggiare', 'Pietra']);
  const preview = page.locator('.order-preview');
  await preview.locator('summary').click();
  await expect(preview).toContainText('1 esecutore');
  await expect(preview).toContainText('Korg');
  await expect(preview).not.toContainText('Ayla');
  await expect(preview).toContainText('lasciato a terra');
  await page.screenshot({ path: test.info().outputPath('qol-orders-desktop.png'), fullPage: true });
  const afterPreview = await readSaved(page);
  expect(afterPreview).toEqual(before);
  await composer.getByRole('button', { name: 'Pronuncia', exact: true }).click();
  const afterCommand = await readSaved(page);
  expect(afterCommand.voice).toBe(before.voice - 1);
  expect(
    afterCommand.units.filter((u: { action: string }) => u.action === 'crafting'),
  ).toHaveLength(1);
  expect(
    afterCommand.entities.some(
      (e: { kind: string; resource?: string; amount: number }) =>
        e.kind === 'ground' && e.resource === 'wood' && e.amount === 3,
    ),
  ).toBe(true);
});

test('tribe filters reveal real needs and saved assignments while building shortcuts only compose', async ({
  page,
}) => {
  await loadScene(page);
  const tools = page.getByRole('group', { name: 'Filtra la tribù' });
  await page.locator('.tribe-tools summary').click();
  await tools.getByRole('button', { name: /^In difficoltà/ }).click();
  await expect(page.locator('.unit-list .unit-card')).toHaveCount(1);
  await expect(page.locator('.unit-list')).toContainText('Ayla');
  await tools.getByRole('button', { name: /^Bambini/ }).click();
  await expect(page.locator('.unit-list .unit-card')).toHaveCount(1);
  await expect(page.locator('.unit-list')).toContainText('Può imparare · non lavora');
  await tools.getByRole('button', { name: /^Tutti/ }).click();
  await page.locator('.building-list').getByRole('button', { name: 'Campo agricolo' }).click();
  const status = page.locator('.selected-work-details');
  await expect(status).toContainText('Nessun addetto assegnato');
  const before = await readSaved(page);
  await status.getByRole('button', { name: 'Prepara incarico' }).click();
  await expect(page.locator('.sentence-slot.filled')).toHaveCount(4);
  expect(await readSaved(page)).toEqual(before);
  await page.getByRole('button', { name: 'Pronuncia', exact: true }).click();
  await expect(status).toContainText('3 assegnati');
  await expect(page.locator('.unit-list')).toContainText('Campo agricolo');
});

test('season readiness warns about actual stone upkeep and raw meat, and safely prepares cooking', async ({
  page,
}) => {
  await loadScene(page, 'season');
  const readiness = page.getByLabel('Preparazione alla prossima stagione', { exact: true });
  await readiness.locator('summary').click();
  await expect(readiness).toContainText('Verso Inverno');
  await expect(readiness).toContainText('mancano 1 pietra');
  await expect(readiness).toContainText('La carne cruda è un rischio');
  const before = await readSaved(page);
  await readiness.getByRole('button', { name: 'Prepara cottura' }).click();
  await expect(page.locator('.sentence-slot.filled')).toHaveCount(4);
  expect(await readSaved(page)).toEqual(before);
});

test('lost-word notification opens the actual experience without reviving the word or spending voice', async ({
  page,
}) => {
  await loadScene(page, 'loss');
  const before = await readSaved(page);
  await page.getByRole('button', { name: 'Come riscoprire Scheggiare', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Riscoprire Scheggiare' });
  await expect(dialog).toContainText('Ricrea l’esperienza');
  await expect(dialog).toContainText('Uma');
  await expect(dialog).toContainText('Scintilla');
  await page.getByRole('button', { name: 'Chiudi finestra' }).click();
  expect(await readSaved(page)).toEqual(before);
});

test('observable work remains readable before names and numbers', async ({ page }) => {
  await loadScene(page, 'anonymous');
  const tribe = page.locator('.tribe-panel');
  await expect(tribe.locator('.unit-list')).not.toContainText('Korg');
  await expect(tribe.locator('.unit-list')).toContainText('Senza incarico');
  await page.locator('.tribe-tools summary').click();
  await expect(tribe.getByRole('button', { name: 'Tutti', exact: true })).toBeVisible();
  const readiness = page.getByLabel('Preparazione alla prossima stagione', { exact: true });
  await readiness.locator('summary').click();
  await expect(readiness).not.toContainText(/\d+s/);
});

test('an auto-selected source beyond exploration stays anonymous in the order preview', async ({
  page,
}) => {
  await loadScene(page, 'fog');
  await compose(page, ['Gruppo', 'Portare', 'Legno']);
  const preview = page.locator('.order-preview');
  await preview.locator('summary').click();
  await expect(preview).toContainText('Destinazione nelle terre inesplorate');
  await expect(preview).not.toContainText(/37|Albero|abbondante/);
});

test('seasonal birth can be inspected without ending the paid council or applying memory decay', async ({
  page,
}) => {
  await loadScene(page, 'council');
  const council = page.getByRole('dialog', { name: 'Attorno al falò' });
  await expect(council).toBeVisible();
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('lingus.save.v2')!));
  const summary = council.getByRole('status', { name: 'Riepilogo della tribù' });
  await summary.getByRole('button', { name: 'Mostra sulla mappa: Una nuova vita' }).click();
  await expect(council).not.toBeVisible();
  await expect(page.locator('.council-inspection')).toContainText('il tempo resta fermo');
  expect(await readSaved(page)).toEqual(before);
  await page.getByRole('button', { name: 'Torna al consiglio' }).click();
  await expect(council).toBeVisible();
  await council.getByRole('button', { name: /Custodiamo queste parole/ }).click();
  const after = await readSaved(page);
  expect(after.campfirePending).toBe(false);
  expect(after.time).toBe(before.time);
});

test('readiness explicitly separates real army upkeep from building and civilian estimates', async ({
  page,
}) => {
  await loadScene(page, 'army');
  await page.getByRole('button', { name: 'Controlla la prossima stagione' }).click();
  const dialog = page.getByRole('dialog', { name: 'Preparazione alla prossima stagione' });
  await expect(dialog).toContainText('Manutenzione degli edifici');
  await expect(dialog).toContainText('Il mantenimento delle truppe è separato');
  await dialog.getByRole('button', { name: 'Mostra un battaglione' }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator('.map-toolbar')).toContainText('Guardia');
});

test('native keyboard activation of preview does not pronounce an order or pause the game', async ({
  page,
}) => {
  await loadScene(page);
  await compose(page, ['Gruppo', 'Scheggiare', 'Pietra']);
  await page.getByRole('button', { name: 'Riprendi il tempo', exact: true }).click();
  const summary = page.locator('.order-preview summary');
  await summary.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.order-preview')).toHaveAttribute('open', '');
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: 'Metti in pausa', exact: true })).toBeVisible();
  const saved = await readSaved(page);
  expect(saved.stats.commands).toBe(0);
  expect(saved.voice).toBe(3);
  expect(saved.paused).toBe(false);
});

test('mobile preparation opens from the map and composes without spending, with readable filters', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loadScene(page, 'season');
  await page.getByRole('button', { name: 'Controlla la prossima stagione' }).click();
  const dialog = page.getByRole('dialog', { name: 'Preparazione alla prossima stagione' });
  await expect(dialog).toContainText('mancano 1 pietra');
  await dialog.getByRole('button', { name: 'Prepara cottura' }).click();
  await expect(dialog).not.toBeVisible();
  const preview = page.locator('.order-preview');
  await preview.locator('summary').click();
  await expect(preview).toContainText('Un artigiano completa una cottura');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath('qol-orders-mobile.png'), fullPage: true });
  await page.getByRole('button', { name: /^Tribù/ }).click();
  await page.locator('.tribe-tools summary').click();
  await page.getByRole('button', { name: /^In difficoltà/ }).click();
  await expect(page.locator('.unit-list .unit-card')).toHaveCount(1);
  await page.getByRole('combobox', { name: 'Filtra per attività' }).selectOption('transport');
  await expect(page.locator('.empty-tribe-filter')).toContainText('Nessun compagno');
  await page.getByRole('button', { name: 'Mostra tutti', exact: true }).click();
  await expect(page.locator('.unit-list .unit-card')).toHaveCount(4);
});

for (const mobile of [false, true])
  test(`overlapping map people can be explicitly chosen by keyboard on ${mobile ? 'mobile' : 'desktop'}`, async ({
    page,
  }) => {
    await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1080, height: 900 });
    await page.goto('/');
    await page.evaluate(async () => {
      const React = (await import('/node_modules/.vite/deps/react.js')).default;
      const { createRoot } = (await import('/node_modules/.vite/deps/react-dom_client.js')).default;
      const { WorldMap } = await import('/src/components/WorldMap.tsx');
      const { createGame } = await import('/src/game/engine.ts');
      const state = createGame(6842);
      Object.assign(state, {
        started: true,
        paused: true,
        entities: [],
        buildings: [],
        cities: [],
        sparks: [],
      });
      state.units = state.units.slice(0, 2);
      for (const unit of state.units)
        Object.assign(unit, { x: 250, y: 250, age: 6, action: 'idle' });
      state.words.S_02 = { retention: 100, custodians: state.units.map((u) => u.id), uses: 0 };
      document.body.innerHTML = '';
      document.body.style.cssText = 'margin:0;overflow:hidden';
      const host = document.createElement('div');
      host.style.cssText = 'width:100vw;height:100vh;position:relative';
      document.body.append(host);
      const root = createRoot(host);
      const receive = (target: { type: string; id?: string; x: number; y: number }) => {
        document.body.dataset.selection = JSON.stringify(target);
        root.render(
          React.createElement(WorldMap, { state, selectedTarget: target, onSelect: receive }),
        );
      };
      root.render(
        React.createElement(WorldMap, { state, selectedTarget: null, onSelect: receive }),
      );
      document.body.addEventListener('qol-hide-overlap', () => {
        state.units[1].x = 450;
        state.units[1].y = 450;
        root.render(
          React.createElement(WorldMap, { state, selectedTarget: null, onSelect: receive }),
        );
      });
    });
    const map = page.getByRole('img', { name: /Mappa della valle/ });
    await expect(map).toBeVisible();
    const b = (await map.boundingBox())!;
    const scale = Math.max(b.width / 1200, b.height / 800) * 4.5;
    await map.click({ position: { x: b.width / 2, y: b.height / 2 - 14 * 0.2 * scale } });
    const choices = page.getByRole('group', { name: 'Scegli tra gli elementi sovrapposti' });
    await expect(choices).toBeVisible();
    expect(await page.evaluate(() => document.body.dataset.selection)).toBeUndefined();
    await choices.getByRole('button', { name: /Ayla/ }).focus();
    await page.keyboard.press('Enter');
    await expect(choices).not.toBeVisible();
    expect(await page.evaluate(() => JSON.parse(document.body.dataset.selection!))).toMatchObject({
      type: 'unit',
      id: 'unit-1',
    });
    await map.click({ position: { x: b.width / 2, y: b.height / 2 - 14 * 0.2 * scale } });
    await expect(choices).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(choices).not.toBeVisible();
    await map.click({ position: { x: b.width / 2, y: b.height / 2 - 14 * 0.2 * scale } });
    await expect(choices).toBeVisible();
    await page.evaluate(() => document.body.dispatchEvent(new Event('qol-hide-overlap')));
    await expect(choices.getByRole('button', { name: /Ayla/ })).toHaveCount(0);
    await choices.getByRole('button', { name: /Korg/ }).click();
    expect(await page.evaluate(() => JSON.parse(document.body.dataset.selection!))).toMatchObject({
      type: 'unit',
      id: 'unit-0',
    });
  });
