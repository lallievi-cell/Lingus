import { expect, test } from '@playwright/test';

for (const width of [320, 390]) {
  test(`resource and work phase stay readable in closed and expanded tribe cards at ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/');
    const raw = await page.evaluate(async () => {
      const { createGame } = await import('/src/game/engine.ts');
      const { WORD_ORDER } = await import('/src/game/content.ts');
      const { resolveInteractionPosition } = await import('/src/game/interactionPositions.ts');
      const state = createGame(6842, 'guided');
      Object.assign(state, {
        started: true,
        paused: true,
        tier: 3,
        time: 20,
        cities: [],
        factions: [],
        buildings: [],
        sparks: [],
      });
      state.units = state.units.slice(0, 5);
      for (const id of WORD_ORDER)
        if (id !== 'O_08')
          state.words[id] = { retention: 100, custodians: state.units.map((u) => u.id), uses: 0 };
      state.entities = [
        { id: 'wood', kind: 'tree', x: 260, y: 250, amount: 20, hp: 100, maxHp: 100 },
        { id: 'rock', kind: 'stone', x: 250, y: 260, amount: 20, hp: 100, maxHp: 100 },
        { id: 'food', kind: 'berries', x: 240, y: 250, amount: 20, hp: 100, maxHp: 100 },
      ];
      state.units.forEach((unit, index) => {
        Object.assign(unit, {
          ...state.home,
          age: 6,
          hp: 100,
          hunger: 0,
          temp: 100,
          action: 'gathering',
          command: ['S_01', index === 1 ? 'V_03' : 'V_04'],
        });
        const source = state.entities[index % 3];
        const kind = source.kind === 'tree' ? 'tree' : source.kind === 'stone' ? 'stone' : 'forage';
        const place = resolveInteractionPosition(state, unit, source, {
          kind,
          key: `${kind}:${source.id}`,
        });
        Object.assign(unit, { x: place.x, y: place.y, targetId: source.id });
        if (index === 3)
          Object.assign(unit, { action: 'returning', carry: { resource: 'wood', amount: 3 } });
        if (index === 4) Object.assign(unit, state.home);
      });
      return JSON.stringify(state);
    });
    await page.addInitScript(
      ({ raw, large }) => {
        localStorage.setItem('lingus.save.v2', raw);
        if (large)
          localStorage.setItem(
            'lingus.interface.v1',
            JSON.stringify({ textSize: 'large', contrast: 'high' }),
          );
      },
      { raw, large: width === 320 },
    );
    await page.reload();
    await page
      .getByRole('navigation', { name: 'Sezioni di gioco' })
      .getByRole('button', { name: /^Tribù/ })
      .click();
    const rows = page.getByLabel('Membri della tribù').locator('.tribe-member');
    await expect(rows).toHaveCount(5);
    const expected = [
      'Raccoglie legno',
      'Estrae pietra',
      'Raccoglie bacche',
      'Porta legno al campo',
      'Va a raccogliere pietra',
    ];
    for (let index = 0; index < expected.length; index++) {
      const row = rows.nth(index);
      const status = row.locator('.person-work-status');
      await row.scrollIntoViewIfNeeded();
      await expect(status).toHaveText(expected[index]);
      expect(await status.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
      await row.locator('.unit-card').click();
      await expect(row.locator('.person-details')).toContainText(expected[index]);
      await expect(row.locator('.member-vitals')).toBeVisible();
      await row.locator('.unit-card').click();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await rows.nth(0).scrollIntoViewIfNeeded();
    await page.screenshot({ path: test.info().outputPath(`tribe-work-resources-${width}.png`) });
  });
}
