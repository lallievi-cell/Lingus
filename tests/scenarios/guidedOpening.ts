import { HOME } from '../../src/game/content';
import {
  compileSentence,
  createGame,
  hasWord,
  issueCommand,
  solveSpark,
  tick,
} from '../../src/game/engine';
import type { GameState, Target } from '../../src/game/types';

export interface GuidedOpeningOrder {
  at: number;
  tokens: string[];
  target?: Target;
}

/** A new Guided game, with public player actions only. Decisions are made
 * every five seconds; no individual isolation or precise positioning is used.
 * This proves the first fire, not a complete sustainable winter economy.
 */
export function replayGuidedOpening(seed = 6842) {
  let state: GameState = { ...createGame(seed, 'guided'), started: true };
  let stage: 'meal' | 'wood' | 'woodWait' | 'stoneWait' | 'home' | 'craft' = 'meal';
  let lastOrder = 0;
  const orders: GuidedOpeningOrder[] = [];
  const discoveries: { wordId: string; at: number; recipe: string[] }[] = [];
  const pointHome: Target = { type: 'point', ...HOME };
  const entityTarget = (id: string): Target => {
    const entity = state.entities.find((entity) => entity.id === id)!;
    return { type: 'entity', id, x: entity.x, y: entity.y };
  };
  const tree = state.entities.find((entity) => entity.kind === 'tree')!;
  const stone = state.entities.find((entity) => entity.kind === 'stone')!;
  const berries = state.entities.find((entity) => entity.kind === 'berries')!;
  const say = (tokens: string[], target?: Target) => {
    const adults = state.units.filter(
      (unit) => unit.hp > 0 && unit.age >= 4 && (!unit.factionId || unit.factionId === 'player'),
    );
    if (!adults.length || !compileSentence(state, tokens, target).valid) return false;
    const anchor: Target = {
      type: 'point',
      x: adults.reduce((sum, unit) => sum + unit.x, 0) / adults.length,
      y: adults.reduce((sum, unit) => sum + unit.y, 0) / adults.length,
    };
    const commands = state.stats.commands;
    state = issueCommand(state, tokens, target, undefined, anchor);
    if (state.stats.commands === commands) return false;
    orders.push({ at: state.time, tokens: [...tokens], target });
    lastOrder = state.time;
    return true;
  };

  for (let step = 0; step < 840 && !state.gameOver; step++) {
    for (const spark of [...state.sparks]) {
      const known = hasWord(state, spark.wordId);
      state = solveSpark(state, spark.id, spark.recipe);
      if (!known && hasWord(state, spark.wordId))
        discoveries.push({ wordId: spark.wordId, at: state.time, recipe: [...spark.recipe] });
    }
    if (step % 20 === 0) {
      const time = state.time;
      if (time === 0) say(['S_01', 'V_03'], entityTarget(tree.id));
      if (time === 20) say(['S_01', 'V_03'], entityTarget(stone.id));
      if (time === 50) say(['S_01', 'V_01'], pointHome);
      if (time >= 90 && stage === 'meal' && hasWord(state, 'O_01')) {
        if (say(['S_01', 'V_02'], entityTarget(berries.id))) stage = 'wood';
      } else if (stage === 'wood' && time >= lastOrder + 5 && hasWord(state, 'V_04')) {
        if (say(['S_01', 'V_04', 'O_03'])) stage = 'woodWait';
      } else if (stage === 'woodWait' && state.resources.wood >= 10) {
        if (say(['S_01', 'V_04', 'O_02'])) stage = 'stoneWait';
      } else if (stage === 'stoneWait' && state.resources.stone >= 5) {
        if (say(['S_01', 'V_01'], pointHome)) stage = 'home';
      } else if (stage === 'home' && time >= lastOrder + 5 && hasWord(state, 'V_06')) {
        if (say(['S_01', 'V_06', 'O_02'])) stage = 'craft';
      } else if (
        stage === 'craft' &&
        time >= lastOrder + 10 &&
        time % 90 < 50 &&
        !state.units.some((unit) => unit.action === 'crafting') &&
        !hasWord(state, 'O_05')
      ) {
        say(['S_01', 'V_06', 'O_02']);
      }
    }
    const fire = state.buildings.find(
      (building) =>
        !building.cityId && building.kind === 'campfire' && building.hp > 0 && building.active,
    );
    if (fire) return { state, firstFireAt: state.time, orders, discoveries };
    state = tick(state, 0.25);
  }
  return { state, firstFireAt: null, orders, discoveries };
}
