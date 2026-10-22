import { describe, expect, it } from 'vitest';
import { replayOrdinaryFirstYear } from '../../tests/scenarios/ordinaryGrowth';
import { HOME, INNATE_WORDS, WORDS } from './content';
import {
  compileSentence,
  createGame,
  dismissCampfire,
  getSeason,
  hasWord,
  inscribeDogma,
  issueCommand,
  parseGame,
  removeDogma,
  serializeGame,
  solveSpark,
  teachWord,
  tick,
} from './engine';
import type { GameState, Spark } from './types';
import { canIgnite, processWork, seasonalCore, tryIgnite } from './simulation';

function running(seed = 18473) {
  return { ...createGame(seed), started: true };
}
function unlock(s: GameState, ids: string[], retention = 100) {
  for (const id of ids) {
    s.words[id] = { retention, custodians: [s.units[0].id], uses: 0 };
    s.units[0].knows.push(id);
  }
  return s;
}
function advance(s: GameState, seconds: number) {
  let next = s;
  for (let i = 0; i < seconds; i++) {
    next = tick(next, 1);
    if (next.campfirePending) next = dismissCampfire(next);
  }
  return next;
}
function spark(s: GameState, wordId: string): Spark {
  const p = {
    id: `spark-${wordId}`,
    wordId,
    unitId: s.units[0].id,
    eventLabel: WORDS[wordId].event,
    expiresAt: s.time + 45,
    recipe: WORDS[wordId].recipe,
    hint: WORDS[wordId].hint,
  };
  s.sparks.push(p);
  s.tension[wordId] = 100;
  return p;
}

describe('first voices and grammar', () => {
  it('starts with seven people, four innate words and two slots', () => {
    const s = createGame();
    expect(s.units).toHaveLength(7);
    expect(Object.keys(s.words)).toEqual(INNATE_WORDS);
    expect(s.tier).toBe(0);
    expect(s.resources.food).toBe(0);
    expect(s.buildings).toHaveLength(0);
    expect(s.units.find((u) => u.name === 'Korg')?.strength).toBe(8);
    expect(s.units.find((u) => u.name === 'Uma')?.age).toBe(14);
  });
  it('rejects malformed grammar, unknown words and too many words', () => {
    const s = running();
    expect(compileSentence(s, ['V_01', 'S_01']).valid).toBe(false);
    expect(compileSentence(s, ['S_01', 'O_01']).valid).toBe(false);
    expect(compileSentence(s, ['S_01', 'V_03', 'O_02']).valid).toBe(false);
    expect(compileSentence(s, ['S_01', 'V_01']).requiresTarget).toBe(true);
  });
  it('accepts the corrected Tier1 implicit carrying destination', () => {
    const s = unlock(running(), ['V_04', 'O_02', 'O_01']);
    s.tier = 1;
    const result = compileSentence(s, ['S_01', 'V_04', 'O_02']);
    expect(result.valid).toBe(true);
    expect(result.requiresTarget).toBe(false);
  });
  it('lets the grammatical object override a stale map target', () => {
    const s = unlock(running(), ['V_04', 'O_02']);
    s.tier = 1;
    const tree = s.entities.find((e) => e.kind === 'tree')!;
    const next = issueCommand(s, ['S_01', 'V_04', 'O_02'], {
      type: 'entity',
      id: tree.id,
      x: tree.x,
      y: tree.y,
    });
    const worker = next.units.find((u) => u.action === 'gathering')!;
    expect(next.entities.find((e) => e.id === worker.targetId)?.kind).toBe('stone');
  });
  it('lets the explicit home destination override a stale map target', () => {
    const s = unlock(running(), ['O_01']);
    s.tier = 1;
    const tree = s.entities.find((e) => e.kind === 'tree')!;
    const next = issueCommand(s, ['S_01', 'V_01', 'O_01'], {
      type: 'entity',
      id: tree.id,
      x: tree.x,
      y: tree.y,
    });
    expect(next.units[0].tx).toBe(HOME.x);
    expect(next.units[0].ty).toBe(HOME.y);
  });
  it('rejects an empty-ground eating/striking target before charging voice', () => {
    const s = running(),
      target = { type: 'point' as const, x: 20, y: 20 };
    expect(compileSentence(s, ['S_01', 'V_02'], target).valid).toBe(false);
    expect(compileSentence(s, ['S_01', 'V_03'], target).valid).toBe(false);
  });
  it('validates a command before spending voice or materials', () => {
    const s = running(),
      next = issueCommand(s, ['S_01', 'V_02'], {
        type: 'entity',
        id: s.entities.find((e) => e.kind === 'tree')!.id,
        x: 39,
        y: 40,
      });
    expect(next.voice).toBe(3);
    expect(next.stats.commands).toBe(0);
    expect(next.logs[0].tone).toBe('warning');
  });
  it('uses one voice and regenerates at one per ten simulated seconds', () => {
    const s = issueCommand(running(), ['S_01', 'V_01'], { type: 'point', x: 60, y: 60 });
    expect(s.voice).toBe(2);
    expect(advance(s, 9).voice).toBe(2);
    expect(advance(s, 10).voice).toBe(3);
  });
});

