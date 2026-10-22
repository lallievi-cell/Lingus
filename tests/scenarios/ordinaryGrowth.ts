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
import type { GameState, Target } from '../../src/game/types';

/** Replays the existing first chapter from seed 6842 using public player actions.
 * Starting the game mirrors the welcome screen. No simulation fixture is injected.
 */
export function replayOrdinaryFirstYear(): GameState {
  let s = { ...createGame(6842), started: true },
    nextOrder = 0;
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
  const ownStorage = () => s.buildings.some((b) => b.kind === 'storage' && !b.cityId && b.hp > 0);
  // The route only reads world state. Every change goes through public player actions:
  // selecting a 15m group, giving an order, solving an actual spark, or teaching.
  for (let step = 0; step < 2400 && !s.gameOver && !s.milestone; step++) {
    const time = s.time;
    for (const idea of [...s.sparks]) {
      if (idea.wordId === 'O_05' && !s.buildings.some((b) => b.kind === 'campfire' && !b.cityId)) {
        const artisan = s.units.find((u) => u.id === idea.unitId)!;
        if (Math.hypot(artisan.x - 252, artisan.y - 235.2) > 0.1) continue;
      }
      s = solveSpark(s, idea.id, idea.recipe);
    }
    if (s.campfirePending) {
      while (s.attention >= 10) {
        const priority = (id: string) =>
          id === 'O_05' && s.words[id].custodians.length < 3
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
    if (time === 0) {
      const ayla = s.units.find((u) => u.name === 'Ayla')!;
      let selection: Target | undefined;
      for (let angle = 0; angle < Math.PI * 2; angle += 0.03) {
        const point = {
          type: 'point' as const,
          x: ayla.x + 14.9 * Math.cos(angle),
          y: ayla.y + 14.9 * Math.sin(angle),
        };
        if (
          s.units.filter((u) => u.age >= 4 && Math.hypot(u.x - point.x, u.y - point.y) <= 15)
            .length === 1
        ) {
          selection = point;
          break;
        }
      }
      if (!selection) throw new Error('The initial individual selection was not found.');
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
    if (time === 70 || time === 85)
      say(['S_02', 'V_01'], { type: 'point', x: 252, y: 235.2 }, 'unit-5');
    if ([80, 100, 110, 120].includes(time)) say(['S_02', 'V_06', 'O_02'], undefined, 'unit-5');
    // A second artisan practices the real craft before the third season ends,
    // so forgetting Fire can be followed by a fresh, earned intuition.
    // Repeat a useful fire-related craft, then reserve real fuel before building stores.
    if (time === 210) say(['S_02', 'V_03', 'O_02'], undefined, 'unit-2');
    if (time === 220 || time === 235) say(['S_02', 'V_07', 'O_02', 'O_05'], undefined, 'unit-2');
    if (time === 250) say(['S_02', 'V_01'], { type: 'point', x: 252, y: 235.2 }, 'unit-2');
    if (time === 260) say(['S_02', 'V_06', 'O_02'], undefined, 'unit-2');
    if (time === 200) {
      const deer = s.entities.find((e) => e.kind === 'deer' && e.hp > 0)!;
      say(['S_01', 'V_03'], { type: 'entity', id: deer.id, x: deer.x, y: deer.y });
    }
    const fire = s.buildings.find((b) => b.kind === 'campfire' && !b.cityId);
    if ((time === 230 || time === 255) && fire)
      say(['S_01', 'V_01'], { type: 'point', x: 250, y: 244 }, undefined, {
        type: 'building',
        id: fire.id,
        x: fire.x,
        y: fire.y,
      });
    // Feed the group near home before the final autumn sleep. Returning early
    // leaves time for the third real night together instead of interrupting it.
    if ((time === 235 || time === 250) && fire) {
      const berries = s.entities
        .filter(
          (e) =>
            e.kind === 'berries' && e.amount > 0 && Math.hypot(e.x - HOME.x, e.y - HOME.y) <= 60,
        )
        .sort(
          (a, b) => Math.hypot(a.x - HOME.x, a.y - HOME.y) - Math.hypot(b.x - HOME.x, b.y - HOME.y),
        )[0];
      if (berries)
        say(
          ['S_01', 'V_02', 'O_04'],
          { type: 'entity', id: berries.id, x: berries.x, y: berries.y },
          undefined,
          { type: 'building', id: fire.id, x: fire.x, y: fire.y },
        );
    }
    if (time === 271 && hasWord(s, 'S_02')) say(['S_02', 'V_03', 'O_04'], undefined, 'unit-0');
    if (time > 270 && hasWord(s, 'V_04') && s.voice >= 1 && time >= nextOrder && fire) {
      const group: Target = { type: 'building', id: fire.id, x: fire.x, y: fire.y };
      if (s.resources.wood < 12 && hasWord(s, 'O_05')) {
        say(['S_01', 'V_04', 'O_03', 'O_05'], undefined, undefined, group);
        nextOrder = time + 17;
      } else if (
        hasWord(s, 'V_05') &&
        !ownStorage() &&
        (s.resources.stone >= 10 || s.resources.wood >= 10)
      ) {
        const builder = s.units
          .filter((u) => u.hp > 0 && u.age >= 4 && u.factionId === 'player')
          .sort((a, b) => a.hunger - b.hunger)[0];
        say(
          ['S_02', 'V_05', 'O_04', 'M_02'],
          { type: 'point', x: fire.x + 1, y: fire.y },
          builder?.id,
          group,
        );
        nextOrder = time + 15;
      } else if (!ownStorage()) {
        say(['S_01', 'V_04', 'O_02'], undefined, undefined, group);
        nextOrder = time + 17;
      } else if (time % 15 === 0) {
        const carcass = s.entities
          .filter((e) => ['deer', 'wolf', 'alpha'].includes(e.kind) && e.hp <= 0 && e.amount > 0)
          .sort(
            (a, b) =>
              Math.hypot(a.x - fire.x, a.y - fire.y) - Math.hypot(b.x - fire.x, b.y - fire.y),
          )[0];
        if (carcass)
          say(
            ['S_01', 'V_02'],
            { type: 'entity', id: carcass.id, x: carcass.x, y: carcass.y },
            undefined,
            group,
          );
        else say(['S_01', 'V_01'], { type: 'point', x: fire.x, y: fire.y }, undefined, group);
        nextOrder = time + 15;
      }
    }
    s = tick(s, 0.25);
  }
  return s;
}
