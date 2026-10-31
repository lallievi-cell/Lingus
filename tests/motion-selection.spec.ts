import { expect, test } from '@playwright/test';

test('a moving person is selected at its painted position and returns its real coordinates', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1080, height: 900 });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  // Advance only the renderer's real animation callbacks. Neither machine speed
  // nor the delay between Playwright calls can consume the interpolation window.
  await page.addInitScript(() => {
    let nextId = 0;
    const callbacks = new Map<number, FrameRequestCallback>();
    window.requestAnimationFrame = (callback) => {
      callbacks.set(++nextId, callback);
      return nextId;
    };
    window.cancelAnimationFrame = (id) => callbacks.delete(id);
    Object.assign(window, {
      drawMotionFrame(timestamp: number) {
        const pending = [...callbacks.values()];
        callbacks.clear();
        for (const callback of pending) callback(timestamp);
      },
    });
  });
  await page.goto('/');
  const personId = await page.evaluate(async () => {
    const reactModule = await import('/node_modules/.vite/deps/react.js');
    const React = reactModule.default;
    const rootModule = await import('/node_modules/.vite/deps/react-dom_client.js');
    const { createRoot } = rootModule.default;
    const domModule = await import('/node_modules/.vite/deps/react-dom.js');
    const { flushSync } = domModule.default;
    const { WorldMap } = await import('/src/components/WorldMap.tsx');
    const { createGame } = await import('/src/game/engine.ts');
    let state = createGame(6842);
    Object.assign(state, { started: true, paused: false, time: 0 });
    state.entities = [];
    state.buildings = [];
    state.cities = [];
    state.factions = [];
    state.sparks = [];
    state.units = state.units.slice(0, 1);
    Object.assign(state.units[0], { x: 250, y: 252, age: 6, action: 'idle' });

    document.body.innerHTML = '';
    document.body.style.cssText = 'margin:0;overflow:hidden';
    const host = document.createElement('div');
    host.style.cssText = 'width:100vw;height:100vh;position:relative';
    document.body.append(host);
    const root = createRoot(host);
    const render = () =>
      flushSync(() => {
        root.render(
          React.createElement(WorldMap, {
            state,
            selectedTarget: null,
            onSelect: (target: { type: string; id?: string; x: number; y: number }) => {
              document.body.dataset.selection = JSON.stringify(target);
            },
          }),
        );
      });
    render();
    Object.assign(window, {
      moveMotionPerson() {
        state = {
          ...state,
          time: 0.25,
          units: [{ ...state.units[0], x: 256, tx: 260, ty: 252, action: 'moving' }],
        };
        render();
      },
    });
    return state.units[0].id;
  });
  const canvas = page.getByRole('img', { name: /Mappa della valle/ });
  await expect(canvas).toBeVisible();

  // A real pinch uses the component's zoom controls and leaves its center fixed.
  const bounds = (await canvas.boundingBox())!;
  const session = await page.context().newCDPSession(page);
  const x = bounds.x + bounds.width / 2,
    y = bounds.y + bounds.height / 2;
  const finger = (id: number, px: number) => ({ id, x: px, y, radiusX: 3, radiusY: 3, force: 1 });
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [finger(1, x - 20), finger(2, x + 20)],
  });
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [finger(1, x - (20 * 10) / 4.5), finger(2, x + (20 * 10) / 4.5)],
  });
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await session.detach();
  await expect(page.locator('.lingus-world__control-stack > span')).toHaveText('1000%');

  const result = await page.evaluate(async () => {
    const { UNIT_ART_SCALE } = await import('/src/components/mapDrawing.ts');
    const fixture = window as typeof window & {
      drawMotionFrame(timestamp: number): void;
      moveMotionPerson(): void;
    };
    fixture.drawMotionFrame(1000);
    fixture.moveMotionPerson();
    fixture.drawMotionFrame(1040);
    fixture.drawMotionFrame(1120);

    const canvas = document.querySelector<HTMLCanvasElement>('.lingus-world__canvas')!;
    const bounds = canvas.getBoundingClientRect();
    const scale = Math.max(bounds.width / 1200, bounds.height / 800) * 10;
    // After 80ms of a 250ms sample, the painted anchor is x=251.92, while
    // the actual unit is already x=256. Keep them separated by more than the
    // enlarged silhouette and find a real dark detail in the painted head.
    const drawnX = bounds.width / 2 + 1.92 * 2.4 * scale;
    const feetY = bounds.height / 2 + 2 * 1.6 * scale;
    const ratio = canvas.width / bounds.width;
    const image = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
    const pixels: { x: number; y: number }[] = [];
    for (
      let y = Math.floor(feetY - 35 * UNIT_ART_SCALE * scale);
      y < feetY - 20 * UNIT_ART_SCALE * scale;
      y++
    ) {
      for (
        let x = Math.floor(drawnX - 10 * UNIT_ART_SCALE * scale);
        x < drawnX + 10 * UNIT_ART_SCALE * scale;
        x++
      ) {
        const index = (Math.floor(y * ratio) * canvas.width + Math.floor(x * ratio)) * 4;
        const [red, green, blue] = image.data.slice(index, index + 3);
        if (red < 95 && green < 90 && blue < 80 && red > green && green > blue)
          pixels.push({ x, y });
      }
    }
    if (!pixels.length) throw new Error('No painted head found in the interpolated position');
    const pixel = pixels[Math.floor(pixels.length / 2)];
    const clientX = bounds.left + pixel.x,
      clientY = bounds.top + pixel.y;
    for (const type of ['pointerdown', 'pointerup'])
      canvas.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          pointerId: 9,
          pointerType: 'mouse',
          button: 0,
          clientX,
          clientY,
        }),
      );
    return {
      selection: JSON.parse(document.body.dataset.selection ?? '{}'),
      distanceFromActualAnchor: bounds.width / 2 + 6 * 2.4 * scale - pixel.x,
      silhouetteHalfWidth: 11 * UNIT_ART_SCALE * scale + 2,
    };
  });

  expect(result.distanceFromActualAnchor).toBeGreaterThan(result.silhouetteHalfWidth * 2);
  expect(result.selection).toMatchObject({ type: 'unit', id: personId, x: 256, y: 252 });
  expect(errors).toEqual([]);
});