describe('work, discoveries and the expanding interface', () => {
  it('generates a real work-event intuition by striking a tree', () => {
    let s = running();
    const tree = s.entities.find((e) => e.kind === 'tree')!;
    s = issueCommand(s, ['S_01', 'V_03'], { type: 'entity', id: tree.id, x: tree.x, y: tree.y });
    s = advance(s, 25);
    expect(s.sparks.some((p) => p.wordId === 'O_03')).toBe(true);
    expect(s.words.O_03).toBeUndefined();
  });
  it('unlocks a solved idea at retention50 with a living custodian', () => {
    const s = running(),
      p = spark(s, 'O_03'),
      next = solveSpark(s, p.id, ['V_03']);
    expect(next.words.O_03.retention).toBe(50);
    expect(next.words.O_03.custodians).toEqual([s.units[0].id]);
    expect(next.units[0].knows).toContain('O_03');
    expect(next.sparks).toHaveLength(0);
  });
  it('penalizes an incorrect deduction without unlocking the word', () => {
    const s = running(),
      p = spark(s, 'O_03'),
      next = solveSpark(s, p.id, ['V_02']);
    expect(hasWord(next, 'O_03')).toBe(false);
    expect(next.tension.O_03).toBe(65);
    expect(next.cooldowns.O_03).toBe(15);
    expect(next.sparks).toHaveLength(0);
  });
  it('checks duplicate ingredients in the knapping recipe', () => {
    const s = unlock(running(), ['O_02']),
      p = spark(s, 'V_06');
    expect(hasWord(solveSpark(s, p.id, ['V_03', 'O_02']), 'V_06')).toBe(false);
    expect(hasWord(solveSpark(s, p.id, ['O_02', 'V_03', 'O_02']), 'V_06')).toBe(true);
  });
  it('requires the vocabulary threshold and self/home catalyst for Tier1', () => {
    let s = unlock(running(), ['O_03']);
    let p = spark(s, 'O_02');
    s = solveSpark(s, p.id, ['V_03']);
    expect(s.tier).toBe(0);
    p = spark(s, 'S_02');
    s = solveSpark(s, p.id, ['S_01']);
    expect(s.tier).toBe(1);
  });
  it('requires eight stable words and fire/tomorrow for Tier2', () => {
    let s = unlock(running(), ['S_02', 'O_03', 'O_02', 'C_01']);
    s.tier = 1;
    const p = spark(s, 'O_05');
    p.recipe = ['O_03'];
    s = solveSpark(s, p.id, ['O_03']);
    expect(s.tier).toBe(2);
    expect(s.buildings.some((b) => b.kind === 'campfire')).toBe(false);
    expect(s.resources.wood).toBe(0);
  });
  it('carrying walks to a node and returns a resource to the camp', () => {
    let s = unlock(running(), ['V_04', 'O_02']);
    s.tier = 1;
    s = issueCommand(s, ['S_01', 'V_04', 'O_02']);
    s = advance(s, 30);
    expect(s.resources.stone).toBeGreaterThan(0);
    expect(s.entities.find((e) => e.kind === 'stone')!.amount).toBeLessThan(100);
  });
  it('pays and creates one spear per group order, rather than per worker', () => {
    let s = unlock(running(), ['O_02', 'O_03', 'V_06']);
    s.tier = 2;
    s.resources.stone = 10;
    s.resources.wood = 10;
    s = issueCommand(s, ['S_01', 'V_06', 'O_02', 'O_03']);
    expect(s.resources.stone).toBe(9);
    expect(s.resources.wood).toBe(9);
    s = advance(s, 15);
    expect(s.resources.spear).toBe(1);
  });
  it('does not extract or destroy materials when the shared store is full', () => {
    let s = unlock(running(), ['V_04', 'O_03']);
    s.tier = 1;
    s.resources.stone = 30;
    const before = s.entities.filter((e) => e.kind === 'tree').reduce((n, e) => n + e.amount, 0);
    s = advance(issueCommand(s, ['S_01', 'V_04', 'O_03']), 25);
    expect(s.resources.wood).toBe(0);
    expect(s.entities.filter((e) => e.kind === 'tree').reduce((n, e) => n + e.amount, 0)).toBe(
      before,
    );
  });
  it('does not duplicate an extinguished campfire when fire is rediscovered', () => {
    const s = unlock(running(), ['O_03', 'O_05']);
    s.words.O_05.retention = 0;
    s.resources.wood = 0;
    s.buildings.push({
      id: 'oldfire',
      kind: 'campfire',
      x: HOME.x,
      y: HOME.y,
      hp: 80,
      active: false,
    });
    const p = spark(s, 'O_05'),
      next = solveSpark(s, p.id, ['O_03']);
    expect(next.buildings.filter((b) => b.kind === 'campfire')).toHaveLength(1);
    expect(next.resources.wood).toBe(0);
  });
  it('can build the sacred stone with the actual20-stone recipe', () => {
    let s = unlock(running(), ['O_02', 'M_03', 'V_06']);
    s.tier = 2;
    s.resources.stone = 30;
    expect(compileSentence(s, ['S_01', 'V_06', 'O_02', 'M_03']).valid).toBe(true);
    s = issueCommand(s, ['S_01', 'V_06', 'O_02', 'M_03']);
    expect(s.resources.stone).toBe(10);
    s = advance(s, 15);
    expect(s.buildings.some((b) => b.kind === 'menhir')).toBe(true);
  });
});

