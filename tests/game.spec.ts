import { expect, test, type Page } from '@playwright/test';
import { openWordBank } from './mobile-ui';

const SAVE_KEY = 'lingus.save.v2';

async function begin(page: Page) {
  await page.goto('/');
  // These conformance cases intentionally click the canonical GDD coordinates.
  // Procedural defaults and seed controls are covered in map-generation.spec.ts.
  await page.getByRole('button', { name: /^Seed Zero/ }).click();
  await page.getByRole('button', { name: 'Dai inizio alla storia' }).click();
}
async function closePanel(page: Page) {
  await page.getByRole('button', { name: 'Chiudi finestra' }).click();
}
async function saveAndRead(page: Page) {
  await page.getByRole('button', { name: 'Impostazioni e salvataggi' }).click();
  await page.getByRole('button', { name: /Salva adesso/ }).click();
  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), SAVE_KEY);
  await closePanel(page);
  return saved;
}
async function worldClick(page: Page, x: number, y: number, zoom = 4.5, offset = 0) {
  const canvas = page.getByRole('img', { name: /Mappa della valle/ }),
    bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  const scale = Math.max(bounds!.width / 1200, bounds!.height / 800) * zoom;
  await canvas.click({
    position: {
      x: bounds!.width / 2 + (x - 250) * 2.4 * scale,
      y: bounds!.height / 2 + ((y - 250) * 1.6 - offset) * scale,
    },
  });
}
async function seed(
  page: Page,
  scenario:
    | 'campfire'
    | 'dogma'
    | 'empire'
    | 'cultural'
    | 'qualitative'
    | 'spark-error'
    | 'cognitive'
    | 'metallurgy'
    | 'dogma-qualitative'
    | 'border-foreign'
    | 'border-inactive'
    | 'border-active',
) {
  await page.goto('/');
  const fixture = await page.evaluate(
    async ({ scenario }) => {
      const { createGame } = await import('/src/game/engine.ts');
      const { WORD_ORDER, emptyInventory, HOME, BUILDING_SPECS } = await import(
        '/src/game/content.ts'
      );
      const game = createGame(6842);
      game.started = true;
      game.paused = true;
      const learn = (id: string, retention = 100) => {
        game.words[id] = {
          retention,
          custodians: [game.units[0].id],
          uses: 0,
          investment: 0,
          support: 0,
        };
        if (!game.units[0].knows.includes(id)) game.units[0].knows.push(id);
      };
      if (scenario === 'spark-error') {
        game.tension.O_04 = 100;
        game.units[0].tension = { O_04: 100 };
        game.sparks.push({
          id: 'fixture-spark',
          wordId: 'O_04',
          unitId: game.units[0].id,
          eventLabel: 'Una caccia diventa nutrimento',
          expiresAt: 45,
          recipe: ['V_03', 'V_02'],
          hint: 'Colpire e poi mangiare lega due esperienze.',
        });
      }
      if (scenario === 'campfire') {
        learn('O_03', 40);
        learn('O_05', 70);
        learn('O_08', 70);
        game.buildings.push({
          id: 'fixture-fire',
          kind: 'campfire',
          ...HOME,
          hp: 100,
          active: true,
          workerIds: [],
        });
        game.attention = 30;
        game.campfirePending = true;
      }
      if (scenario === 'dogma' || scenario === 'dogma-qualitative') {
        if (scenario === 'dogma') learn('O_08');
        for (const word of ['O_02', 'M_03', 'M_01', 'C_01', 'V_05']) learn(word);
        game.tier = 2;
        game.time = 65;
        game.cohesion = 40;
        game.recentTrauma = { tag: 'ENV_ALLY_DAMAGED', time: 64 };
        game.buildings.push({
          id: 'fixture-menhir',
          kind: 'menhir',
          ...HOME,
          hp: 500,
          active: true,
        });
      }
      if (scenario.startsWith('border-')) {
        learn('O_10');
        game.tier = 2;
        const foreign = game.cities[0];
        game.buildings.push({
          id: 'fixture-palace',
          kind: 'palace',
          x: 250,
          y: 250,
          hp: 1200,
          active: scenario !== 'border-inactive',
          cityId: scenario === 'border-foreign' ? foreign.id : undefined,
        });
      }
      if (scenario === 'cognitive' || scenario === 'metallurgy') {
        game.tier = 2;
        learn('O_03', 40);
        const ore = game.entities.find((e) => e.kind === 'ore')!;
        ore.x = 260;
        ore.y = 250;
        if (scenario === 'metallurgy') learn('O_07');
      }
      if (scenario === 'qualitative') {
        learn('M_02');
        game.resources.food = 17;
        game.resources.meat = 3;
        game.resources.wood = 12;
      }
      if (scenario === 'empire' || scenario === 'cultural') {
        for (const word of WORD_ORDER) learn(word);
        game.tier = 5;
        game.voice = 5;
        game.urbanized = true;
        game.kingId = game.units[0].id;
        game.units[0].isKing = true;
        game.government = 'monarchy';
        const resources = emptyInventory();
        resources.food = 70;
        resources.wood = 100;
        resources.stone = 100;
        resources.coin = 1000;
        game.resources = { ...resources };
        game.cities.push({
          id: 'fixture-capital',
          name: 'La Città delle Voci',
          x: 250,
          y: 250,
          sectorX: 2,
          sectorY: 2,
          factionId: 'player',
          cohorts: { workers: 120, warriors: 20, sages: 20, slaves: 0 },
          resources,
          words: [...WORD_ORDER],
          dogmas: [],
          revoltTension: 0,
          housing: 200,
          buildingIds: [],
          vocations: [],
          loyalty: 100,
          assimilation: { delegateCount: 0, active: false },
          production: emptyInventory(),
          capital: true,
          garrisonHp: 200,
        });
        game.sectors.find((s) => s.x === 2 && s.y === 2)!.cityId = 'fixture-capital';
        game.traditions.push({
          id: 'fixture-tradition',
          tokens: ['C_02', 'S_03', 'V_03', 'O_04', 'M_02'],
          name: 'Cacciatori',
          createdAt: 0,
        });
        game.laws.push({
          id: 'fixture-law',
          tokens: ['S_09', 'V_04', 'O_11', 'O_07', 'C_03', 'S_06'],
          name: 'Tributo',
          subjectId: 'S_09',
          verbId: 'V_04',
          objectId: 'O_11',
          modifierId: 'O_07',
          sanctionId: 'S_06',
          prohibitive: false,
          age: 0,
        });
        if (scenario === 'empire') {
          const capital = game.cities.find((c) => c.id === 'fixture-capital')!;
          for (const kind of [
            'walls',
            'market',
            'court',
            'temple',
            'archive',
            'school',
            'workshop',
          ] as const) {
            const id = `fixture-${kind}`;
            game.buildings.push({
              id,
              kind,
              ...HOME,
              hp: BUILDING_SPECS[kind].maxHp,
              active: true,
              cityId: capital.id,
              lastEfficiency: 1,
              workerIds: [],
            });
            capital.buildingIds.push(id);
          }
        }
        if (scenario === 'cultural') {
          game.buildings.push({
            id: 'fixture-archive',
            kind: 'archive',
            ...HOME,
            hp: 350,
            active: true,
            cityId: 'fixture-capital',
            lastEfficiency: 1,
            workerIds: [],
          });
          for (const faction of game.factions) faction.words = [...WORD_ORDER];
        }
      }
      return JSON.stringify(game);
    },
    { scenario },
  );
  // Seed the next document after the previous page has persisted its own state on unload.
  // A per-fixture session marker leaves subsequent actual save/reload operations untouched.
  await page.addInitScript(
    ({ key, raw, marker }) => {
      if (!sessionStorage.getItem(marker)) {
        localStorage.setItem(key, raw);
        sessionStorage.setItem(marker, 'applied');
      }
    },
    { key: SAVE_KEY, raw: fixture, marker: `lingus.fixture.${scenario}.${Date.now()}` },
  );
  await page.reload();
}

