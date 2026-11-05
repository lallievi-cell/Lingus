import { expect, test } from '@playwright/test';

/** Isolate the solar pass so contact shadows and the night veil cannot mask a
 * wrong cast direction. These prepared tree samples do not advance a campaign. */
test('painted solar shadows follow the day and disappear at night in both calendars', async ({
  page,
}) => {
  await page.setViewportSize({ width: 520, height: 460 });
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { createGame } = await import('/src/game/engine.ts');
    const { seasonLength, seasonStart } = await import('/src/game/calendar.ts');
    const { drawMapGroundShadows } = await import('/src/components/mapLighting.ts');
    const stages = { morning: 6, noon: 30, evening: 54, night: 60, midnight: 75, lateNight: 89 };
    const references: Record<string, string> = {};
    let sameCalendarPixels = true;
    const gallery = document.createElement('main');
    gallery.style.cssText = 'display:grid;grid-template-columns:240px 240px;gap:12px;padding:12px';
    document.body.replaceChildren(gallery);
    document.body.style.cssText = 'margin:0;background:#fcf8e9;color:#20362a;font:14px sans-serif';

    const modes = [
      { name: 'Classic', playMode: 'classic', season: 0 },
      { name: 'Guided opening year', playMode: 'guided', season: 0 },
      { name: 'Guided later year', playMode: 'guided', season: 4 },
    ] as const;
    const samples = modes.map(({ name, playMode, season }) => {
      const state = createGame(6842, playMode);
      state.seasonIndex = season;
      state.entities = [
        { id: 'solar-tree', kind: 'tree', x: 250, y: 250, hp: 100, maxHp: 100, amount: 20 },
      ];
      state.buildings = [];
      const observations: Record<
        string,
        { x: number; y: number; radius: number; painted: number }
      > = {};
      for (const [stage, phase] of Object.entries(stages)) {
        state.time = seasonStart(state, season) + (phase / 90) * seasonLength(state, season);
        const canvas = document.createElement('canvas');
        canvas.width = 480;
        canvas.height = 320;
        canvas.style.cssText = 'display:block;width:240px;height:160px;background:#e8e5cb';
        const ctx = canvas.getContext('2d')!;
        ctx.translate(240, 160);
        ctx.scale(4, 4);
        ctx.translate(-600, -400);
        drawMapGroundShadows(ctx, state);
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let weight = 0,
          weightedX = 0,
          weightedY = 0,
          weightedRadius = 0,
          painted = 0;
        for (let index = 3; index < pixels.length; index += 4) {
          const alpha = pixels[index];
          if (!alpha) continue;
          const pixel = (index - 3) / 4;
          const x = (pixel % canvas.width) + 0.5 - 240;
          const y = Math.floor(pixel / canvas.width) + 0.5 - 160;
          painted++;
          weight += alpha;
          weightedX += x * alpha;
          weightedY += y * alpha;
          weightedRadius += (x * x + y * y) * alpha;
        }
        observations[stage] = {
          x: weight ? weightedX / weight : 0,
          y: weight ? weightedY / weight : 0,
          radius: weight ? Math.sqrt(weightedRadius / weight) : 0,
          painted,
        };
        const image = canvas.toDataURL();
        if (name === 'Classic') {
          references[stage] = image;
          if (['morning', 'noon', 'evening', 'midnight'].includes(stage)) {
            const tile = document.createElement('section');
            const caption = document.createElement('p');
            caption.textContent = stage;
            // A reference mark identifies the tree's actual ground anchor.
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.fillStyle = '#a36636';
            ctx.fillRect(238, 158, 4, 4);
            tile.append(canvas, caption);
            gallery.append(tile);
          }
        } else sameCalendarPixels &&= image === references[stage];
      }
      return { name, observations };
    });
    return { samples, sameCalendarPixels };
  });

  for (const { observations: shadow } of result.samples) {
    expect(shadow.morning.painted).toBeGreaterThan(0);
    expect(shadow.evening.painted).toBeGreaterThan(0);
    expect(shadow.morning.x).toBeLessThan(-8);
    expect(shadow.evening.x).toBeGreaterThan(8);
    expect(Math.abs(shadow.noon.x)).toBeLessThan(1);
    expect(shadow.noon.y).toBeLessThan(-3);
    expect(shadow.morning.radius).toBeGreaterThan(shadow.noon.radius * 1.4);
    expect(shadow.evening.radius).toBeGreaterThan(shadow.noon.radius * 1.4);
    for (const stage of ['night', 'midnight', 'lateNight']) expect(shadow[stage].painted).toBe(0);
  }
  expect(result.sameCalendarPixels).toBe(true);
  await page.screenshot({ path: test.info().outputPath('solar-shadow-cycle.png') });
});
