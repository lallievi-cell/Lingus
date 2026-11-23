import { createTerrainBitmap, type TerrainChart } from './mapTerrainArt';

export interface TerrainRequest {
  seed: number;
  season: number;
  chart: TerrainChart;
  brushUrl: string;
}

async function meadowBrush(url: string) {
  try {
    const response = await fetch(url);
    if (response.ok) return await createImageBitmap(await response.blob());
  } catch {
    // Procedural terrain also works if the authored tile could not load.
  }
  return null;
}

globalThis.addEventListener('message', async ({ data }: MessageEvent<TerrainRequest>) => {
  const brush = await meadowBrush(data.brushUrl);
  try {
    const bitmap = createTerrainBitmap(data.seed, data.season, data.chart, brush);
    globalThis.postMessage(bitmap, { transfer: [bitmap] });
  } catch {
    globalThis.postMessage(null);
  } finally {
    brush?.close();
  }
});
