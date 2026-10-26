import { expect, test, type Page } from '@playwright/test';

/** Isolated hook fixtures, not a campaign; actual AudioNodes run in Chromium. */
async function audioScene(page: Page) {
  await page.goto('/');
  await page.evaluate(async () => {
    const { default: React } = await import('/node_modules/.vite/deps/react.js');
    const { default: ReactDOM } = await import('/node_modules/.vite/deps/react-dom_client.js');
    const { useGameAudio } = await import('/src/components/useGameAudio.ts');
    const { createGame, issueCommand } = await import('/src/game/engine.ts');
    const NativeContext = window.AudioContext;
    const report = { contexts: 0, closes: 0, notes: 0, resumes: 0, active: 0, state: '' };
    class ObservedContext extends NativeContext {
      constructor() {
        super();
        report.contexts++;
        report.state = this.state;
      }
      override async resume() {
        report.resumes++;
        await super.resume();
        report.state = this.state;
      }
      override async close() {
        report.closes++;
        await super.close();
        report.state = this.state;
      }
      override createOscillator() {
        const node = super.createOscillator();
        const start = node.start.bind(node),
          disconnect = node.disconnect.bind(node);
        let active = false;
        node.start = (when?: number) => {
          report.notes++;
          report.active++;
          active = true;
          start(when);
        };
        node.disconnect = () => {
          if (active) {
            active = false;
            report.active--;
          }
          disconnect();
        };
        return node;
      }
    }
    window.AudioContext = ObservedContext;
    const initial = createGame(6842);
    Object.assign(initial, { started: true, paused: true, time: 20 });
    initial.factions = [];
    initial.cities = [];
    initial.sparks = [];
    let nextId = 0;
    const api: {
      report: typeof report;
      change?: (kind: 'spark' | 'copy' | 'session') => void;
      unmount?: () => void;
    } = { report };
    Object.assign(window, { audioFixture: api });
    function Fixture() {
      const [state, setState] = React.useState(initial);
      const [enabled, setEnabled] = React.useState(false);
      const [session, setSession] = React.useState(0);
      const { unlockFromGesture } = useGameAudio(state, enabled, {
        ambience: false,
        sessionKey: session,
      });
      api.change = (kind) => {
        if (kind === 'session') setSession((value) => value + 1);
        setState((previous) =>
          kind === 'spark'
            ? {
                ...previous,
                sparks: [
                  ...previous.sparks,
                  {
                    id: `fixture-${++nextId}`,
                    wordId: 'O_03',
                    unitId: 'unit-0',
                    eventLabel: 'Esperienza',
                    expiresAt: 50,
                    recipe: ['V_03', 'V_01'],
                    hint: 'Legno',
                  },
                ],
              }
            : { ...previous },
        );
      };
      return React.createElement(
        'div',
        {},
        React.createElement(
          'button',
          {
            onClick: () => {
              if (enabled || unlockFromGesture()) setEnabled(!enabled);
            },
          },
          enabled ? 'Disattiva suoni' : 'Attiva suoni',
        ),
        React.createElement(
          'button',
          {
            onClick: () =>
              setState((previous) =>
                issueCommand(previous, ['S_01', 'V_01'], { type: 'point', x: 250, y: 255 }),
              ),
          },
          'Ordine valido',
        ),
        React.createElement(
          'button',
          {
            onClick: () => setState((previous) => issueCommand(previous, ['S_01', 'V_14'])),
          },
          'Ordine rifiutato',
        ),
        React.createElement('button', { onClick: () => api.change?.('spark') }, 'Nuova Scintilla'),
      );
    }
    document.body.innerHTML = '';
    const host = document.createElement('div');
    document.body.append(host);
    const root = ReactDOM.createRoot(host);
    api.unmount = () => root.unmount();
    root.render(React.createElement(Fixture));
  });
  await expect(page.getByRole('button', { name: 'Attiva suoni', exact: true })).toBeVisible();
}
async function report(page: Page) {
  return page.evaluate(
    () =>
      (
        window as unknown as {
          audioFixture: {
            report: {
              contexts: number;
              closes: number;
              notes: number;
              active: number;
              resumes: number;
              state: string;
            };
          };
        }
      ).audioFixture.report,
  );
}
async function frame(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

test('one gesture-unlocked context shares procedural cues and cancels future notes on mute', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await audioScene(page);
  expect((await report(page)).contexts).toBe(0);
  await page.getByRole('button', { name: 'Attiva suoni', exact: true }).click();
  await expect.poll(async () => (await report(page)).state).toBe('running');
  expect((await report(page)).notes).toBe(0);
  await page.getByRole('button', { name: 'Ordine valido', exact: true }).click();
  await expect.poll(async () => (await report(page)).notes).toBe(2);
  await page.getByRole('button', { name: 'Ordine rifiutato', exact: true }).click();
  await frame(page);
  expect((await report(page)).notes).toBe(2);
  await page.getByRole('button', { name: 'Nuova Scintilla', exact: true }).click();
  await expect.poll(async () => (await report(page)).notes).toBe(5);
  await page.evaluate(() =>
    (window as unknown as { audioFixture: { change: (kind: string) => void } }).audioFixture.change(
      'copy',
    ),
  );
  await frame(page);
  expect((await report(page)).notes).toBe(5);
  await page.getByRole('button', { name: 'Disattiva suoni', exact: true }).click();
  await expect.poll(async () => (await report(page)).active).toBe(0);
  await page.getByRole('button', { name: 'Nuova Scintilla', exact: true }).click();
  await page.getByRole('button', { name: 'Attiva suoni', exact: true }).click();
  await frame(page);
  expect((await report(page)).notes).toBe(5);
  expect((await report(page)).contexts).toBe(1);
  await page.evaluate(() =>
    (window as unknown as { audioFixture: { unmount: () => void } }).audioFixture.unmount(),
  );
  await expect.poll(async () => (await report(page)).closes).toBe(1);
  expect(errors).toEqual([]);
});

test('hidden-tab events and imported history are consumed without an audible backlog', async ({
  page,
}) => {
  await audioScene(page);
  await page.getByRole('button', { name: 'Attiva suoni', exact: true }).click();
  await expect.poll(async () => (await report(page)).state).toBe('running');
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await frame(page);
  await page.evaluate(() =>
    (window as unknown as { audioFixture: { change: (kind: string) => void } }).audioFixture.change(
      'spark',
    ),
  );
  await frame(page);
  const resumes = (await report(page)).resumes;
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await frame(page);
  expect((await report(page)).notes).toBe(0);
  expect((await report(page)).resumes).toBe(resumes);
  await page.evaluate(() => {
    const fixture = (window as unknown as { audioFixture: { change: (kind: string) => void } })
      .audioFixture;
    fixture.change('spark');
    fixture.change('session');
  });
  await frame(page);
  expect((await report(page)).notes).toBe(0);
  await page.getByRole('button', { name: 'Ordine valido', exact: true }).click();
  await expect.poll(async () => (await report(page)).notes).toBe(2);
  expect((await report(page)).contexts).toBe(1);
});
