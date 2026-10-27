import { expect, test, type Page } from '@playwright/test';

/** Prepared saves isolate the six interface materials, not campaign progression. */
async function loadTier(page: Page, tier: number, night = false) {
  await page.goto('/');
  const raw = await page.evaluate(
    async ({ tier, night }) => {
      const { createGame } = await import('/src/game/engine.ts');
      const { WORDS } = await import('/src/game/content.ts');
      const state = createGame(6842, 'guided');
      Object.assign(state, {
        tier,
        started: true,
        paused: true,
        time: night ? 70 : 20,
        seasonIndex: 0,
        cities: [],
        factions: [],
        sparks: [],
        campfirePending: false,
      });
      for (const unit of state.units)
        Object.assign(unit, { hp: 100, hunger: 20, temp: 100, action: 'idle', progress: 0 });
      Object.assign(state.units[0], { hp: 25, hunger: 95, temp: 15 });
      for (const word of Object.values(WORDS)) {
        if (word.tier > tier) continue;
        state.words[word.id] = {
          retention: 100,
          custodians: state.units.map((unit) => unit.id),
          uses: 1,
        };
        for (const unit of state.units) if (!unit.knows.includes(word.id)) unit.knows.push(word.id);
      }
      // The same visible physical cues must survive every material change.
      state.words.O_03 = {
        retention: 20,
        custodians: [state.units[0].id],
        uses: 1,
      };
      if (!state.units[0].knows.includes('O_03')) state.units[0].knows.push('O_03');
      state.words.V_06 = { retention: 0, custodians: [], uses: 1 };
      for (const unit of state.units) unit.knows = unit.knows.filter((id) => id !== 'V_06');
      return JSON.stringify(state);
    },
    { tier, night },
  );
  await page.addInitScript(
    ({ raw, marker }) => {
      if (sessionStorage.getItem(marker)) return;
      localStorage.setItem('lingus.save.v2', raw);
      sessionStorage.setItem(marker, 'applied');
    },
    { raw, marker: `lingus.tier-material.${tier}.${night}.${Date.now()}` },
  );
  await page.reload();
  await expect(page.getByRole('button', { name: 'Riprendi il tempo', exact: true })).toBeVisible();
  await expect(page.locator('.app')).toHaveClass(new RegExp(`\\btier-${tier}\\b`));
}

