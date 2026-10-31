import { expect, test, type Page } from '@playwright/test';

/** Isolated action replay: original people/coordinates, one real group order.
 * Legno is already known so discovery does not interrupt the observed work. */
async function showWorkingGroup(page: Page) {
  await page.goto('/');
  const replay = await page.evaluate(async () => {
    const reactModule = await import('/node_modules/.vite/deps/react.js');
    const React = reactModule.default;
    const rootModule = await import('/node_modules/.vite/deps/react-dom_client.js');
    const { createRoot } = rootModule.default;
    const { createGame, issueCommand, tick } = await import('/src/game/engine.ts');
    const { WorldMap } = await import('/src/components/WorldMap.tsx');
    let state = createGame(6842, 'guided');
    // Keep the original twelve-second work observation as a legacy replay.
    delete state.openingBalanceVersion;
    delete state.openingCouncilsCompleted;
    state.started = true;
    state.words.O_03 = { retention: 100, custodians: state.units.map((u) => u.id), uses: 0 };
    for (const unit of state.units) unit.knows.push('O_03');
    const tree = state.entities.find((e) => e.kind === 'tree' && e.x === 223 && e.y === 229)!;
    state = issueCommand(state, ['S_01', 'V_03'], {
      type: 'entity',
      id: tree.id,
      x: tree.x,
      y: tree.y,
    });
    const actorIds = state.units.filter((u) => u.command?.includes('V_03')).map((u) => u.id);
    for (let i = 0; i < 48; i++) state = tick(state, 0.25);
    state.paused = true;
    const workers = state.units.filter((u) => actorIds.includes(u.id));
    let minimumDistance = Infinity;
    for (let i = 0; i < workers.length; i++)
      for (let j = i + 1; j < workers.length; j++)
        minimumDistance = Math.min(
          minimumDistance,
          Math.hypot(workers[i].x - workers[j].x, workers[i].y - workers[j].y),
        );
    const groundWood = state.entities
      .filter((e) => e.kind === 'ground' && e.resource === 'wood')
      .reduce((sum, e) => sum + e.amount, 0);
    document.body.innerHTML = '';
    document.body.style.cssText = 'margin:0;overflow:hidden';
    const host = document.createElement('div');
    host.style.cssText = 'width:100vw;height:100vh';
    document.body.append(host);
    createRoot(host).render(
      React.createElement(WorldMap, {
        state,
        selectedTarget: null,
        onSelect: () => {},
        focusRequest: { x: tree.x, y: tree.y, nonce: 1 },
      }),
    );
    return {
      actorIds,
      minimumDistance,
      groundWood,
      sourceWood: state.entities.find((e) => e.id === tree.id)!.amount,
      storedWood: state.resources.wood,
      childWorking: state.units.some((u) => u.age < 4 && actorIds.includes(u.id)),
      sourceDistances: workers.map((u) => Math.hypot(u.x - tree.x, u.y - tree.y)),
    };
  });
  await expect(page.getByRole('img', { name: /Mappa della valle/ })).toBeVisible();
  return replay;
}

for (const mobile of [false, true]) {
  test(`a real group action spreads adult workers and pauses its canvas on ${mobile ? 'mobile' : 'desktop'}`, async ({
    page,
  }) => {
    await page.setViewportSize(mobile ? { width: 390, height: 780 } : { width: 1080, height: 900 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const replay = await showWorkingGroup(page);
    expect(replay.actorIds).toHaveLength(6);
    expect(replay.childWorking).toBe(false);
    expect(replay.minimumDistance).toBeGreaterThan(0.7);
    expect(Math.max(...replay.sourceDistances)).toBeLessThan(4);
    expect(replay.groundWood).toBeGreaterThan(0);
    expect(replay.sourceWood + replay.groundWood).toBe(20);
    expect(replay.storedWood).toBe(0);

    // A paused scene must keep its exact poses, rather than continuing a wall-clock animation.
    const canvas = page.getByRole('img', { name: /Mappa della valle/ });
    await page.waitForTimeout(300);
    const before = await canvas.evaluate((element) => (element as HTMLCanvasElement).toDataURL());
    await page.waitForTimeout(350);
    const after = await canvas.evaluate((element) => (element as HTMLCanvasElement).toDataURL());
    expect(after).toBe(before);
    expect(errors).toEqual([]);
  });
}
