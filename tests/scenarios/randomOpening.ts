import { HOME } from '../../src/game/content';
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

export interface RandomOpeningOrder {
  at: number;
  tokens: string[];
  target?: Target;
}

/** Ordinary opening on a newly generated map. The player only chooses visible
 * material sources and gives group orders at ten-second decisions. Inventory,
 * knowledge, unit positions and random outcomes are never prepared by the test.
 */
export function replayRandomOpening(seed: number) {
  let state: GameState = { ...createGame(seed, 'guided', 'random'), started: true };
  const orders: RandomOpeningOrder[] = [];
  const discoveries: { at: number; wordId: string; recipe: string[] }[] = [];
  const rejectedOrders: { at: number; tokens: string[]; reason: string }[] = [];
  const hiddenTargets: { at: number; id: string }[] = [];
  const visible = (entity: MapEntity) =>
    state.sectors.some(
      (sector) =>
        sector.explored &&
        sector.x === Math.floor(entity.x / 100) &&
        sector.y === Math.floor(entity.y / 100),
    );
  const nearHome = (entity: MapEntity) => Math.hypot(entity.x - HOME.x, entity.y - HOME.y);
  const source = (kind: MapEntity['kind'], minimum = 0) =>
    state.entities
      .filter((entity) => entity.kind === kind && entity.amount > minimum && visible(entity))
      .sort((a, b) => nearHome(a) - nearHome(b))[0];
  const entityTarget = (entity: MapEntity): Target => ({
    type: 'entity',
    id: entity.id,
    x: entity.x,
    y: entity.y,
  });
  const home: Target = { type: 'point', ...HOME };
  // A close visible pair makes the first extraction understandable without
  // selecting an artisan or placing anyone at an artificial intersection.
  const pairs = state.entities
    .filter((entity) => entity.kind === 'tree' && visible(entity))
    .flatMap((tree) =>
      state.entities
        .filter(
          (entity) =>
            entity.kind === 'stone' &&
            visible(entity) &&
            Math.hypot(entity.x - tree.x, entity.y - tree.y) <= 14,
        )
        .map((stone) => ({ tree, stone })),
    )
    .sort((a, b) => nearHome(a.tree) + nearHome(a.stone) - nearHome(b.tree) - nearHome(b.stone));
  const pair = pairs[0];
  let stage: 'meal' | 'wood' | 'stone' | 'home' | 'craft' = 'meal';
  let lastOrderAt = -Infinity;
  let firstFireAt: number | null = null;

  const say = (tokens: string[], target?: Target) => {
    const adults = state.units.filter(
      (unit) => unit.hp > 0 && unit.age >= 4 && (!unit.factionId || unit.factionId === 'player'),
    );
    if (!adults.length) return false;
    const compiled = compileSentence(state, tokens, target);
    if (!compiled.valid) return false;
    const anchor: Target = {
      type: 'point',
      x: adults.reduce((sum, unit) => sum + unit.x, 0) / adults.length,
      y: adults.reduce((sum, unit) => sum + unit.y, 0) / adults.length,
    };
    const before = state.stats.commands;
    state = issueCommand(state, tokens, target, undefined, anchor);
    if (state.stats.commands === before) {
      rejectedOrders.push({ at: state.time, tokens, reason: state.logs[0]?.text ?? '' });
      return false;
    }
    orders.push({ at: state.time, tokens: [...tokens], target });
    for (const unit of state.units.filter((unit) => unit.command?.join('|') === tokens.join('|'))) {
      const chosen = state.entities.find((entity) => entity.id === unit.targetId);
      if (chosen && !visible(chosen)) hiddenTargets.push({ at: state.time, id: chosen.id });
    }
    lastOrderAt = state.time;
    return true;
  };

  for (let step = 0; step <= 840 && !state.gameOver; step++) {
    for (const spark of [...state.sparks]) {
      const learned = hasWord(state, spark.wordId);
      state = solveSpark(state, spark.id, spark.recipe);
      if (!learned && hasWord(state, spark.wordId))
        discoveries.push({ at: state.time, wordId: spark.wordId, recipe: [...spark.recipe] });
    }
    const fire = state.buildings.find(
      (building) =>
        !building.cityId && building.kind === 'campfire' && building.active && building.hp > 0,
    );
    if (fire && firstFireAt === null) firstFireAt = state.time;
    // Lightning can teach Fire before the first paid craft. Finish the same
    // material route so that an early fire never skips tools and reserve fuel.
    if (fire && state.resources.tool >= 1 && state.resources.wood >= 2)
      return { state, firstFireAt, orders, rejectedOrders, discoveries, hiddenTargets };
    if (step % 40 === 0) {
      const time = state.time;
      if (time === 0 && pair) say(['S_01', 'V_03'], entityTarget(pair.tree));
      if (time === 20 && pair) say(['S_01', 'V_03'], entityTarget(pair.stone));
      if (time === 60) say(['S_01', 'V_01'], home);
      if (time >= 90 && stage === 'meal' && hasWord(state, 'O_01')) {
        const food = source('berries');
        if (food && say(['S_01', 'V_02'], entityTarget(food))) stage = 'wood';
      } else if (stage === 'wood' && hasWord(state, 'V_04') && time >= lastOrderAt + 10) {
        if (say(['S_01', 'V_04', 'O_03'])) stage = 'stone';
      } else if (stage === 'stone' && state.resources.wood >= (fire ? 5 : 10)) {
        if (say(['S_01', 'V_04', 'O_02'])) stage = 'home';
      } else if (stage === 'home' && state.resources.stone >= 5) {
        if (say(['S_01', 'V_01'], home)) stage = 'craft';
      } else if (
        stage === 'craft' &&
        time >= lastOrderAt + 10 &&
        hasWord(state, 'V_06') &&
        !state.units.some((unit) => unit.action === 'crafting')
      ) {
        say(['S_01', 'V_06', 'O_02']);
      }
    }
    if (state.time >= 210) break;
    state = tick(state, 0.25);
  }
  return { state, firstFireAt, orders, rejectedOrders, discoveries, hiddenTargets };
}

