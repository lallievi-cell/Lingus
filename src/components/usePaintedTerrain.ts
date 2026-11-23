import { useEffect, useState, type RefObject } from 'react';
import type { GameState } from '../game/types';
import { createPainterlyTerrain, type TerrainImage } from './mapTerrainArt';
import type { TerrainRequest } from './mapTerrain.worker';
import { loadMeadowBrush, meadowBrushUrl } from './mapMeadowBrush';

export function usePaintedTerrain(
  state: RefObject<GameState>,
  geographyKey: string,
  season: number,
  campKey: string | null,
) {
  const [terrain, setTerrain] = useState<{ geographyKey: string; image: TerrainImage }>();

  useEffect(() => {
    if (terrain?.image instanceof HTMLCanvasElement) return;
    const bitmap = terrain?.image;
    return () => bitmap?.close();
  }, [terrain]);

  useEffect(() => {
    const snapshot = state.current;
    const seed = snapshot.mapGeneration?.mode === 'random' ? snapshot.mapGeneration.seed : 6842;
    let active = true;
    let fallbackStarted = false;
    let worker: Worker | undefined;

    function stopWorker() {
      worker?.terminate();
      worker = undefined;
    }

    async function paintInBrowser() {
      if (fallbackStarted) return;
      fallbackStarted = true;
      stopWorker();
      const brush = await loadMeadowBrush();
      if (active) {
        setTerrain({
          geographyKey,
          image: createPainterlyTerrain(seed, season, snapshot, brush),
        });
      }
    }

    try {
      if (typeof OffscreenCanvas === 'undefined' || typeof Worker === 'undefined') {
        void paintInBrowser();
      } else {
        worker = new Worker(new URL('./mapTerrain.worker.ts', import.meta.url), { type: 'module' });
        worker.onerror = () => void paintInBrowser();
        worker.onmessageerror = () => void paintInBrowser();
        worker.onmessage = ({ data: bitmap }: MessageEvent<ImageBitmap | null>) => {
          if (!bitmap) {
            void paintInBrowser();
            return;
          }
          stopWorker();
          if (active) setTerrain({ geographyKey, image: bitmap });
          else bitmap.close();
        };
        const request: TerrainRequest = {
          seed,
          season,
          chart: {
            mapGeneration: snapshot.mapGeneration,
            sectors: snapshot.sectors,
            camp: campKey === null ? null : snapshot.home,
          },
          brushUrl: new URL(meadowBrushUrl, document.baseURI).href,
        };
        worker.postMessage(request);
      }
    } catch {
      void paintInBrowser();
    }

    return () => {
      active = false;
      stopWorker();
    };
  }, [state, geographyKey, season, campKey]);

  // Keep the previous season while the worker paints. A region's ground
  // never appears underneath another region's coordinates or actors.
  return terrain?.geographyKey === geographyKey ? terrain.image : undefined;
}
