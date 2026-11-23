const base = (import.meta as ImportMeta & { env: { BASE_URL: string } }).env.BASE_URL;
export const meadowBrushUrl = `${base}art/meadow-brush.webp`;
let brushLoad: Promise<HTMLImageElement | null> | undefined;

/** A small repeatable luminance tile. Projection and seasonal colours come from the map. */
export function loadMeadowBrush(): Promise<HTMLImageElement | null> {
  if (typeof Image === 'undefined') return Promise.resolve(null);
  brushLoad ??= new Promise((resolve) => {
    const brush = new Image();
    brush.decoding = 'async';
    brush.onload = () => resolve(brush);
    brush.onerror = () => resolve(null);
    brush.src = meadowBrushUrl;
  });
  return brushLoad;
}