test('a real Guided order understands Legno without a puzzle and the save survives reload', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await begin(page);
  // The contextual bank starts with subjects, then reveals the known verbs.
  await expect(page.locator('.word-shelf .word-tile')).toHaveCount(1);
  await expect(page.getByRole('button', { name: /^Gruppo:/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Colpire:/ })).toHaveCount(0);
  await expect(page.locator('.sentence-slot')).toHaveCount(2);
  await expect(page.locator('.day-cycle')).toHaveCount(0);
  await expect(page.locator('.world-resources')).not.toContainText('Cibo');
  await page.screenshot({ path: '/tmp/lingus-fidelity-initial.png', fullPage: true });
  await page.getByRole('button', { name: 'Velocità 4x' }).click();
  await page.getByRole('button', { name: /^Gruppo:/ }).click();
  await expect(page.locator('.word-shelf .word-tile')).toHaveCount(3);
  await page.getByRole('button', { name: /^Colpire:/ }).click();
  // Initial map is the central 100m sector of a 500m world, zoomed 4.5×.
  await worldClick(page, 223, 229, 4.5, 3);
  await expect(page.locator('.map-toolbar')).toContainText('Un ostacolo senza nome');
  await page.getByRole('button', { name: 'Pronuncia', exact: true }).click();
  await expect(page.locator('.toast')).toContainText('La tribù ha ascoltato');
  const understanding = page.locator('.contextual-discovery-notice');
  await expect(understanding).toContainText('La tribù comprende «Legno»', { timeout: 22_000 });
  await expect(page.getByRole('dialog', { name: 'La Scintilla Cognitiva' })).toHaveCount(0);
  // Understanding a material does not stop the world; pause explicitly to inspect
  // its actual first custodian and inventory before the next experience matures.
  await page.getByRole('button', { name: 'Metti in pausa', exact: true }).click();
  await page
    .getByRole('group', { name: 'Filtra le parole' })
    .getByRole('button', { name: 'Tutte', exact: true })
    .click();
  await expect(page.getByRole('button', { name: /^Legno:/ })).toBeVisible();
  await expect(page.locator('.word-shelf .word-tile')).toHaveCount(5);
  const saved = await saveAndRead(page);

  expect(saved.version).toBe(2);
  expect(saved.openingBalanceVersion).toBe(1);
  expect(saved.openingCouncilsCompleted).toBe(0);
  expect(saved.words.O_03.retention).toBe(50);
  expect(saved.words.O_03.custodians).toHaveLength(1);
  expect(saved.words.O_03.learnedRecipe).toEqual(['V_03']);
  expect(saved.sparks.some((spark: { wordId: string }) => spark.wordId === 'O_03')).toBe(false);
  expect(saved.stats.commands).toBe(1);
  expect(saved.resources.wood).toBe(0); // No invented stored materials before carrying is known.
  await page.reload();
  await expect(page.getByRole('button', { name: 'Solo compatibili', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page
    .getByRole('group', { name: 'Filtra le parole' })
    .getByRole('button', { name: 'Tutte', exact: true })
    .click();
  await expect(page.getByRole('button', { name: /^Legno:/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Riprendi il tempo' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('controls, cognitive HUD, and rejection of malformed imports preserve the seven-person seed', async ({
  page,
}) => {
  await begin(page);
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: 'Riprendi il tempo' })).toBeVisible();
  await page.keyboard.press('Digit3');
  await expect(page.getByRole('button', { name: 'Velocità 4x' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page
    .getByRole('group', { name: 'Filtra le parole' })
    .getByRole('button', { name: 'Azione', exact: true })
    .click();
  await expect(page.locator('.word-shelf .word-tile')).toHaveCount(3);
  await page
    .getByRole('group', { name: 'Filtra le parole' })
    .getByRole('button', { name: 'Tutte', exact: true })
    .click();
  await page.getByRole('button', { name: 'Come si gioca' }).click();
  await expect(page.getByRole('dialog', { name: 'Come si gioca' })).toContainText(
    'Impara a dire il mondo',
  );
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Impostazioni e salvataggi' }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: 'incomplete.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"version":2,"time":0,"units":[]}'),
  });
  await expect(page.locator('.toast')).toContainText('Impossibile aprire il file');
  await closePanel(page);
  await expect(page.locator('.unit-card')).toHaveCount(7);
  await seed(page, 'qualitative');
  await expect(page.locator('.world-resources')).toContainText('Molto');
  await expect(page.locator('.world-resources')).not.toContainText('20');
  await expect(page.locator('.world-resources')).not.toContainText('12');
});

test('a failed two-token intuition preserves gold feedback and pays the exact tension and cooldown penalty', async ({
  page,
}) => {
  await seed(page, 'spark-error');
  await page.getByRole('button', { name: /Segui l’intuizione/ }).click();
  const puzzle = page.getByRole('dialog', { name: 'La Scintilla Cognitiva' });
  await puzzle.getByRole('button', { name: /^Colpire:/ }).click();
  await puzzle.getByRole('button', { name: /^Andare:/ }).click();
  await puzzle.getByRole('button', { name: 'Dai un nome all’intuizione' }).click();
  await expect(puzzle.locator('.puzzle-slot.is-correct')).toContainText('Colpire');
  await expect(puzzle.locator('.puzzle-slot.is-incorrect')).toContainText('Andare');
  await expect(puzzle).toContainText('quindici secondi');
  await page.screenshot({ path: '/tmp/lingus-fidelity-spark-feedback.png', fullPage: true });
  await expect(puzzle).not.toBeVisible({ timeout: 6000 });
  const saved = await saveAndRead(page);
  expect(saved.words.O_04).toBeUndefined();
  expect(saved.sparks).toHaveLength(0);
  expect(saved.tension.O_04).toBe(65);
  expect(saved.units[0].tension.O_04).toBe(65);
  expect(saved.cooldowns.O_04 - saved.time).toBe(15);
});

test('teaching uses real Attention and seasonal erosion is applied on leaving the campfire', async ({
  page,
}) => {
  await seed(page, 'campfire');
  const campfire = page.getByRole('dialog', { name: 'Attorno al falò' });
  await expect(campfire).toBeVisible();
  const wood = campfire.locator('.teaching-row').filter({ hasText: 'Legno' });
  await expect(wood).toContainText('Memoria 40%');
  await wood.getByRole('button', { name: /Tramanda/ }).click();
  await expect(wood).toContainText('Memoria 50%');
  await expect(wood).toContainText('2 custodi');
  await expect(campfire.locator('.attention-counter')).toContainText('20');
  await campfire.getByRole('button', { name: 'Custodiamo queste parole' }).click();
  const saved = await saveAndRead(page);
  // +10 from teaching, then -3*K (Legno complexity1). No grace period or second teaching bonus.
  expect(saved.words.O_03.retention).toBe(47);
  expect(saved.words.O_03.custodians).toHaveLength(2);
  expect(saved.attention).toBe(20);
  expect(saved.stats.taught).toBe(1);
  expect(saved.campfirePending).toBe(false);
});

test('a trauma-linked night taboo restores cohesion, blocks commands, and exact abolition cost is paid', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await seed(page, 'dogma');
  await page.getByRole('button', { name: /^La Pietra Sacra/ }).click();
  const stone = page.getByRole('dialog', { name: 'La Pietra Sacra' });
  await stone.getByLabel('Un concetto').selectOption('C_01');
  await stone.getByLabel('Una regola').selectOption('M_01');
  await expect(stone.locator('.dogma-preview')).toContainText('notte');
  await stone.getByRole('button', { name: 'Scolpisci il dogma' }).click();
  await expect(stone.locator('.dogma-list')).toContainText('Peso culturale 10.0');
  await closePanel(page);
  const healed = await saveAndRead(page);
  expect(healed.cohesion).toBe(80);
  expect(healed.dogmas).toHaveLength(1);
  await page.getByRole('button', { name: /^Gruppo:/ }).click();
  await page.getByRole('button', { name: /^Andare:/ }).click();
  await worldClick(page, 250, 238);
  await expect(page.locator('.sentence-feedback')).toContainText('Tabù delle Tenebre');
  await page.getByRole('button', { name: 'Pronuncia', exact: true }).click();
  await expect(page.locator('.toast')).toContainText('Tabù delle Tenebre');
  const blocked = await saveAndRead(page);
  expect(blocked.stats.commands).toBe(0);
  expect(blocked.voice).toBe(3);
  await page.getByRole('button', { name: /^La Pietra Sacra/ }).click();
  await stone.getByRole('button', { name: /Abolisci/ }).click();
  await expect(stone.locator('.dogma-list article')).toHaveCount(0);
  await closePanel(page);
  const abolished = await saveAndRead(page);
  expect(abolished.cohesion).toBe(70);
  expect(abolished.dogmas).toHaveLength(0);
  expect(abolished.gameOver).toBeNull();
  expect(errors).toEqual([]);
});