describe('seasonal survival and memory', () => {
  it('does not advance before start, while paused or at the campfire', () => {
    const s = createGame();
    expect(tick(s, 1)).toBe(s);
    s.started = true;
    s.paused = true;
    expect(tick(s, 1)).toBe(s);
    s.paused = false;
    s.campfirePending = true;
    expect(tick(s, 1)).toBe(s);
  });
  it('uses the final90s season,60s day and30s night calibration', () => {
    const s = running();
    s.time = 59;
    expect(getSeason(s).isNight).toBe(false);
    s.time = 60;
    expect(getSeason(s).isNight).toBe(true);
    s.time = 90;
    expect(getSeason(s).name).toBe('Estate');
    s.time = 360;
    expect(getSeason(s).year).toBe(2);
  });
  it('eats real finite food instead of silently replenishing hunger', () => {
    let s = running();
    for (const u of s.units) {
      u.x = HOME.x;
      u.y = HOME.y;
      u.hunger = 70;
    }
    const before = s.entities.filter((e) => e.kind === 'berries').reduce((n, e) => n + e.amount, 0);
    s = advance(s, 15);
    expect(s.units.some((u) => u.hunger < 30)).toBe(true);
    expect(
      s.entities.filter((e) => e.kind === 'berries').reduce((n, e) => n + e.amount, 0),
    ).toBeLessThan(before);
  });
  it('consumes a fractional cooked meal without negative stock', () => {
    let s = running();
    s.resources.cooked = 0.5;
    for (const u of s.units) {
      u.x = HOME.x;
      u.y = HOME.y;
      u.hunger = 70;
    }
    s = tick(s, 0.25);
    expect(s.resources.cooked).toBe(0);
    expect(s.units[0].hunger).toBeCloseTo(40.2);
  });
  it('burns wood, pauses for the campfire and erodes word retention', () => {
    let s = unlock(running(), ['O_03'], 90);
    s.time = 359;
    s.resources.wood = 10;
    s.buildings.push({
      id: 'testfire',
      kind: 'campfire',
      x: HOME.x,
      y: HOME.y,
      hp: 100,
      active: true,
    });
    s = tick(s, 2);
    expect(s.campfirePending).toBe(true);
    s = dismissCampfire(s);
    expect(s.words.O_03.retention).toBe(87);
    expect(s.resources.wood).toBeLessThan(10);
    expect(s.attention).toBe(0);
  });
  it('transmits a word to a new custodian for ten attention', () => {
    let s = unlock(running(), ['O_03'], 50);
    s.buildings.push({
      id: 'testfire',
      kind: 'campfire',
      x: HOME.x,
      y: HOME.y,
      hp: 100,
      active: true,
    });
    s.attention = 30;
    s = teachWord(s, 'O_03');
    expect(s.attention).toBe(20);
    expect(s.words.O_03.retention).toBe(60);
    expect(s.words.O_03.custodians).toHaveLength(2);
    expect(s.units.find((u) => u.id === s.words.O_03.custodians[1])!.knows).toContain('O_03');
  });
  it('loses a word when its sole custodian dies', () => {
    let s = unlock(running(), ['O_03']);
    s.units[0].hunger = 100;
    s.units[0].hp = 0.1;
    s.units[0].x = 2;
    s.units[0].y = 2;
    s = tick(s, 1);
    expect(s.units[0].hp).toBe(0);
    expect(s.words.O_03.retention).toBe(0);
    expect(s.stats.deaths).toBe(1);
    expect(s.entities.some((e) => e.kind === 'corpse')).toBe(true);
  });
  it('calculates cold damage in winter away from heat and shelter', () => {
    let s = running();
    s.time = 300;
    s.units[0].temp = 15;
    s.units[0].hunger = 50;
    const hp = s.units[0].hp;
    s = tick(s, 1);
    expect(s.units[0].temp).toBeLessThan(15);
    expect(s.units[0].hp).toBeLessThan(hp);
  });
  it('finishes the story on biological extinction', () => {
    const s = running();
    for (const u of s.units) {
      u.hp = 0.1;
      u.hunger = 100;
    }
    const next = tick(s, 1);
    expect(next.gameOver).toBeTruthy();
    expect(next.units.every((u) => u.hp === 0)).toBe(true);
  });
});