test('all six materials preserve composing, lost-word cues and accessible civilization dialogs', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const materials = new Set<string>();
  const workbenchSurfaces = new Set<string>();
  const modalSurfaces = new Set<string>();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  for (let tier = 0; tier < 6; tier++) {
    await loadTier(page, tier);
    const workbench = page.getByRole('region', { name: 'Costruttore di frasi' });
    await expect(workbench).toBeVisible();
    const material = await workbench.evaluate((node) =>
      getComputedStyle(node).getPropertyValue('--ui-material-name').trim(),
    );
    expect(material).not.toBe('');
    materials.add(material);
    workbenchSurfaces.add(
      await workbench.evaluate((node) => {
        const style = getComputedStyle(node);
        return [style.backgroundColor, style.backgroundImage, style.borderTopColor].join('|');
      }),
    );
    await expect(page.getByRole('button', { name: 'Pronuncia', exact: true })).toBeDisabled();
    await workbench.getByRole('button', { name: /^Gruppo:/ }).click();
    await workbench.getByRole('button', { name: /^Andare:/ }).click();
    await expect(workbench.locator('.sentence-slot.filled')).toHaveCount(2);
    await expect(page.getByRole('button', { name: 'Pronuncia', exact: true })).toBeEnabled();
    // The complete bank preserves forgotten/fragile visual cues; contextual
    // suggestions intentionally omit forgotten words and completed slots.
    await workbench.getByRole('button', { name: 'Tutte', exact: true }).click();
    const lost = workbench.getByRole('button', { name: /^Scheggiare: parola perduta/ });
    await expect(lost).toBeDisabled();
    await expect(lost).toHaveAttribute('title', /riscopr|esperienz|custod/i);
    await expect(lost.locator('.word-label')).toHaveCSS('text-decoration-line', 'line-through');
    await expect(workbench.getByRole('button', { name: /^Legno:/ })).toHaveClass(/word-fragile/);
    await expect(
      page.getByLabel('Membri della tribù').locator('.person-warning').first(),
    ).toContainText('Freddo intenso');
    // Keyboard focus remains visible even on irregular stone or engraved metal.
    const move = workbench.getByRole('button', { name: /^Andare:/ });
    await page.keyboard.press('Tab');
    await move.focus();
    const focus = await move.evaluate((node) => {
      const style = getComputedStyle(node);
      return { style: style.outlineStyle, width: parseFloat(style.outlineWidth) };
    });
    expect(focus.style).not.toBe('none');
    expect(focus.width).toBeGreaterThanOrEqual(2);
    await page.screenshot({ path: `/workspace/artifacts/lingus-ui-tier-${tier}.png` });
    await workbench.screenshot({
      path: `/workspace/artifacts/lingus-ui-tier-${tier}-language.png`,
    });

    const recipes = page.getByRole('button', { name: /Le frasi della materia/ });
    await recipes.click();
    const dialog = page.getByRole('dialog', { name: 'La civiltà delle parole' });
    await expect(dialog.getByRole('heading', { name: 'La materia delle parole.' })).toBeVisible();
    expect(
      await dialog.evaluate((node) =>
        getComputedStyle(node).getPropertyValue('--ui-material-name').trim(),
      ),
    ).toBe(material);
    modalSurfaces.add(
      await dialog.evaluate((node) => {
        const style = getComputedStyle(node);
        return [style.backgroundColor, style.backgroundImage, style.borderTopColor].join('|');
      }),
    );
    await expect(dialog.getByRole('button', { name: 'Chiudi finestra' })).toBeVisible();
    await page.screenshot({ path: `/workspace/artifacts/lingus-ui-tier-${tier}-civilization.png` });
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(recipes).toBeFocused();
  }
  expect(materials.size).toBe(6);
  expect(workbenchSurfaces.size).toBe(6);
  expect(modalSurfaces.size).toBe(6);
  expect(errors).toEqual([]);
});

test('six nighttime materials fit a narrow screen and preserve touch access to language and modals', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  for (let tier = 0; tier < 6; tier++) {
    await loadTier(page, tier, true);
    await expect(page.locator('.app')).toHaveClass(/night-mode/);
    const workbench = page.getByRole('region', { name: 'Costruttore di frasi' });
    await workbench.getByRole('button', { name: /^Gruppo:/ }).click();
    await workbench.getByRole('button', { name: /^Andare:/ }).click();
    await expect(workbench.locator('.sentence-slot.filled')).toHaveCount(2);
    await expect(
      workbench.getByRole('button', { name: 'Pronuncia', exact: true }),
    ).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.getByRole('button', { name: 'Impostazioni e salvataggi' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const bounds = (await dialog.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
    await expect(dialog.getByRole('button', { name: 'Chiudi finestra' })).toBeInViewport();
    await dialog.getByRole('button', { name: /Salva adesso/ }).click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Chiudi finestra' }).click();
    await expect(workbench.locator('.sentence-slot.filled')).toHaveCount(2);
  }
});

test('reduced motion keeps material controls still and usable', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await loadTier(page, 5);
  await page.getByRole('button', { name: 'Impostazioni e salvataggi' }).click();
  const dialog = page.getByRole('dialog');
  const durations = await dialog.evaluate((node) => {
    const style = getComputedStyle(node);
    const scrim = getComputedStyle(node.parentElement!);
    return [style.animationDuration, style.transitionDuration, scrim.animationDuration];
  });
  for (const duration of durations)
    for (const part of duration.split(',')) expect(parseFloat(part)).toBeLessThanOrEqual(0.001);
  await dialog.getByRole('button', { name: 'Chiudi finestra' }).click();
  await page
    .getByRole('region', { name: 'Costruttore di frasi' })
    .getByRole('button', { name: /^Gruppo:/ })
    .click();
  await expect(page.locator('.sentence-slot.filled')).toHaveCount(1);
});