test('the six-slot Iron Age exposes all45 words,20 recipes, city cohorts, traditions and law removal', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await seed(page, 'empire');
  await expect(page.locator('.era-heading')).toContainText('Età del Ferro');
  await expect(page.locator('.sentence-slot')).toHaveCount(6);
  await expect(page.locator('.voice-pip')).toHaveCount(5);
  await expect(page.getByRole('button', { name: 'Solo compatibili', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page
    .getByRole('group', { name: 'Filtra le parole' })
    .getByRole('button', { name: 'Tutte', exact: true })
    .click();
  await expect(page.locator('.word-shelf .word-tile')).toHaveCount(45);
  await page.screenshot({ path: '/tmp/lingus-fidelity-iron.png', fullPage: true });
  await page.getByRole('button', { name: /Le frasi della materia/ }).click();
  const institutions = page.getByRole('dialog', { name: 'La civiltà delle parole' });
  await expect(institutions.locator('.building-codex article')).toHaveCount(20);
  await closePanel(page);
  await page.getByRole('button', { name: /Tradizioni e mestieri/ }).click();
  await expect(institutions.locator('.institution-count')).toContainText('1/8');
  await institutions.getByRole('button', { name: 'Rimuovi tradizione Cacciatori' }).click();
  await expect(institutions.locator('.institution-count')).toContainText('0/8');
  await closePanel(page);
  await page.getByRole('button', { name: /Il codice dello Stato/ }).click();
  await expect(institutions.locator('.institution-count')).toContainText('1/6');
  await institutions.getByRole('button', { name: 'Abroga', exact: true }).click();
  await expect(institutions.locator('.institution-count')).toContainText('0/6');
  await closePanel(page);
  await page.getByRole('button', { name: /Osserva la capitale/ }).click();
  await expect(institutions).toContainText('La Città delle Voci');
  await expect(institutions.locator('.city-cohorts>div')).toHaveCount(4);
  await expect(institutions).toContainText('120');
  await closePanel(page);
  const saved = await saveAndRead(page);
  expect(saved.traditions).toHaveLength(0);
  expect(saved.laws).toHaveLength(0);
  expect(errors).toEqual([]);
});

test('the cultural victory is triggered by the simulation and presented as a final achievement', async ({
  page,
}) => {
  await seed(page, 'cultural');
  await page.getByRole('button', { name: 'Riprendi il tempo' }).click();
  const victory = page.getByRole('dialog', { name: 'Una civiltà ha lasciato il suo segno' });
  await expect(victory).toContainText('La Biblioteca Universale');
  await victory.getByRole('button', { name: 'Osserva la tua civiltà' }).click();
  const institutions = page.getByRole('dialog', { name: 'La civiltà delle parole' });
  await expect(institutions.locator('.victory-paths article')).toHaveCount(3);
  await expect(institutions).toContainText('45/45 parole a memoria piena');
  await closePanel(page);
  const saved = await saveAndRead(page);
  expect(saved.victory).toBe('cultural');
});

test('mobile layout preserves map interactions and six-slot composition without page overflow', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await begin(page);
  const canvas = page.getByRole('img', { name: /Mappa della valle/ });
  await expect(canvas).toBeVisible();
  const bounds = await canvas.boundingBox();
  expect(bounds!.width).toBeGreaterThan(300);
  expect(bounds!.height).toBeGreaterThan(300);
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true);
  await page.getByRole('button', { name: 'Ingrandisci la mappa' }).click();
  await expect(page.locator('.lingus-world__control-stack')).toContainText('480');
  await seed(page, 'empire');
  await expect(page.locator('.sentence-slot')).toHaveCount(6);
  await openWordBank(page);
  for (const name of ['Città', 'Portare', 'Tributo', 'Metallo', 'Altrimenti', 'Schiavo'])
    await page.getByRole('button', { name: new RegExp(`^${name}:`) }).click();
  await expect(page.locator('.sentence-slot.filled')).toHaveCount(6);
  await expect(page.getByRole('button', { name: 'Pronuncia', exact: true })).toBeEnabled();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true);
  await page.getByRole('button', { name: 'Impostazioni e salvataggi' }).click();
  await expect(page.getByRole('dialog', { name: 'Impostazioni e salvataggi' })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true);
  await page.screenshot({ path: '/tmp/lingus-fidelity-mobile.png', fullPage: true });
});

