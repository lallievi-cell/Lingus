import { HOME } from '../../src/game/content';
import {
  createGame,
  dismissCampfire,
  hasWord,
  issueCommand,
  solveSpark,
  teachWord,
  tick,
} from '../../src/game/engine';
import type { GameState, MapEntity, Target } from '../../src/game/types';

/** Ordinary legacy Guided play on the seed-zero map: group orders at ten-second
 * decisions, actual discoveries, materials, exploration, meals and paid lessons.
 * The southern foraging trip first explores the plain; it never targets a
 * hidden resource. This is a first-year check, not a sustainable campaign proof.
 */
export function replayGuidedFirstYear(seed = 6842, departureDelay = 0) {
  let state: GameState = { ...createGame(seed, 'guided'), started: true };
  // This route and its snapshots describe the original 90-second calendar.
  delete state.openingBalanceVersion;
  delete state.openingCouncilsCompleted;
  let firstFireAt: number | null = null;
  const orders: { at: number; tokens: string[]; target?: Target }[] = [];
  const rejectedOrders: { at: number; tokens: string[]; reason: string }[] = [];
  const discoveries: { at: number; wordId: string }[] = [];
  const snapshots: { at: number; state: GameState }[] = [];
  const own = () =>
    state.units.filter((unit) => unit.hp > 0 && (!unit.factionId || unit.factionId === 'player'));
  const entityTarget = (entity: MapEntity): Target => ({
    type: 'entity',
    id: entity.id,
    x: entity.x,
    y: entity.y,
  });
  const nearest = (kind: MapEntity['kind'], minimum = 0) =>
    state.entities
      .filter((entity) => entity.kind === kind && entity.amount > minimum)
      .sort(
        (a, b) => Math.hypot(a.x - HOME.x, a.y - HOME.y) - Math.hypot(b.x - HOME.x, b.y - HOME.y),
      )[0];
  // The visible wood beside the stone keeps the artisan near real chips
  // while the rest of the group carries the first fuel home.
  const stone = nearest('stone')!;
  const tree = state.entities
    .filter((entity) => entity.kind === 'tree')
    .sort(
      (a, b) => Math.hypot(a.x - stone.x, a.y - stone.y) - Math.hypot(b.x - stone.x, b.y - stone.y),
    )[0];
  const say = (tokens: string[], target?: Target) => {
    const adults = own().filter((unit) => unit.age >= 4);
    if (!adults.length) return;
    const center: Target = {
      type: 'point',
      x: adults.reduce((sum, unit) => sum + unit.x, 0) / adults.length,
      y: adults.reduce((sum, unit) => sum + unit.y, 0) / adults.length,
    };
    const fire = state.buildings.find(
      (building) => !building.cityId && building.kind === 'campfire' && building.hp > 0,
    );
    const anchor: Target = fire ? { type: 'building', id: fire.id, x: fire.x, y: fire.y } : center;
    const previous = state.stats.commands;
    state = issueCommand(state, tokens, target, undefined, anchor);
    if (state.stats.commands > previous) orders.push({ at: state.time, tokens, target });
    else rejectedOrders.push({ at: state.time, tokens, reason: state.logs[0]?.text ?? '' });
  };

  for (let step = 0; step <= 1560 && !state.gameOver; step++) {
    for (const spark of [...state.sparks]) {
      const known = hasWord(state, spark.wordId);
      state = solveSpark(state, spark.id, spark.recipe);
      if (!known && hasWord(state, spark.wordId))
        discoveries.push({ at: state.time, wordId: spark.wordId });
    }
    if (state.campfirePending) {
      while (state.attention >= 10) {
        const word = ['O_05', 'M_02', 'V_05', 'O_01', 'V_06', 'O_02', 'O_03']
          .filter(
            (id) =>
              hasWord(state, id) &&
              own().some((unit) => unit.age < 14 && !state.words[id].custodians.includes(unit.id)),
          )
          .sort(
            (a, b) =>
              Number(b === 'O_05' && state.words[b].custodians.length < 3) -
                Number(a === 'O_05' && state.words[a].custodians.length < 3) ||
              state.words[a].custodians.length - state.words[b].custodians.length,
          )[0];
        if (!word) break;
        const taught = state.stats.taught;
        state = teachWord(state, word);
        if (state.stats.taught === taught) break;
      }
      state = dismissCampfire(state);
    }
    if (
      firstFireAt === null &&
      state.buildings.some(
        (building) =>
          !building.cityId && building.kind === 'campfire' && building.active && building.hp > 0,
      )
    )
      firstFireAt = state.time;
    if ([180, 270, 330, 360, 390].includes(state.time)) snapshots.push({ at: state.time, state });
    if (step % 40 === 0) {
      const time = state.time;
      if (time === 0) say(['S_01', 'V_03'], entityTarget(tree));
      if (time === 20) say(['S_01', 'V_03'], entityTarget(nearest('stone')!));
      if (time === 60) say(['S_01', 'V_01'], { type: 'point', ...HOME });
      if (time === 100) say(['S_01', 'V_02'], entityTarget(nearest('berries')!));
      if (time === 110) {
        const wood = state.entities.find(
          (entity) =>
            entity.kind === 'ground' &&
            entity.resource === 'wood' &&
            entity.amount > 0 &&
            Math.hypot(entity.x - tree.x, entity.y - tree.y) < 1,
        );
        if (wood) say(['S_01', 'V_04', 'O_03'], entityTarget(wood));
      }
      // Only the artisan stops hauling. The stone has actually been chipped
      // nearby; no inventory, experience or artisan position is injected.
      if (time === 120) say(['S_01', 'V_06', 'O_02']);
      if (time === 160) {
        const berries = state.entities
          .filter(
            (entity) =>
              entity.kind === 'berries' &&
              entity.amount > 0 &&
              Math.hypot(entity.x - HOME.x, entity.y - HOME.y) < 30,
          )
          .sort((a, b) => b.amount - a.amount)[0];
        if (berries) say(['S_01', 'V_02'], entityTarget(berries));
      }
      // A real watch reaches the fire before autumn's possible rain. The
      // previous meal has time to finish; no weather roll is bypassed.
      if (time === 170) say(['S_01', 'V_05', 'O_05']);
      if (time === 180) say(['S_01', 'V_04', 'O_03'], entityTarget(nearest('tree', 12)!));
      if (time === 200 + departureDelay) {
        say(['S_01', 'V_01'], { type: 'point', x: HOME.x, y: HOME.y + 80 });
        // Pay the first upkeep before spending wood on storage. One builder
        // remains at camp while the rest finish the public exploration order.
        say(['S_01', 'V_05', 'O_02'], { type: 'point', x: HOME.x + 6, y: HOME.y + 4 });
      }
      if (time === 220 + departureDelay || time === 230 + departureDelay) {
        const berries = state.entities
          .filter(
            (entity) =>
              entity.kind === 'berries' &&
              entity.amount > (time === 230 + departureDelay ? 8 : 0) &&
              entity.y > 300 &&
              entity.y < 350 &&
              own().some((unit) => Math.hypot(unit.x - entity.x, unit.y - entity.y) <= 30),
          )
          .sort(
            (a, b) =>
              Math.hypot(a.x - HOME.x, a.y - HOME.y) - Math.hypot(b.x - HOME.x, b.y - HOME.y),
          )[0];
        if (berries)
          say(['S_01', time === 220 + departureDelay ? 'V_02' : 'V_04'], entityTarget(berries));
      }
      // Let every loaded return finish before regrouping around the real fire.
      if (time === 280) say(['S_01', 'V_01'], { type: 'point', ...HOME });
      if (
        time === 360 &&
        state.buildings.some(
          (building) => !building.cityId && building.kind === 'campfire' && !building.active,
        )
      )
        say(['S_01', 'V_05', 'O_05']);
    }
    if (state.time >= 390) break;
    state = tick(state, 0.25);
  }
  return { state, firstFireAt, orders, rejectedOrders, discoveries, snapshots };
}