/** Continues those actual actions through the first winter. Food is eaten
 * before the cold, and the public campfire selector recalls the full adult
 * group. This checks one year, not a self-sustaining multiyear economy.
 */
export function replayRandomFirstYear(seed: number, endTime: 360 | 390 = 360) {
  const opening = replayRandomOpening(seed);
  let state = opening.state;
  const orders = [...opening.orders];
  const rejectedOrders = [...opening.rejectedOrders];
  const discoveries = [...opening.discoveries];
  const hiddenTargets = [...opening.hiddenTargets];
  const snapshots: { at: number; state: GameState }[] = [];
  const own = () =>
    state.units.filter((unit) => unit.hp > 0 && (!unit.factionId || unit.factionId === 'player'));
  const visible = (entity: MapEntity) =>
    state.sectors.some(
      (sector) =>
        sector.explored &&
        sector.x === Math.floor(entity.x / 100) &&
        sector.y === Math.floor(entity.y / 100),
    );
  const fire = () =>
    state.buildings.find(
      (building) => !building.cityId && building.kind === 'campfire' && building.hp > 0,
    );
  const pointHome: Target = { type: 'point', ...HOME };
  const target = (entity: MapEntity): Target => ({
    type: 'entity',
    id: entity.id,
    x: entity.x,
    y: entity.y,
  });
  const food = (minimum = 0, richest = false) =>
    state.entities
      .filter(
        (entity) =>
          entity.kind === 'berries' &&
          entity.amount > minimum &&
          visible(entity) &&
          Math.hypot(entity.x - HOME.x, entity.y - HOME.y) < 70,
      )
      .sort((a, b) =>
        richest
          ? b.amount - a.amount
          : Math.hypot(a.x - HOME.x, a.y - HOME.y) - Math.hypot(b.x - HOME.x, b.y - HOME.y),
      )[0];
  const wood = () =>
    state.entities
      .filter(
        (entity) =>
          entity.kind === 'ground' &&
          entity.resource === 'wood' &&
          entity.amount > 0 &&
          visible(entity),
      )
      .sort(
        (a, b) => Math.hypot(a.x - HOME.x, a.y - HOME.y) - Math.hypot(b.x - HOME.x, b.y - HOME.y),
      )[0];
  const say = (tokens: string[], destination?: Target) => {
    const bonfire = fire();
    if (!bonfire) return;
    const before = state.stats.commands;
    state = issueCommand(state, tokens, destination, undefined, {
      type: 'building',
      id: bonfire.id,
      x: bonfire.x,
      y: bonfire.y,
    });
    if (state.stats.commands === before) {
      rejectedOrders.push({ at: state.time, tokens, reason: state.logs[0]?.text ?? '' });
      return;
    }
    orders.push({ at: state.time, tokens: [...tokens], target: destination });
    for (const unit of state.units.filter((unit) => unit.command?.join('|') === tokens.join('|'))) {
      const chosen = state.entities.find((entity) => entity.id === unit.targetId);
      if (chosen && !visible(chosen)) hiddenTargets.push({ at: state.time, id: chosen.id });
    }
  };
  if (opening.firstFireAt === null) return { ...opening, snapshots };
  const depotAt = Math.ceil(state.time / 10) * 10;

  while (!state.gameOver) {
    for (const spark of [...state.sparks]) {
      const learned = hasWord(state, spark.wordId);
      state = solveSpark(state, spark.id, spark.recipe);
      if (!learned && hasWord(state, spark.wordId))
        discoveries.push({ at: state.time, wordId: spark.wordId, recipe: [...spark.recipe] });
    }
    if (state.campfirePending) {
      while (state.attention >= 10) {
        const id = ['O_05', 'V_06', 'V_05', 'M_02', 'O_01']
          .filter(
            (id) =>
              hasWord(state, id) &&
              own().some((unit) => unit.age < 14 && !state.words[id].custodians.includes(unit.id)),
          )
          .sort((a, b) => state.words[a].custodians.length - state.words[b].custodians.length)[0];
        if (!id) break;
        const previous = state.stats.taught;
        state = teachWord(state, id);
        if (state.stats.taught === previous) break;
      }
      state = dismissCampfire(state);
    }
    const time = state.time;
    if ([270, 330, 360, 390].includes(time)) snapshots.push({ at: time, state });
    if (time >= endTime) break;
    // The material depot frees the shared starting capacity for actual winter
    // food. Give each haul time to return before asking for the next task.
    if (time === depotAt)
      say(['S_01', 'V_05', 'O_02'], { type: 'point', x: HOME.x, y: HOME.y - 3 });
    if ((time === depotAt + 10 || time === depotAt + 30) && food(8))
      say(['S_01', 'V_04'], target(food(8)!));
    if (time === depotAt + 50 && time < 250 && state.resources.wood < 7 && wood())
      say(['S_01', 'V_04', 'O_03', 'O_05'], target(wood()!));
    if (time === 250 && food(0, true)) say(['S_01', 'V_02'], target(food(0, true)!));
    if (time === 270) say(['S_01', 'V_01'], pointHome);
    if (time === 360 && fire() && !fire()!.active) say(['S_01', 'V_05', 'O_05']);
    state = tick(state, 0.25);
  }
  return {
    state,
    firstFireAt: opening.firstFireAt,
    orders,
    rejectedOrders,
    discoveries,
    hiddenTargets,
    snapshots,
  };
}
