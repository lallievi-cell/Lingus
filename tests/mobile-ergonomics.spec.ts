import { expect, test, type Page } from '@playwright/test';

/** Prepared geometry scene: exercises the actual mobile dock against existing
 * page styles without depending on a particular linguistic campaign. */
async function dockScene(page: Page) {
  await page.goto('/');
  await page.evaluate(async () => {
    const React = (await import('/node_modules/.vite/deps/react.js')).default;
    const { createRoot } = (await import('/node_modules/.vite/deps/react-dom_client.js')).default;
    const { MobileActionDock } = await import('/src/components/MobileActionDock.tsx');
    const h = React.createElement;
    document.body.innerHTML = '';
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    const labels = ['Gruppo', 'Andare', 'Mangiare', 'Colpire', 'Pietra', 'Legno', 'Qui', 'Fuoco'];
    function Scene() {
      const [target, setTarget] = React.useState('Falò centrale');
      return h(
        'div',
        { className: 'app tier-2', style: { height: '100dvh', minHeight: 0, overflow: 'hidden' } },
        h('header', { style: { height: 44, flexShrink: 0, padding: 8 } }, 'Lingus'),
        h(
          'main',
          { style: { flex: '1 1 auto', minHeight: 80, background: '#cdd4ab' } },
          h(
            'button',
            {
              'aria-label': 'Bersaglio sulla mappa',
              style: { width: '100%', height: '100%', background: 'transparent' },
            },
            'La valle',
          ),
        ),
        h(
          'section',
          {
            className: 'language-workbench mobile-ergonomic',
            'aria-label': 'Costruttore di frasi',
          },
          h(
            'div',
            { className: 'composer-row' },
            h(
              'div',
              { className: 'sentence-slots' },
              h(
                'div',
                { className: 'slot-group' },
                h('button', { className: 'sentence-slot filled' }, 'Gruppo'),
              ),
              h(
                'div',
                { className: 'slot-group' },
                h('button', { className: 'sentence-slot filled' }, 'Andare'),
              ),
            ),
            h(
              'div',
              { className: 'composer-actions' },
              h('button', { className: 'pronounce-button' }, 'Pronuncia'),
            ),
          ),
          h(
            'details',
            { className: 'order-preview' },
            h('summary', null, 'Anteprima dell’ordine'),
            h(
              'div',
              { className: 'order-preview-body' },
              Array.from({ length: 8 }, (_, i) =>
                h(
                  'p',
                  { key: i },
                  'Il gruppo raggiunge il luogo scelto senza cambiare la posizione della mappa.',
                ),
              ),
            ),
          ),
          h(
            MobileActionDock,
            { targetLabel: target, onClearTarget: () => setTarget('') },
            h(
              'div',
              { className: 'mobile-selection-controls' },
              h('button', { 'data-map-selection': true }, 'Scegli il gruppo'),
            ),
            h(
              'div',
              { className: 'contextual-word-shelf' },
              h(
                'div',
                { className: 'syntax-assistant' },
                h('input', {
                  type: 'search',
                  'aria-label': 'Cerca parole nella barra',
                  placeholder: 'Cerca una parola',
                }),
              ),
              h(
                'div',
                { className: 'word-shelf' },
                labels.map((label) =>
                  h('button', { className: 'word-tile', key: label }, h('strong', null, label)),
                ),
              ),
            ),
          ),
        ),
      );
    }
    root.render(h(Scene));
    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') document.body.dataset.globalEscape = 'called';
    });
  });
}

