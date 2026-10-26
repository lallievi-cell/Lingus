import { expect, test } from '@playwright/test';

// Prepared renderer scene: verifies a real foreign Unit remains observable in
// the urban view, without claiming an ordinary route to urbanization.
for (const mobile of [false, true]) {
  test(`urban foreign person remains selectable without exposing names on ${mobile ? 'mobile' : 'desktop'}`, async ({
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
      Object.assign(state, { started: true, paused: true, time: 800, tier: 4, urbanized: true });
      state.entities = [];
      state.buildings = [];
      state.cities = [];
      state.sparks = [];
      state.units = state.units.slice(0, 1);
      const person = state.units[0];
      Object.assign(person, {
        x: 250,
        y: 250,
        age: 6,
        action: 'idle',
        factionId: state.factions[0].id,
      });
      state.factions[0].hostile = true;
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
    });
    const map = page.getByRole('img', { name: /Mappa della valle/ });
    await expect(map).toBeVisible();
    // Zoom into the map using the real controls, then select the shoulder cloth
    // within the existing person silhouette rather than its ground position.
    for (let i = 0; i < 18; i++)
      await page.getByRole('button', { name: 'Ingrandisci la mappa' }).click();
    const zoom =
      Number(
        (await page.locator('.lingus-world__control-stack > span').innerText()).replace('%', ''),
      ) / 100;
    const bounds = (await map.boundingBox())!;
    const scale = Math.min(bounds.width / 1200, bounds.height / 800) * zoom;
    await map.click({
      position: { x: bounds.width / 2 - 3 * 0.2 * scale, y: bounds.height / 2 - 21 * 0.2 * scale },
    });
    expect(
      await page.evaluate(() => JSON.parse(document.body.dataset.selection ?? '{}')),
    ).toMatchObject({ type: 'unit', x: 250, y: 250 });
    await expect(page.locator('.lingus-world__target-stage')).toContainText('Straniero ostile');
    await expect(page.locator('.lingus-world__target-card')).not.toContainText('Korg');
  });
}