describe('dogmas and saved worlds', () => {
  function sacred() {
    const s = unlock(running(), ['O_02', 'M_03', 'M_01', 'C_01', 'V_05']);
    s.tier = 2;
    s.cohesion = 35;
    s.recentTrauma = { tag: 'ENV_ALLY_DAMAGED', time: s.time };
    s.buildings.push({ id: 'menhir', kind: 'menhir', x: HOME.x, y: HOME.y, hp: 500, active: true });
    return s;
  }
  it('raises cohesion by40 then blocks nocturnal orders', () => {
    let s = inscribeDogma(sacred(), 'C_01', 'M_01');
    expect(s.cohesion).toBe(75);
    expect(s.dogmas).toHaveLength(1);
    s.time = 65;
    expect(compileSentence(s, ['S_01', 'V_01'], { type: 'point', x: 30, y: 30 }).valid).toBe(false);
  });
  it('enforces the night taboo over hunger-driven escape', () => {
    let s = inscribeDogma(sacred(), 'C_01', 'M_01');
    s.time = 65;
    for (const u of s.units) {
      u.hunger = 96;
      u.x = HOME.x;
      u.y = HOME.y;
    }
    s = tick(s, 1);
    expect(s.units.every((u) => u.action === 'sleeping' && u.x === HOME.x && u.y === HOME.y)).toBe(
      true,
    );
  });
  it('cannot bypass a resource taboo with an implicit clicked target', () => {
    const s = unlock(sacred(), ['O_03']),
      tree = s.entities.find((e) => e.kind === 'tree')!;
    const next = inscribeDogma(s, 'O_03', 'M_01');
    expect(
      compileSentence(next, ['S_01', 'V_03'], { type: 'entity', id: tree.id, x: tree.x, y: tree.y })
        .valid,
    ).toBe(false);
  });
  it('accepts the complete sanctuary vector but rejects nonsacralizable targets', () => {
    const s = unlock(sacred(), ['O_03', 'O_01']);
    expect(inscribeDogma(s, 'O_03', 'O_01').dogmas).toHaveLength(1);
    expect(inscribeDogma(s, 'V_01', 'O_01').dogmas).toHaveLength(0);
  });
  it('removing a calcified taboo pays its actual cohesion cost', () => {
    let s = inscribeDogma(sacred(), 'C_01', 'M_01');
    s.dogmas[0].weight = 38;
    s = removeDogma(s, s.dogmas[0].id);
    expect(s.cohesion).toBe(37);
    expect(s.dogmas).toHaveLength(0);
  });
  it('simulation is deterministic for the same seed and commands', () => {
    const a = advance(running(99), 20),
      b = advance(running(99), 20);
    expect(a).toEqual(b);
  });
  it('keeps input state immutable across commands and ticks', () => {
    const s = running(),
      before = serializeGame(s);
    advance(issueCommand(s, ['S_01', 'V_01'], { type: 'point', x: 60, y: 60 }), 10);
    expect(serializeGame(s)).toBe(before);
  });
  it('round trips a world and resumes paused, rejecting invalid saves', () => {
    const s = advance(running(), 5),
      restored = parseGame(serializeGame(s));
    expect(restored?.time).toBe(5);
    expect(restored?.paused).toBe(true);
    expect(parseGame('{broken')).toBeNull();
    expect(parseGame('{"version":9}')).toBeNull();
  });
  it('rejects a syntactically valid save with broken resources or memories', () => {
    const s = running();
    delete (s.resources as Partial<GameState['resources']>).food;
    expect(parseGame(serializeGame(s))).toBeNull();
    const next = running();
    next.words.S_01.retention = -3;
    expect(parseGame(serializeGame(next))).toBeNull();
  });
});

