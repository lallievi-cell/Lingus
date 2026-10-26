import { BUILDING_SPECS, INNATE_WORDS } from '../../src/game/content';
import {
  compileSentence,
  dismissCampfire,
  hasWord,
  inscribeDogma,
  issueCommand,
  prepareCampfireCouncil,
  rehearseWord,
  solveSpark,
  teachWord,
  tick,
} from '../../src/game/engine';
import {
  fertilityBlockers,
  getGrowthReadiness,
  villageHousing,
} from '../../src/game/growthReadiness';
import type { MapEntity, Target, Unit } from '../../src/game/types';
import { replayCampaignOpening } from './campaignOpening';

export interface CampaignAction {
  at: number;
  tokens: string[];
  target?: Target;
  executorId?: string;
  selectionCenter?: Target;
  accepted: boolean;
  reason?: string;
}
export interface CampaignSnapshot {
  at: number;
  population: number;
  births: number;
  naturalDeaths: number;
  otherDeaths: number;
  tier: number;
  housing: number;
  cohesion: number;
  food: number;
  wood: number;
  stone: number;
  seeds: number;
  aliveWords: number;
  stableWords: number;
  buildings: string[];
  readyParents: number;
  phase: string;
}
export interface FertilityReport {
  at: number;
  readiness: ReturnType<typeof getGrowthReadiness>;
  people: {
    id: string;
    name: string;
    sex: Unit['sex'];
    age: number;
    hunger: number;
    homeDistance: number;
    blockers: string[];
  }[];
}

/** A bounded Guided replay from the original seven people and four innate words.
 * All changes use public commands, real sparks, paid lessons and ordinary ticks.
 * Reading a resource or a unit never changes it; only explored nodes are targeted.
 */
