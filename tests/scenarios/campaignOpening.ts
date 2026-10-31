import { HOME } from '../../src/game/content';
import {
  createGame,
  dismissCampfire,
  hasWord,
  issueCommand,
  prepareCampfireCouncil,
  solveSpark,
  teachWord,
  tick,
} from '../../src/game/engine';
import type { GameState, MapEntity, Target } from '../../src/game/types';

/** The first270seconds of a legacy Guided seed-zero route. Five-second decisions
 * use actual group selections, exploration, materials and paid lessons.
 * The eastbound scout explores before the player can target distant resources.
 */
export function replayCampaignOpening(seed = 6842, until = 270) {
  let state: GameState = { ...createGame(seed, 'guided'), started: true };
  // This published campaign opening retains its original 90-second profile.
  delete state.openingBalanceVersion;
  delete state.openingCouncilsCompleted;
  let firstFireAt: number | null = null;
  const roleIds = new Set<string>();
  let houseStarted = false;
  let scoutId: string | undefined;
  const orders: {
    at: number;
    tokens: string[];
    target?: Target;
    executorId?: string;
    selectionCenter?: Target;
  }[] = [];
  const rejectedOrders: { at: number; tokens: string[]; reason: string }[] = [];
  const discoveries: { at: number; wordId: string }[] = [];
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
  const say = (tokens: string[], target?: Target, selection?: Target, executorId?: string) => {
    const adults = own().filter(
      (unit) => unit.age >= 4 && (state.time >= 60 || unit.id !== scoutId),
    );
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
    state = issueCommand(state, tokens, target, executorId, selection ?? anchor);
    if (state.stats.commands > previous)
      orders.push({
        at: state.time,
        tokens,
        target,
        executorId,
        selectionCenter: selection ?? anchor,
      });
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
      while (state.resources.wood >= (state.time === 270 ? 14 : 6) && state.attention < 40) {
        const previous = state.resources.wood;
        state = prepareCampfireCouncil(state);
        if (state.resources.wood === previous) break;
      }
      while (state.attention >= 10) {
        const priority = [
          'V_04',
          'V_05',
          'V_08',
          'V_10',
          'O_05',
          'S_02',
          'O_01',
          'O_03',
          'O_02',
          'M_02',
          'V_06',
        ];
        const word = priority
          .filter(
            (id) =>
              hasWord(state, id) &&
              state.words[id].retention < 75 &&
              own().some((u) => u.age < 14 && !state.words[id].custodians.includes(u.id)),
          )
          .sort(
            (a, b) =>
              Number(state.words[b].custodians.length === 1) -
                Number(state.words[a].custodians.length === 1) ||
              priority.indexOf(a) - priority.indexOf(b),
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
    if (step % 20 === 0) {
      const time = state.time;
      if (time === 0) {
        const people = own().filter((u) => u.age >= 4);
        let sent = false;
        for (const person of people)
          for (let direction = 0; direction < 16 && !sent; direction++) {
            const angle = (direction * Math.PI) / 8;
            const center = {
              type: 'point' as const,
              x: Math.round(person.x + 14 * Math.cos(angle)),
              y: Math.round(person.y + 14 * Math.sin(angle)),
            };
            if (
              people.filter((u) => Math.hypot(u.x - center.x, u.y - center.y) <= 15).length === 1
            ) {
              scoutId = person.id;
              say(['S_01', 'V_01'], { type: 'point', x: HOME.x + 90, y: HOME.y }, center);
              sent = true;
            }
          }
      }
      if (time === 5) say(['S_01', 'V_03'], entityTarget(tree));
      if (time === 20) say(['S_01', 'V_03'], entityTarget(nearest('stone')!));
      if (time === 60) {
        say(['S_01', 'V_01'], { type: 'point', ...HOME });
        if (scoutId && hasWord(state, 'S_02')) {
          const u = own().find((u) => u.id === scoutId)!;
          say(
            ['S_02', 'V_01'],
            { type: 'point', ...HOME },
            { type: 'point', x: u.x, y: u.y },
            u.id,
          );
        }
      }
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
      if (time === 130 && hasWord(state, 'S_02')) {
        const miner = own().find(
          (u) => u.age >= 4 && u.name !== 'Oru' && u.action !== 'crafting' && u.name !== 'Uma',
        )!;
        say(['S_02', 'V_04', 'O_02'], entityTarget(stone), undefined, miner.id);
        const hunter = own().find((u) => u.name === 'Oru')!;
        const prey = nearest('deer');
        if (prey) say(['S_02', 'V_03'], entityTarget(prey), undefined, hunter.id);
      }
      if (time === 150) {
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
      if (time === 160) say(['S_01', 'V_04'], entityTarget(nearest('berries', 3)!));
      if (time === 170) say(['S_01', 'V_04'], entityTarget(nearest('tree', 5)!));
      if (time === 135) {
        const u = own().find((u) => u.name === 'Nara')!;
        say(
          ['S_02', 'V_05', 'O_02'],
          { type: 'point', x: HOME.x + 4, y: HOME.y + 4 },
          undefined,
          u.id,
        );
      }
      if (
        [185, 190, 195, 200, 205].includes(time) &&
        state.voice >= 1 &&
        !own().some((u) => u.action === 'building') &&
        !state.buildings.some((b) => !b.cityId && b.kind === 'pen') &&
        state.resources.wood >= 20 &&
        hasWord(state, 'V_10')
      ) {
        const all = own().filter((u) => u.age >= 4);
        const people = all.filter((u) => u.hunger < 75 && !u.carry);
        let chosen: Target | undefined;
        for (const person of people)
          for (let direction = 0; direction < 16 && !chosen; direction++) {
            const angle = (direction * Math.PI) / 8;
            const center = {
              type: 'point' as const,
              x: Math.round(person.x + 14 * Math.cos(angle)),
              y: Math.round(person.y + 14 * Math.sin(angle)),
            };
            if (all.filter((u) => Math.hypot(u.x - center.x, u.y - center.y) <= 15).length === 1)
              chosen = center;
          }
        if (chosen)
          say(
            ['S_01', 'V_10', 'O_04', 'O_01'],
            { type: 'point', x: HOME.x - 4, y: HOME.y - 2 },
            chosen,
          );
      }
      if ([200, 205, 210, 215].includes(time)) {
        const slots =
          time === 200
            ? ['stone']
            : time === 205
              ? ['stone', 'wood']
              : time === 210
                ? ['wood']
                : [];
        for (const kind of slots) {
          const people = own().filter(
            (u) =>
              u.age >= 4 &&
              !u.jobBuildingId &&
              !u.suspendedJob &&
              !u.carry &&
              !roleIds.has(u.id) &&
              u.hunger < 75 &&
              u.action !== 'building',
          );
          const preferred = ['Nara', 'Oru', 'Tala', 'Uma', 'Ayla', 'Ilo', 'Korg'];
          people.sort((a, b) => preferred.indexOf(a.name) - preferred.indexOf(b.name));
          const u = people[0];
          if (u && state.voice >= 1) {
            const prior = state.stats.commands;
            say(
              ['S_02', 'V_04', kind === 'stone' ? 'O_02' : 'O_03'],
              entityTarget(kind === 'stone' ? stone : nearest('tree', 5)!),
              undefined,
              u.id,
            );
            if (state.stats.commands > prior) roleIds.add(u.id);
          }
        }
      }
      if (
        time >= 225 &&
        time < 270 &&
        !houseStarted &&
        state.resources.stone >= 20 &&
        state.resources.wood >= 10 &&
        state.voice >= 1 &&
        !own().some((u) => u.action === 'building')
      ) {
        const u = own()
          .filter(
            (u) => u.age >= 4 && !u.carry && !u.jobBuildingId && !u.suspendedJob && u.hunger < 75,
          )
          .sort(
            (a, b) =>
              Math.hypot(a.x - HOME.x, a.y - HOME.y) - Math.hypot(b.x - HOME.x, b.y - HOME.y),
          )[0];
        if (u) {
          const before = state.stats.commands;
          say(['S_02', 'V_08', 'O_02', 'O_01'], { type: 'point', ...HOME }, undefined, u.id);
          if (state.stats.commands > before) houseStarted = true;
        }
      }
      if (time === 310) {
        const hunter = own().find((u) => u.name === 'Korg')!;
        const prey = state.entities
          .filter((e) => e.kind === 'deer' && e.hp > 0)
          .sort(
            (a, b) =>
              Math.hypot(a.x - HOME.x, a.y - HOME.y) - Math.hypot(b.x - HOME.x, b.y - HOME.y),
          )[0];
        if (prey) say(['S_02', 'V_03'], entityTarget(prey), undefined, hunter.id);
      }
    }
    if (
      step % 20 === 0 &&
      state.time >= 170 &&
      hasWord(state, 'S_02') &&
      hasWord(state, 'O_05') &&
      hasWord(state, 'V_05')
    ) {
      const guardian = own().find((u) => u.name === 'Uma') ?? own().find((u) => u.age >= 14);
      if (
        guardian &&
        guardian.hunger < 75 &&
        guardian.action !== 'guarding' &&
        guardian.action !== 'building' &&
        state.voice >= 1 &&
        state.buildings.some((b) => !b.cityId && b.kind === 'campfire' && !b.active)
      )
        say(['S_02', 'V_05', 'O_05'], undefined, undefined, guardian.id);
    }
    if (state.time >= until) break;
    state = tick(state, 0.25);
  }
  return { state, firstFireAt, orders, rejectedOrders, discoveries };
}