for (const viewport of [
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
]) {
  test(`mobile word drawer preserves composer and map geometry at ${viewport.width}×${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await dockScene(page);
    const map = page.getByRole('button', { name: 'Bersaglio sulla mappa' });
    const pronounce = page.getByRole('button', { name: 'Pronuncia', exact: true });
    const words = page.locator('.mobile-word-sheet');
    await expect(words).toBeVisible();
    await expect(pronounce).toBeInViewport();
    const expanded = (await map.boundingBox())!;
    await page.getByRole('button', { name: 'Nascondi parole', exact: true }).click();
    await expect(words).not.toBeVisible();
    const collapsed = (await map.boundingBox())!;
    expect(collapsed.height).toBeCloseTo(expanded.height, 1);
    await page.getByRole('button', { name: 'Mostra parole', exact: true }).click();
    await expect(words).toBeVisible();
    const button = words.getByRole('button', { name: 'Fuoco', exact: true });
    await button.scrollIntoViewIfNeeded();
    await expect(button).toBeInViewport();
    expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect((await pronounce.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await expect(page.getByRole('status', { name: 'Bersaglio del comando' })).toContainText(
      'Falò centrale',
    );
    await page.getByRole('button', { name: 'Rimuovi bersaglio del comando' }).click();
    await expect(page.getByRole('status', { name: 'Bersaglio del comando' })).toContainText(
      'Scegli il bersaglio',
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}

test('mobile palette and expanded preview share one sheet and Escape keeps the phrase intact', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await dockScene(page);
  const map = page.getByRole('button', { name: 'Bersaglio sulla mappa' });
  const initial = (await map.boundingBox())!;
  await page.locator('.order-preview summary').click();
  await expect(page.locator('.mobile-word-sheet')).not.toBeVisible();
  await expect(page.locator('.order-preview-body')).toBeVisible();
  expect((await map.boundingBox())!.height).toBeCloseTo(initial.height, 1);
  await page.getByRole('button', { name: 'Mostra parole', exact: true }).click();
  await expect(page.locator('.order-preview')).not.toHaveAttribute('open', '');
  await page.getByRole('searchbox', { name: 'Cerca parole nella barra' }).focus();
  await page.keyboard.press('Escape');
  await expect(page.locator('.mobile-word-sheet')).not.toBeVisible();
  await expect(page.locator('.sentence-slot.filled')).toHaveCount(2);
  expect(await page.evaluate(() => document.body.dataset.globalEscape)).toBeUndefined();
  await expect(page.getByRole('button', { name: 'Mostra parole', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Mostra parole', exact: true }).click();
  await page.getByRole('button', { name: 'Scegli il gruppo', exact: true }).click();
  await expect(page.locator('.mobile-word-sheet')).not.toBeVisible();
  await expect(page.locator('.sentence-slot.filled')).toHaveCount(2);
});

/** Prepared mid-game save: verifies the real App layout, not campaign balance. */
async function loadAppScene(page: Page) {
  await page.goto('/');
  const raw = await page.evaluate(async () => {
    const { createGame } = await import('/src/game/engine.ts');
    const { WORD_ORDER, emptyInventory } = await import('/src/game/content.ts');
    const state = createGame(6842, 'guided');
    Object.assign(state, {
      started: true,
      paused: true,
      time: 110,
      tier: 3,
      entities: [],
      cities: [],
      factions: [],
      sparks: [],
      campfirePending: false,
    });
    state.resources = { ...emptyInventory(), food: 20, wood: 10, stone: 10 };
    state.units.forEach((unit, index) => {
      Object.assign(unit, {
        x: 220 + index * 10,
        y: 240 + (index % 2) * 20,
        hunger: 20,
        temp: 100,
        hp: 100,
        action: 'idle',
        age: index === 6 ? 2 : 6,
      });
    });
    for (const id of WORD_ORDER) {
      state.words[id] = { retention: 100, custodians: state.units.map((unit) => unit.id), uses: 0 };
      for (const unit of state.units) if (!unit.knows.includes(id)) unit.knows.push(id);
    }
    state.buildings = [
      {
        id: 'mobile-fire',
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
    if (sessionStorage.getItem('mobile-app-fixture')) return;
    localStorage.setItem('lingus.save.v2', raw);
    sessionStorage.setItem('mobile-app-fixture', 'applied');
  }, raw);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Riprendi il tempo', exact: true })).toBeVisible();
}

for (const viewport of [
  { width: 390, height: 844 },
  { width: 844, height: 390 },
]) {
  test(`real App keeps tribe controls, composer and panels usable at ${viewport.width}×${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await loadAppScene(page);
    const all = page.getByRole('button', { name: 'Tutti gli adulti', exact: true });
    const recall = page.getByRole('button', { name: 'Raduna al campo', exact: true });
    for (const control of [all, recall]) {
      await expect(control).toBeInViewport();
      const bounds = (await control.boundingBox())!;
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
      expect(bounds.y).toBeGreaterThanOrEqual(0);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height);
      expect(bounds.height).toBeGreaterThanOrEqual(44);
    }
    await all.click();
    await expect(all).toHaveAttribute('aria-pressed', 'true');
    const composer = page.getByRole('region', { name: 'Costruttore di frasi' });
    await composer.getByRole('button', { name: /^Gruppo:/ }).click();
    await composer.getByRole('button', { name: /^Andare:/ }).click();
    await expect(composer.locator('.sentence-slot.filled')).toHaveCount(2);
    await expect(composer.getByRole('button', { name: 'Pronuncia', exact: true })).toBeInViewport();
    const map = page.getByRole('img', { name: /Mappa della valle/ });
    const expanded = (await map.boundingBox())!;
    expect((await page.locator('.map-frame').boundingBox())!.height).toBeGreaterThanOrEqual(80);
    expect(expanded.height).toBeGreaterThan(70); // The frame includes its two-pixel border.
    await page.screenshot({
      path: `/tmp/lingus-qol-mobile${viewport.width === 844 ? '-landscape' : ''}-open.png`,
      fullPage: true,
    });
    await page.getByRole('button', { name: 'Nascondi parole', exact: true }).click();
    await expect(page.locator('.mobile-word-sheet')).not.toBeVisible();
    await page.screenshot({
      path: `/tmp/lingus-qol-mobile${viewport.width === 844 ? '-landscape' : ''}-closed.png`,
      fullPage: true,
    });
    const collapsed = (await map.boundingBox())!;
    expect(collapsed.height).toBeCloseTo(expanded.height, 1);
    await recall.click();
    await expect(
      page
        .getByRole('status')
        .filter({ hasText: /raggiung/ })
        .first(),
    ).toBeVisible();
    await expect(composer.locator('.sentence-slot.filled')).toHaveCount(2);
    await page.getByRole('button', { name: 'Impostazioni e salvataggi' }).click();
    await page.getByRole('button', { name: /Salva adesso/ }).click();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('lingus.save.v2')!));
    expect(saved.voice).toBe(2);
    expect(saved.stats.commands).toBe(1);
    expect(saved.units.filter((unit: { action: string }) => unit.action === 'moving')).toHaveLength(
      6,
    );
    expect(saved.units.map((unit: { x: number }) => unit.x)).toEqual([
      220, 230, 240, 250, 260, 270, 280,
    ]);
    expect(saved.units[6].action).toBe('idle');
    await page.getByRole('button', { name: 'Chiudi finestra' }).click();
    const nav = page.getByRole('navigation', { name: 'Sezioni di gioco' });
    await nav.getByRole('button', { name: /^Tribù/ }).click();
    await expect(page.getByLabel('Membri della tribù').getByRole('button')).toHaveCount(7);
    await nav.getByRole('button', { name: /^Pensiero/ }).click();
    await page.getByRole('button', { name: /Attorno al falò/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Attorno al falò' });
    await expect(dialog).toBeVisible();
    const box = (await dialog.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
    await dialog.getByRole('button', { name: 'Chiudi finestra' }).click();
    await nav.getByRole('button', { name: 'Mappa', exact: true }).click();
    await expect(composer.locator('.sentence-slot.filled')).toHaveCount(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: test.info().outputPath('real-mobile-game.png'), fullPage: true });
    await page.getByRole('button', { name: 'Mostra parole', exact: true }).click();
    const toolbar = (await page.locator('.map-toolbar').boundingBox())!;
    expect(toolbar.height).toBeGreaterThanOrEqual(36);
    expect(toolbar.y + toolbar.height).toBeLessThanOrEqual((await composer.boundingBox())!.y);
    expect(
      (await page.locator('.mobile-word-sheet').boundingBox())!.y +
        (await page.locator('.mobile-word-sheet').boundingBox())!.height,
    ).toBeLessThanOrEqual(toolbar.y);
    await page.getByRole('button', { name: 'Velocità 2x', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Velocità 2x', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.getByRole('button', { name: 'Riprendi il tempo', exact: true }).click();
    await page.getByRole('button', { name: 'Metti in pausa', exact: true }).click();
    await expect(page.locator('.mobile-word-sheet')).toBeVisible();
  });
}