export function replayContinuousCampaign(seed = 6842, until = 1800) {
  const opening = replayCampaignOpening(seed, 270);
  let state = opening.state;
  const actions: CampaignAction[] = opening.orders.map((order) => ({ ...order, accepted: true }));
  const discoveries = [...opening.discoveries];
  const snapshots: CampaignSnapshot[] = [];
  const fertilityReports: FertilityReport[] = [];
  const fedParents = new Set<string>();
  let maxPopulation = Math.max(
    7,
    opening.state.units.filter((u) => u.hp > 0 && u.factionId === 'player').length,
  );
  let nextDecision = state.time;
  let nextSnapshot = (Math.floor(state.time / 90) + 1) * 90;
  let phase = 'continuazione';
  const people = () => state.units.filter((u) => !u.factionId || u.factionId === 'player');
  const own = () => people().filter((u) => u.hp > 0);
  const adults = () => own().filter((u) => u.age >= 4);
  const homeDistance = (p: { x: number; y: number }) =>
    Math.hypot(p.x - state.home.x, p.y - state.home.y);
  const visible = (p: { x: number; y: number }) =>
    state.tier >= 4 ||
    state.sectors.some(
      (s) => s.explored && s.x === Math.floor(p.x / 100) && s.y === Math.floor(p.y / 100),
    );
  const targetFor = (e: MapEntity): Target => ({ type: 'entity', id: e.id, x: e.x, y: e.y });
  const nearest = (kind: MapEntity['kind'], minimum = 0, alive = false) =>
    state.entities
      .filter((e) => e.kind === kind && e.amount > minimum && visible(e) && (!alive || e.hp > 0))
      .sort((a, b) => homeDistance(a) - homeDistance(b))[0];
  const villageBuildings = () =>
    state.buildings.filter((b) => !b.cityId && b.hp > 0 && b.completed !== false);
  const hasBuilding = (kind: string) => villageBuildings().some((b) => b.kind === kind);
  const foodNutrition = () =>
    state.resources.food * 25 +
    state.resources.meat * 40 +
    state.resources.cooked * 60 +
    state.entities
      .filter(
        (e) =>
          e.kind === 'ground' &&
          ['food', 'meat', 'cooked'].includes(e.resource ?? '') &&
          homeDistance(e) < 15,
      )
      .reduce(
        (sum, e) => sum + e.amount * (e.resource === 'food' ? 25 : e.resource === 'meat' ? 40 : 60),
        0,
      );
  const assigned = (unit: Unit, buildingId: string) =>
    unit.jobBuildingId === buildingId || unit.suspendedJob?.buildingId === buildingId;
  const idle = (u: Unit) =>
    !u.isKing &&
    !u.jobBuildingId &&
    !u.suspendedJob &&
    !u.carry &&
    ['idle', 'sleeping', 'resting', 'guarding'].includes(u.action);
  const say = (tokens: string[], target?: Target, executorId?: string) => {
    if (state.voice < 1 || !tokens.every((id) => hasWord(state, id))) return false;
    if (
      tokens.includes('V_04') &&
      !tokens.includes('M_02') &&
      hasWord(state, 'M_02') &&
      compileSentence(state, [...tokens, 'M_02'], target).valid
    )
      tokens = [...tokens, 'M_02'];
    if (!compileSentence(state, tokens, target).valid) return false;
    const before = state.stats.commands;
    const anchor: Target = { type: 'point', ...state.home };
    state = issueCommand(state, tokens, target, executorId, anchor);
    const accepted = state.stats.commands > before;
    actions.push({
      at: state.time,
      tokens: [...tokens],
      target,
      executorId,
      selectionCenter: anchor,
      accepted,
      reason: accepted ? undefined : state.logs[0]?.text,
    });
    return accepted;
  };
  const record = () =>
    snapshots.push({
      at: state.time,
      population: own().length,
      births: state.stats.births,
      naturalDeaths: people().filter((u) => u.hp <= 0 && u.lastDamageCause === 'oldAge').length,
      otherDeaths: people().filter((u) => u.hp <= 0 && u.lastDamageCause !== 'oldAge').length,
      tier: state.tier,
      housing: villageHousing(state),
      cohesion: state.cohesion,
      food: foodNutrition(),
      wood: state.resources.wood,
      stone: state.resources.stone,
      seeds: state.resources.seed,
      aliveWords: Object.keys(state.words).filter((id) => hasWord(state, id)).length,
      stableWords: Object.keys(state.words).filter((id) => state.words[id].retention >= 50).length,
      buildings: villageBuildings().map((b) => b.kind),
      readyParents: own().filter((u) => fertilityBlockers(state, u, { ageOffset: 1 }).length === 0)
        .length,
      phase,
    });
  record();
  while (state.time < until && !state.gameOver && !state.victory) {
    for (const spark of [...state.sparks]) {
      // Naming a king immediately installs a monarchy. A tiny village does not
      // need to crown an elderly founder and incur a succession crisis.
      if (spark.wordId === 'S_07' && own().length < 35) continue;
      const known = hasWord(state, spark.wordId);
      state = solveSpark(state, spark.id, spark.recipe);
      if (!known && hasWord(state, spark.wordId))
        discoveries.push({ at: state.time, wordId: spark.wordId });
    }
    if (
      hasBuilding('menhir') &&
      !state.dogmas.some((d) => d.targetId === 'S_04' && d.vectorId === 'M_04') &&
      ['S_04', 'M_03', 'M_04'].every((id) => hasWord(state, id))
    )
      state = inscribeDogma(state, 'S_04', 'M_04');
    if (state.campfirePending) {
      while (state.resources.wood > 6 && state.attention < 100) {
        const before = state.resources.wood;
        state = prepareCampfireCouncil(state);
        if (state.resources.wood === before) break;
      }
      while (state.attention >= 10) {
        const priority = (id: string) =>
          state.words[id].custodians.length === 1 &&
          own().some((u) => state.words[id].custodians.includes(u.id) && u.age >= 12)
            ? -1000
            : id === 'O_05' && state.words[id].retention < 24
              ? -100
              : state.words[id].retention >= 70
                ? 1000
                : state.words[id].retention >= 30
                  ? -state.words[id].retention
                  : 100 - state.words[id].retention;
        const word = Object.keys(state.words)
          .filter(
            (id) =>
              !INNATE_WORDS.includes(id) &&
              hasWord(state, id) &&
              own().some(
                (u) =>
                  u.age < 14 && u.caste !== 'slave' && !state.words[id].custodians.includes(u.id),
              ),
          )
          .sort((a, b) => priority(a) - priority(b))[0];
        if (!word) break;
        const before = state.stats.taught;
        state = teachWord(state, word);
        if (state.stats.taught === before) break;
      }
      while (state.attention >= 10) {
        const word = Object.keys(state.words)
          .filter(
            (id) =>
              !INNATE_WORDS.includes(id) && hasWord(state, id) && state.words[id].retention < 80,
          )
          .sort((a, b) => state.words[a].retention - state.words[b].retention)
          .find((id) => {
            const next = rehearseWord(state, id);
            if (next !== state) {
              state = next;
              return true;
            }
            return false;
          });
        if (!word) break;
      }
      state = dismissCampfire(state);
    }
    maxPopulation = Math.max(maxPopulation, own().length);
    if (state.time >= nextSnapshot) {
      record();
      nextSnapshot += 90;
    }
    if (state.time >= nextDecision) {
      nextDecision += 5;
      const day = state.time % 90 < 55 && !state.disasters.blizzard;
      const season = Math.floor(state.time / 90) % 4;
      const pens = villageBuildings().filter((b) => b.kind === 'pen' && b.active);
      const herders = adults().filter((u) => pens.some((b) => assigned(u, b.id)));
      const neededHerders = Math.min(
        pens.length * 2,
        Math.max(1, Math.ceil(own().length / 5) - (foodNutrition() > own().length * 140 ? 1 : 0)),
      );
      const needsPen = pens.length < Math.ceil(own().length / 7);
      const corpses = state.entities.some(
        (e) => e.kind === 'corpse' && e.amount > 0 && homeDistance(e) <= 100,
      );
      const gravedigger =
        own().length < 7 && !corpses
          ? adults().find((u) =>
              villageBuildings().some((b) => b.kind === 'grave' && assigned(u, b.id)),
            )
          : undefined;
      const excessHerder =
        herders.length > neededHerders
          ? herders.find((u) => u.hunger < 70 && u.temp > 30)
          : undefined;
      const available = adults()
        .filter(idle)
        .filter((u) => u.hunger < 70 && u.temp > 30)
        .sort((a, b) => a.age - b.age || a.hunger - b.hunger);
      const person = excessHerder ?? gravedigger ?? available[0];
      const transportCount = (token: string) =>
        adults().filter(
          (u) =>
            u.command?.includes('V_04') &&
            u.command.includes(token) &&
            ['gathering', 'returning'].includes(u.action),
        ).length;
      const collect = (unit: Unit, token: string) => {
        const resource = token === 'O_03' ? 'wood' : token === 'O_02' ? 'stone' : 'food';
        const pile = state.entities
          .filter(
            (e) => e.kind === 'ground' && e.resource === resource && e.amount >= 1 && visible(e),
          )
          .sort((a, b) => homeDistance(a) - homeDistance(b))[0];
        const node =
          pile ??
          nearest(
            token === 'O_03' ? 'tree' : token === 'O_02' ? 'stone' : 'berries',
            token === 'O_04' ? 3 : 0,
          );
        return !!node && say(['S_02', 'V_04', token], targetFor(node), unit.id);
      };
      const forage = (unit: Unit) => {
        const carcass = state.entities
          .filter(
            (e) =>
              ['deer', 'wolf', 'alpha', 'mammoth'].includes(e.kind) &&
              e.hp <= 0 &&
              e.amount > 0 &&
              visible(e),
          )
          .sort((a, b) => homeDistance(a) - homeDistance(b))[0];
        if (carcass) return say(['S_02', 'V_04', 'O_04'], targetFor(carcass), unit.id);
        if (season !== 3) return collect(unit, 'O_04');
        const deer = nearest('deer', 0, true);
        return !!deer && say(['S_02', 'V_03', 'O_04'], targetFor(deer), unit.id);
      };
      const build = (kind: keyof typeof BUILDING_SPECS, unit: Unit) => {
        const spec = BUILDING_SPECS[kind];
        if (adults().some((u) => u.action === 'building')) return false;
        if (
          !Object.entries(spec.cost).every(
            ([r, n]) => state.resources[r as keyof typeof state.resources] >= n,
          ) &&
          !(kind === 'storage' && state.resources.stone >= 10)
        )
          return false;
        const count = villageBuildings().length;
        return say(
          ['S_02', ...spec.recipe],
          {
            type: 'point',
            x: kind === 'house' ? state.home.x : state.home.x + Math.round(Math.cos(count) * 4),
            y: kind === 'house' ? state.home.y + 2 : state.home.y + Math.round(Math.sin(count) * 4),
          },
          unit.id,
        );
      };
      const assign = (kind: 'pen' | 'grave' | 'farm', unit: Unit) => {
        const b = villageBuildings().find(
          (b) =>
            b.kind === kind &&
            b.active &&
            adults().filter((u) => assigned(u, b.id)).length < BUILDING_SPECS[kind].workers,
        );
        return (
          !!b &&
          say(
            ['S_02', ...BUILDING_SPECS[kind].recipe],
            { type: 'building', id: b.id, x: b.x, y: b.y },
            unit.id,
          )
        );
      };
      phase = day ? 'ruoli individuali' : 'riposo';
      if (day && person && state.voice >= 1) {
        const closed = villageBuildings().find((b) => b.kind === 'pen' && !b.active);
        const plans: [boolean, () => boolean, string][] = [
          [
            !!closed && state.resources.food >= 5,
            () =>
              say(
                ['S_02', ...BUILDING_SPECS.pen.recipe],
                { type: 'building', id: closed!.id, x: closed!.x, y: closed!.y },
                person.id,
              ),
            'rifornire il recinto',
          ],
          [!hasBuilding('depot'), () => build('depot', person), 'deposito'],
          [
            hasBuilding('grave') &&
              (corpses || own().length >= 7) &&
              !adults().some((u) =>
                villageBuildings().some((b) => b.kind === 'grave' && assigned(u, b.id)),
              ),
            () => assign('grave', person),
            'custodia del tumulo',
          ],
          [herders.length < neededHerders, () => assign('pen', person), 'allevatori'],
          [
            !hasBuilding('house') && state.resources.wood >= 14,
            () => build('house', person),
            'primo riparo',
          ],
          [!pens.length && state.resources.wood >= 22, () => build('pen', person), 'recinto'],
          [
            hasBuilding('house') && state.resources.stone < 3 && transportCount('O_02') < 1,
            () => collect(person, 'O_02'),
            'manutenzione della casa',
          ],
          [
            hasBuilding('house') &&
              !hasBuilding('storage') &&
              (state.resources.wood >= 10 || state.resources.stone >= 13),
            () => build('storage', person),
            'pozzo scorte',
          ],
          [
            hasBuilding('house') &&
              !hasBuilding('storage') &&
              state.resources.stone < 13 &&
              transportCount('O_02') < 1,
            () => collect(person, 'O_02'),
            'pietra per scorte',
          ],
          [
            hasBuilding('grave') && !hasBuilding('menhir') && state.resources.stone >= 23,
            () => build('menhir', person),
            'pietra sacra',
          ],
          [
            villageHousing(state) < own().length * 2 &&
              state.resources.stone >= 23 &&
              state.resources.wood >= 14,
            () => build('house', person),
            'alloggi',
          ],
          [
            !hasBuilding('grave') &&
              state.resources.stone < 31 &&
              state.resources.wood >= 4 &&
              transportCount('O_02') < 2,
            () => collect(person, 'O_02'),
            'pietra funeraria prioritaria',
          ],
          [
            season !== 3 &&
              state.resources.food <
                Math.max(12, villageBuildings().filter((b) => b.kind === 'pen').length * 5 + 5) &&
              transportCount('O_04') < 1,
            () => collect(person, 'O_04'),
            'foraggio per il bestiame',
          ],
          [
            state.resources.wood < 12 && transportCount('O_03') < 2,
            () => collect(person, 'O_03'),
            'combustibile urgente',
          ],
          [
            !hasBuilding('house') && state.resources.stone < 20 && transportCount('O_02') < 2,
            () => collect(person, 'O_02'),
            'pietra per casa',
          ],
          [
            !hasBuilding('grave') && state.resources.stone >= 31,
            () => build('grave', person),
            'tumulo',
          ],
          [
            pens.length > 0 && state.resources.stone < 35 && transportCount('O_02') < 1,
            () => collect(person, 'O_02'),
            'riserva di pietra',
          ],
          [
            foodNutrition() < own().length * 15 && transportCount('O_04') < (pens.length ? 1 : 2),
            () => forage(person),
            'cibo',
          ],
          [
            state.resources.wood < (needsPen ? 30 : pens.length ? 22 : 24) &&
              transportCount('O_03') < (needsPen ? 2 : pens.length ? 1 : 2),
            () => collect(person, 'O_03'),
            'legna',
          ],
          [
            !hasBuilding('hut') && state.resources.wood >= 14,
            () => build('hut', person),
            'capanna',
          ],
          [!hasBuilding('farm'), () => build('farm', person), 'campo'],
          [
            state.resources.meat >= 1 &&
              state.resources.cooked < own().length * 2 &&
              !adults().some((u) => u.action === 'cooking'),
            () => say(['S_02', 'V_07', 'O_04', 'O_05'], undefined, person.id),
            'cottura',
          ],
        ];
        for (const [enabled, perform, label] of plans)
          if (enabled && perform()) {
            phase = label;
            break;
          }
      }
      // Nearby building work is valid at night; spend saved inputs before council fuel.
      if (state.voice >= 1) {
        const builder = adults()
          .filter(idle)
          .filter((u) => u.hunger < 75 && u.temp > 30)
          .sort((a, b) => a.hunger - b.hunger)[0];
        if (
          builder &&
          villageHousing(state) < own().length * 2 &&
          state.resources.stone >= 23 &&
          state.resources.wood >= 14
        )
          build('house', builder);
        else if (builder && needsPen && state.resources.wood >= 24) build('pen', builder);
      }
      if (state.voice >= 1 && state.time % 90 >= 70 && foodNutrition() > 0) {
        const seasonId = Math.floor(state.time / 90);
        const hungry = adults()
          .filter(
            (u) =>
              u.age < 13 &&
              u.hunger > 45 &&
              homeDistance(u) <= 10 &&
              !u.carry &&
              !fedParents.has(`${seasonId}:${u.id}`),
          )
          .sort((a, b) => b.hunger - a.hunger)[0];
        if (hungry && say(['S_02', 'V_02', 'O_04'], undefined, hungry.id))
          fedParents.add(`${seasonId}:${hungry.id}`);
      }
      const fire = villageBuildings().find((b) => b.kind === 'campfire');
      if (fire && !fire.active && state.resources.wood >= 1 && state.voice >= 1) {
        const guardian = available.find((u) => u.age >= 14) ?? person;
        if (guardian) say(['S_02', 'V_05', 'O_05'], undefined, guardian.id);
      }
      for (const kind of ['pen', 'grave', 'farm'] as const) {
        if (!day || state.voice < 1) break;
        if (kind === 'grave' && !corpses && own().length < 7) continue;
        if (
          kind === 'pen' &&
          adults().filter((u) => pens.some((b) => assigned(u, b.id))).length >= neededHerders
        )
          continue;
        const free = adults().find((u) => idle(u) && u.hunger < 60);
        if (free) assign(kind, free);
      }
    }
    if (state.time % 90 === 85)
      fertilityReports.push({
        at: state.time,
        readiness: getGrowthReadiness(state),
        people: own().map((u) => ({
          id: u.id,
          name: u.name,
          sex: u.sex,
          age: u.age,
          hunger: u.hunger,
          homeDistance: homeDistance(u),
          blockers: fertilityBlockers(state, u, { ageOffset: 1 }),
        })),
      });
    const before = state.time;
    state = tick(state, Math.min(5, until - state.time));
    if (state.time === before && !state.campfirePending) break;
  }
  maxPopulation = Math.max(maxPopulation, own().length);
  record();
  return {
    state,
    actions,
    discoveries,
    snapshots,
    fertilityReports,
    opening: { firstFireAt: opening.firstFireAt, orders: opening.orders.length },
    maxPopulation,
  };
}
