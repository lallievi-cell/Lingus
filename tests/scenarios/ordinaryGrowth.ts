import { HOME, WORDS } from '../../src/game/content';
import {
  compileSentence,
  createGame,
  dismissCampfire,
  hasWord,
  issueCommand,
  solveSpark,
  teachWord,
  tick,
} from '../../src/game/engine';
import type { GameState, MapEntity, Target } from '../../src/game/types';

/** Replays the existing first chapter from seed 6842 using public player actions.
 * Starting the game mirrors the welcome screen. No simulation fixture is injected.
 */
export function replayOrdinaryFirstYear(): GameState {
  let s = { ...createGame(6842, 'classic'), started: true };
  let artisanCalledToHearth = false,
    foodOrdered = false;
  const winterHunts = new Map<string, string>();
  const hearth: Target = { type: 'point', x: 252, y: 235 };
  const visible = (entity: MapEntity) =>
    s.sectors.some(
      (sector) =>
        sector.explored &&
        sector.x === Math.floor(entity.x / 100) &&
        sector.y === Math.floor(entity.y / 100),
    );
  const say = (
    tokens: string[],
    target?: Target,
    executorId?: string,
    selectionCenter?: Target,
  ) => {
    const adults = s.units.filter((u) => u.hp > 0 && u.age >= 4).sort((a, b) => a.x - b.x);
    const anchor = adults[Math.floor(adults.length / 2)] ?? HOME;
    if (!compileSentence(s, tokens, target).valid) return false;
    const previous = s.stats.commands;
    s = issueCommand(
      s,
      tokens,
      target,
      executorId,
      selectionCenter ?? { type: 'point', x: anchor.x, y: anchor.y },
    );
    return s.stats.commands > previous;
  };
  // The route only reads world state. Every change goes through public player actions:
  // selecting a 15m group, giving an order, solving an actual spark, or teaching.
  for (let step = 0; step < 2400 && !s.gameOver && !s.milestone; step++) {
    const time = s.time;
    for (const idea of [...s.sparks]) {
      if (idea.wordId === 'O_05' && !s.buildings.some((b) => b.kind === 'campfire' && !b.cityId)) {
        const artisan = s.units.find((u) => u.id === idea.unitId)!;
        // The artisan finishes the public move to the hearth before naming Fire.
        if (!artisanCalledToHearth || artisan.action === 'moving') continue;
      }
      s = solveSpark(s, idea.id, idea.recipe);
    }
    if (s.campfirePending) {
      while (s.attention >= 10) {
        const priority = (id: string) =>
          id === 'O_05' && s.words[id].custodians.length < 2
            ? -3
            : id === 'M_02' && s.words[id].custodians.length < 2
              ? -2
              : 0;
        const word = Object.keys(s.words)
          .filter(
            (id) =>
              WORDS[id].tier > 0 &&
              hasWord(s, id) &&
              s.words[id].retention < 100 &&
              s.units.some(
                (u) =>
                  u.hp > 0 &&
                  u.factionId === 'player' &&
                  u.age < 14 &&
                  u.caste !== 'slave' &&
                  !s.words[id].custodians.includes(u.id),
              ),
          )
          .sort(
            (a, b) =>
              priority(a) - priority(b) ||
              s.words[a].custodians.length - s.words[b].custodians.length ||
              s.words[a].retention - s.words[b].retention,
          )[0];
        if (!word) break;
        const before = s.attention;
        s = teachWord(s, word);
        if (s.attention === before) break;
      }
      s = dismissCampfire(s);
    }
    // The southern edge of the starting group sends a small scouting party east.
    if (time === 0) {
      const selection: Target = { type: 'point', x: 240, y: 265 };
      say(['S_01', 'V_01'], { type: 'point', x: 340, y: 250 }, undefined, selection);
    }
    if (time === 5 || time === 20) {
      const node = s.entities.find((e) =>
        time === 5
          ? e.kind === 'tree' && e.x === 259 && e.y === 222
          : e.kind === 'stone' && e.x === 238 && e.y === 233,
      )!;
      say(
        ['S_01', 'V_03'],
        { type: 'entity', id: node.id, x: node.x, y: node.y },
        undefined,
        time === 5 ? { type: 'point', ...HOME } : undefined,
      );
    }
    if (time === 55) {
      const ayla = s.units.find((u) => u.name === 'Ayla')!;
      say(['S_01', 'V_01'], { type: 'point', ...HOME }, undefined, {
        type: 'point',
        x: ayla.x,
        y: ayla.y,
      });
    }
    if (time === 64) say(['S_01', 'V_01'], { type: 'point', ...HOME });
    if (time === 70 || time === 85) {
      say(['S_02', 'V_01'], hearth, 'unit-5');
      if (time === 85) artisanCalledToHearth = true;
    }
    if ([80, 100, 110, 120].includes(time)) say(['S_02', 'V_06', 'O_02'], undefined, 'unit-5');
    const fire = s.buildings.find((b) => b.kind === 'campfire' && !b.cityId);
    const group: Target = fire
      ? { type: 'building', id: fire.id, x: fire.x, y: fire.y }
      : { type: 'point', ...HOME };
    if (time === 130) {
      const deer = s.entities
        .filter((e) => e.kind === 'deer' && e.hp > 0 && visible(e))
        .sort(
          (a, b) => Math.hypot(a.x - HOME.x, a.y - HOME.y) - Math.hypot(b.x - HOME.x, b.y - HOME.y),
        )[0];
      say(['S_02', 'V_03'], { type: 'entity', id: deer.id, x: deer.x, y: deer.y }, 'unit-0', group);
    }
    // Finish the real wood trips. Build the depot and food stores while their
    // vocabulary is still available, before the elderly custodian can die.
    if (time === 190 || time === 230) {
      const tree = s.entities
        .filter((e) => e.kind === 'tree' && e.amount > 12 && visible(e))
        .sort(
          (a, b) => Math.hypot(a.x - HOME.x, a.y - HOME.y) - Math.hypot(b.x - HOME.x, b.y - HOME.y),
        )[0];
      say(
        ['S_01', 'V_04', 'O_03'],
        { type: 'entity', id: tree.id, x: tree.x, y: tree.y },
        undefined,
        group,
      );
    }
    if (time === 210) say(['S_01', 'V_05', 'O_02'], { type: 'point', ...HOME }, undefined, group);
    if (time === 240) {
      const stone = s.entities.find(
        (e) => e.kind === 'ground' && e.resource === 'stone' && e.amount > 0 && visible(e),
      )!;
      say(
        ['S_01', 'V_04', 'O_02'],
        { type: 'entity', id: stone.id, x: stone.x, y: stone.y },
        undefined,
        group,
      );
    }
    if (time === 220)
      say(['S_01', 'V_05', 'O_04', 'M_02'], { type: 'point', ...HOME }, undefined, group);
    if (time === 225) say(['S_02', 'V_05', 'O_05'], undefined, 'unit-5', group);
    if (!foodOrdered && time >= 253 && time <= 258 && s.resources.stone >= 20) {
      const berries = s.entities
        .filter((e) => e.kind === 'berries' && e.amount > 0 && visible(e))
        .sort(
          (a, b) => Math.hypot(a.x - HOME.x, a.y - HOME.y) - Math.hypot(b.x - HOME.x, b.y - HOME.y),
        )[0];
      if (berries)
        foodOrdered = say(
          ['S_01', 'V_02', 'O_04'],
          { type: 'entity', id: berries.id, x: berries.x, y: berries.y },
          undefined,
          { type: 'point', ...HOME },
        );
    }
    if (
      !s.disasters.blizzard &&
      (time === 290 || time === 310) &&
      s.buildings.some((b) => b.kind === 'storage' && !b.cityId)
    ) {
      const id = time === 290 ? 'unit-0' : 'unit-3';
      const deer = s.entities
        .filter((e) => e.kind === 'deer' && e.hp > 0 && visible(e))
        .sort(
          (a, b) => Math.hypot(a.x - HOME.x, a.y - HOME.y) - Math.hypot(b.x - HOME.x, b.y - HOME.y),
        )[0];
      if (deer && say(['S_02', 'V_03'], { type: 'entity', id: deer.id, x: deer.x, y: deer.y }, id))
        winterHunts.set(id, deer.id);
    }
    for (const [id, preyId] of winterHunts) {
      const prey = s.entities.find((e) => e.id === preyId)!;
      if (
        prey.hp <= 0 &&
        prey.amount > 0 &&
        s.voice >= 1 &&
        say(['S_02', 'V_04', 'O_04'], { type: 'entity', id: prey.id, x: prey.x, y: prey.y }, id)
      )
        winterHunts.delete(id);
    }
    if (time === 330) say(['S_01', 'V_05', 'O_05'], undefined, undefined, group);
    if (time === 350) say(['S_02', 'V_05', 'O_05'], undefined, 'unit-3', group);
    s = tick(s, 0.25);
  }
  return s;
}