test('cognitive panels hide unknown recipes and exact memory before Numero', async ({ page }) => {
  await seed(page, 'cognitive');
  await page.getByRole('button', { name: /Le frasi della materia/ }).click();
  const codex = page.getByRole('dialog', { name: 'La civiltà delle parole' });
  await expect(codex.locator('.building-codex article')).toHaveCount(0);
  await expect(codex).not.toContainText('Archivio reale');
  await expect(codex).not.toContainText('Metallo');
  await closePanel(page);
  await page.getByRole('button', { name: /Il lessico della tribù/ }).click();
  const memory = page
    .locator('.dictionary-entry')
    .filter({ hasText: 'Legno' })
    .locator('.dictionary-memory');
  await expect(memory).toContainText('Memoria fragile');
  await expect(memory).not.toContainText('%');
  await expect(memory).toContainText('Pochi custodi');
  await closePanel(page);
  await worldClick(page, 238, 233);
  await expect(page.locator('.map-toolbar')).toContainText('Un ostacolo senza nome');
  await worldClick(page, 260, 250);
  await expect(page.locator('.map-toolbar')).not.toContainText('Vena mineraria');
  await seed(page, 'metallurgy');
  await worldClick(page, 260, 250);
  await expect(page.locator('.map-toolbar')).toContainText('Vena mineraria');
});

