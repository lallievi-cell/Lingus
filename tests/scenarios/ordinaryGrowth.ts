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
  let s = { ...createGame(6842), started: true };
  let artisanCalledToHearth = false;
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
    if (time === 130 || time === 300) {
      const deer = s.entities
        .filter((e) => e.kind === 'deer' && e.hp > 0 && visible(e))
        .sort(
          (a, b) => Math.hypot(a.x - HOME.x, a.y - HOME.y) - Math.hypot(b.x - HOME.x, b.y - HOME.y),
        )[0];
      say(
        time === 130 ? ['S_02', 'V_03'] : ['S_01', 'V_03'],
        { type: 'entity', id: deer.id, x: deer.x, y: deer.y },
        time === 130 ? 'unit-0' : undefined,
        group,
      );
    }
    // Let each real return finish; the depot frees material capacity for shelter.
    if (time === 190 || time === 220) {
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
    if (time === 230) say(['S_02', 'V_05', 'O_05'], undefined, 'unit-5', group);
    // Pay for a house before winter, then build stores from the delivered wood.
    if (time === 260)
      say(['S_01', 'V_08', 'O_02', 'O_01'], { type: 'point', ...HOME }, undefined, group);
    if (time === 270)
      say(['S_01', 'V_05', 'O_04', 'M_02'], { type: 'point', ...HOME }, undefined, group);
    if (time === 320) say(['S_01', 'V_02', 'O_04'], undefined, undefined, group);
    if (time === 350) say(['S_02', 'V_05', 'O_05'], undefined, 'unit-3', group);
    s = tick(s, 0.25);
  }
  return s;
}