describe('physical fire and high-heat discoveries', () => {
  it('applies the king’s fifty percent efficiency to work he leads in person', () => {
    const s = unlock(running(), ['S_02', 'S_07', 'V_06', 'O_02']);
    s.tier = 2;
    s.resources.stone = 2;
    s.government = 'monarchy';
    s.kingId = s.units[0].id;
    const ordinary = issueCommand(s, ['S_02', 'V_06', 'O_02'], undefined, s.units[0].id);
    s.units[0].isKing = true;
    const royal = issueCommand(s, ['S_07', 'V_06', 'O_02']);
    expect(advance(ordinary, 1).units[0].progress).toBe(1);
    expect(advance(royal, 1).units[0].progress).toBe(1.5);
  });
  it('pays the exact five wood from stored and nearby extracted fuel, leaving distant drops untouched', () => {
    const s = unlock(running(), ['O_05']);
    s.resources.wood = 2;
    s.entities.push({
      id: 'local-fuel',
      kind: 'ground',
      resource: 'wood',
      ...HOME,
      amount: 4,
      hp: 0,
      maxHp: 1,
    });
    s.entities.push({
      id: 'remote-fuel',
      kind: 'ground',
      resource: 'wood',
      x: HOME.x + 16,
      y: HOME.y,
      amount: 20,
      hp: 0,
      maxHp: 1,
    });
    expect(canIgnite(s)).toBe(true);
    expect(tryIgnite(s)).toBe(true);
    expect(s.resources.wood).toBe(0);
    expect(s.entities.find((e) => e.id === 'local-fuel')!.amount).toBe(1);
    expect(s.entities.find((e) => e.id === 'remote-fuel')!.amount).toBe(20);
    expect(s.burntWood).toBe(5);
    expect(tryIgnite(s)).toBe(true);
    expect(s.burntWood).toBe(5);
  });
  it('cannot light a fire using inaccessible fuel or less than the full cost', () => {
    const s = unlock(running(), ['O_05']);
    s.resources.wood = 4;
    s.entities.push({
      id: 'distant-fuel',
      kind: 'ground',
      resource: 'wood',
      x: HOME.x + 16,
      y: HOME.y,
      amount: 10,
      hp: 0,
      maxHp: 1,
    });
    expect(canIgnite(s)).toBe(false);
    expect(tryIgnite(s)).toBe(false);
    expect(s.resources.wood).toBe(4);
    expect(s.buildings).toHaveLength(0);
  });
  it('seasonal fire upkeep consumes actual nearby fuel and never supplies inventory', () => {
    const s = unlock(running(), ['O_05']);
    s.time = 90;
    s.buildings.push({ id: 'local-fire', kind: 'campfire', ...HOME, hp: 100, active: true });
    s.entities.push({
      id: 'upkeep-fuel',
      kind: 'ground',
      resource: 'wood',
      ...HOME,
      amount: 3,
      hp: 0,
      maxHp: 1,
    });
    seasonalCore(s);
    expect(s.entities.find((e) => e.id === 'upkeep-fuel')!.amount).toBe(1);
    expect(s.resources.wood).toBe(0);
    expect(s.buildings[0].hp).toBe(100);
  });
  it('guarding burns ten real wood near ore before producing high heat and never grants elder experience', () => {
    const s = unlock(running(), ['O_05', 'V_05', 'O_02', 'S_02', 'M_02']);
    const u = s.units[0],
      ore = s.entities.find((e) => e.kind === 'ore')!;
    u.x = ore.x;
    u.y = ore.y;
    u.action = 'guarding';
    u.command = ['S_01', 'V_05', 'O_05'];
    s.buildings.push({
      id: 'forge-fire',
      kind: 'campfire',
      x: ore.x,
      y: ore.y,
      hp: 100,
      active: true,
    });
    s.resources.wood = 9;
    processWork(s, u, 5);
    expect(u.eventMemory?.some((e) => e.tag === 'ENV_HIGH_HEAT')).toBe(false);
    s.resources.wood = 10;
    processWork(s, u, 5);
    expect(s.resources.wood).toBe(0);
    expect(s.burntWood).toBe(10);
    expect(u.eventMemory?.some((e) => e.tag === 'ENV_HIGH_HEAT')).toBe(true);
    expect(u.eventMemory?.some((e) => e.wordIds.includes('S_04'))).toBe(false);
    expect(u.tension?.O_07 ?? 0).toBe(0);
  });
});

describe('normal-play first chapter', () => {
  it('reaches the winter milestone using only ordinary orders, real sparks and earned attention', () => {
    const s = replayOrdinaryFirstYear();

    expect(s.gameOver).toBeNull();
    expect(s.milestone).toBe(true);
    expect(s.time).toBeGreaterThanOrEqual(360);
    expect(s.units.filter((u) => u.hp > 0).length).toBeGreaterThanOrEqual(4);
    expect(s.buildings.some((b) => b.kind === 'storage' && !b.cityId && b.hp > 0)).toBe(true);
    expect(
      s.buildings.some((b) => b.kind === 'campfire' && !b.cityId && b.hp > 0 && b.active),
    ).toBe(true);
    expect(Object.keys(s.words).filter((w) => hasWord(s, w)).length).toBeGreaterThanOrEqual(12);
    expect(s.stats.commands).toBeGreaterThan(5);
    expect(s.stats.taught).toBeGreaterThan(0);
    expect(parseGame(serializeGame(s))).not.toBeNull();
  }, 15_000);
});