test('a dogma shows qualitative roots and abolition cost before Numero', async ({ page }) => {
  await seed(page, 'dogma-qualitative');
  await page.getByRole('button', { name: /^La Pietra Sacra/ }).click();
  const stone = page.getByRole('dialog', { name: 'La Pietra Sacra' });
  await stone.getByLabel('Un concetto').selectOption('C_01');
  await stone.getByLabel('Una regola').selectOption('M_01');
  await stone.getByRole('button', { name: 'Scolpisci il dogma' }).click();
  await expect(stone.locator('.dogma-list')).toContainText('Radicamento recente');
  await expect(stone.locator('.dogma-list')).not.toContainText('10.0');
  await expect(stone.locator('.dogma-list')).not.toContainText('−10');
  await expect(stone.getByRole('button', { name: /Abolisci/ })).toContainText(
    'Indebolisce la coesione',
  );
});

test('drawn borders expand only for an active palace belonging to the player', async ({ page }) => {
  await page.addInitScript(() => {
    const original = CanvasRenderingContext2D.prototype.ellipse;
    CanvasRenderingContext2D.prototype.ellipse = function (...args: Parameters<typeof original>) {
      if (
        args[0] === 600 &&
        args[1] === 400 &&
        Math.abs(this.lineWidth - 0.6) < 0.0001 &&
        this.getLineDash().join(',') === '3,3'
      ) {
        (window as unknown as { observedBorder: number }).observedBorder = args[2] / 2.4;
      }
      return original.apply(this, args);
    };
  });
  for (const [scenario, expected] of [
    ['border-foreign', 35],
    ['border-inactive', 35],
    ['border-active', 100],
  ] as const) {
    await seed(page, scenario);
    await expect
      .poll(() =>
        page.evaluate(() => (window as unknown as { observedBorder: number }).observedBorder),
      )
      .toBe(expected);
  }
});
