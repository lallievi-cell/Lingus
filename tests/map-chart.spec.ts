import { expect, test } from '@playwright/test';

test('the local chart frames the surveyed land without showing hidden terrain or people', async ({
  page,
}) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { createMapChartPainter } = await import('/src/components/mapChart.ts');
    const { createGame } = await import('/src/game/engine.ts');
    const state = createGame(6842, 'guided', 'random', 1000);
    state.sectors.forEach((sector) => {
      sector.explored = sector.x === 5 && sector.y === 5;
    });
    state.units = [{ ...state.units[0], x: 615, y: 550 }];
    state.cities = [];
    state.battalions = [];
    const terrain = (hidden: string) => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 1000;
      const context = canvas.getContext('2d')!;
      context.fillStyle = hidden;
      context.fillRect(0, 0, 1000, 1000);
      context.fillStyle = '#759a67';
      context.fillRect(500, 500, 100, 100);
      return canvas;
    };
    const a = terrain('#146bc0');
    const b = terrain('#a81e58');
    const chart = document.createElement('canvas');
    const context = chart.getContext('2d')!;
    const paint = createMapChartPainter();
    const view = { minX: 515, minY: 508, maxX: 585, maxY: 592 };
    paint(context, state, a, view, 1.25);
    const before = chart.toDataURL();
    const pixels = context.getImageData(0, 0, chart.width, chart.height).data;
    let surveyed = 0;
    for (let i = 0; i < pixels.length; i += 4) if (pixels[i + 1] > 100) surveyed++;

    state.units[0].x = 640;
    paint(context, { ...state }, b, view, 1.25);
    const hidden = chart.toDataURL();
    state.sectors.find((sector) => sector.x === 6 && sector.y === 5)!.explored = true;
    paint(context, { ...state }, b, view, 1.25);
    return {
      unchanged: before === hidden,
      revealPainted: chart.toDataURL() !== hidden,
      surveyedFraction: surveyed / (chart.width * chart.height),
    };
  });

  expect(result.unchanged).toBe(true);
  expect(result.revealPainted).toBe(true);
  expect(result.surveyedFraction).toBeGreaterThan(0.2);
  expect(result.surveyedFraction).toBeLessThan(0.3);
});
