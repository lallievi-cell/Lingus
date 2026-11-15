import { describe, expect, it } from 'vitest';
import { createGame } from '../game/engine';
import { createCoastGeometry, isSeaPoint } from '../game/coastGeometry';
import { getPhrasebook, suggestedFishingTarget } from '../game/phrasebook';
import { getUnitWorkStatus } from '../game/workDiagnostics';
import { getOrderPreview } from '../game/orderPreview';
import { resolveInteractionPosition } from '../game/interactionPositions';
import { isLandPoint, planLandRoute } from '../game/landNavigation';
import { sectorIndex } from '../game/worldDimensions';
import type { GameState } from '../game/types';
import { entityTargetPresentation, targetPresentation } from './targetPresentation';
import { getInventoryEntries, getCampStockSlots } from './campInventory';
import { getVisibleWorldTargets } from './visibleWorldTargets';
import { describeResourceAmount } from './semanticReadability';

function learn(state: GameState, ...ids: string[]) {
  for (const id of ids) {
    state.words[id] = { retention: 100, custodians: [state.units[0].id], uses: 0 };
    for (const unit of state.units) if (!unit.knows.includes(id)) unit.knows.push(id);
  }
}

function fixture() {
  const state = createGame(123, 'guided', 'random', 1000);
  state.started = true;
  state.paused = true;
  state.tier = 2;
  learn(state, 'V_04', 'O_04', 'O_01', 'O_02', 'O_03', 'O_05', 'V_07');
  const fishery = state.entities.find((entity) => entity.kind === 'fishery')!;
  expect(fishery).toBeDefined();
  for (const sector of state.sectors)
    if (sector.x === sectorIndex(state, fishery.x) && sector.y === sectorIndex(state, fishery.y))
      sector.explored = true;
  return { state, fishery };
}

describe('coastal information follows real geography, work and knowledge', () => {
  it('offers an observed reachable fishing reference without ordering, paying or remembering it', () => {
    const { state } = fixture();
    const before = structuredClone(state);
    const item = getPhrasebook(state).find((entry) => entry.title === 'Pesca e porta al campo')!;
    expect(item).toBeDefined();
    expect(item.tokens).toEqual(['S_01', 'V_04', 'O_04']);
    expect(item.available).toBe(true);
    expect(item.suggestedTarget?.type).toBe('entity');
    const source = state.entities.find((entity) => entity.id === item.suggestedTarget?.id)!;
    expect(source.kind).toBe('fishery');
    expect(isLandPoint(state, source)).toBe(true);
    expect(planLandRoute(state, state.units[0], source)).not.toBeNull();
    expect(state).toEqual(before);
    expect(state.stats.commands).toBe(0);
    expect(state.voice).toBe(3);
    expect(state.phrasebook).toBeUndefined();
    const preview = getOrderPreview(state, item.tokens, item.suggestedTarget);
    expect(preview.accepted).toBe(true);
    expect(preview.behaviour).toContain('riserva finita');
    const berries = state.entities.find((entity) => entity.kind === 'berries')!;
    const gather = getOrderPreview(state, item.tokens, {
      type: 'entity',
      id: berries.id,
      x: berries.x,
      y: berries.y,
    });
    expect(gather.accepted).toBe(true);
    expect(gather.behaviour).toContain('Raccoglie cibo');
    expect(gather.behaviour).not.toContain('pesca');
    expect(state).toEqual(before);
  });

  it('never suggests unseen, depleted or offshore fishing points or adds them to legacy maps', () => {
    const { state } = fixture();
    for (const sector of state.sectors) sector.explored = false;
    expect(suggestedFishingTarget(state)).toBeUndefined();
    for (const sector of state.sectors) sector.explored = true;
    state.entities
      .filter((entity) => entity.kind === 'fishery')
      .forEach((entity) => {
        entity.amount = 0;
      });
    expect(suggestedFishingTarget(state)).toBeUndefined();
    const coast = createCoastGeometry(state)!;
    const shore = coast.points[4];
    const fishery = state.entities.find((entity) => entity.kind === 'fishery')!;
    Object.assign(fishery, {
      amount: 40,
      x: shore.x + (coast.side === 'east' ? 20 : coast.side === 'west' ? -20 : 0),
      y: shore.y + (coast.side === 'south' ? 20 : coast.side === 'north' ? -20 : 0),
    });
    expect(isSeaPoint(state, fishery)).toBe(true);
    expect(suggestedFishingTarget(state)).toBeUndefined();
    const legacy = createGame();
    learn(legacy, 'V_04', 'O_04');
    expect(suggestedFishingTarget(legacy)).toBeUndefined();
    expect(getPhrasebook(legacy).some((entry) => entry.title === 'Pesca e porta al campo')).toBe(
      false,
    );
  });

  it('keeps fishing names and amounts behind Preda and Numero and target anchors on land', () => {
    const { state, fishery } = fixture();
    state.words.O_04.retention = 0;
    expect(entityTargetPresentation(state, fishery)?.label).toBe('Movimenti nell’acqua');
    learn(state, 'O_04');
    const presentation = entityTargetPresentation(state, fishery)!;
    expect(presentation.label).toContain('Punto di pesca');
    expect(presentation.label).not.toMatch(/\d/);
    const targets = getVisibleWorldTargets(state, { minX: 0, minY: 0, maxX: 1000, maxY: 1000 });
    const entry = targets.find((target) => target.target.id === fishery.id)!;
    expect(entry.target).toMatchObject({ x: fishery.x, y: fishery.y });
    learn(state, 'O_08');
    expect(entityTargetPresentation(state, fishery)?.label).toContain(String(fishery.amount));
    for (const sector of state.sectors) sector.explored = false;
    expect(entityTargetPresentation(state, fishery)).toBeNull();
  });

  it('describes open sea without proposing a ford', () => {
    const { state } = fixture();
    const coast = createCoastGeometry(state)!;
    const shore = coast.points[4];
    const point = {
      x: shore.x + (coast.side === 'east' ? 20 : coast.side === 'west' ? -20 : 0),
      y: shore.y + (coast.side === 'south' ? 20 : coast.side === 'north' ? -20 : 0),
    };
    expect(isSeaPoint(state, point)).toBe(true);
    for (const sector of state.sectors) sector.explored = true;
    const presentation = targetPresentation(state, { type: 'point', ...point })!;
    expect(presentation.label).toBe('Mare');
    expect(`${presentation.description} ${presentation.hint}`).not.toMatch(/guado/i);
  });

  it('names fishing only at its actual work position, and names the physical cargo and paid cook input', () => {
    const { state, fishery } = fixture();
    const unit = state.units[0];
    Object.assign(unit, {
      action: 'gathering',
      targetId: fishery.id,
      command: ['S_01', 'V_04', 'O_04'],
      progress: 0,
    });
    expect(getUnitWorkStatus(state, unit).title).toBe('Va a pescare');
    const place = resolveInteractionPosition(state, unit, fishery, {
      kind: 'forage',
      key: `forage:${fishery.id}`,
      maxRadius: 2,
    });
    Object.assign(unit, isLandPoint(state, place) ? place : { x: fishery.x, y: fishery.y });
    unit.progress = 1;
    expect(getUnitWorkStatus(state, unit).title).toBe('Pesca dalla riva');
    unit.action = 'returning';
    unit.carry = { resource: 'fish', amount: 1 };
    expect(getUnitWorkStatus(state, unit).title).toBe('Porta pesce crudo al campo');
    unit.action = 'cooking';
    unit.carry = undefined;
    unit.cookInput = 'fish';
    expect(getUnitWorkStatus(state, unit).title).toBe('Cuoce pesce');
  });

  it('keeps seafood inventories distinct and omits empty seafood from old worlds', () => {
    const legacy = createGame();
    expect(
      getInventoryEntries(legacy).some((entry) => ['fish', 'cookedFish'].includes(entry.resource)),
    ).toBe(false);
    const { state } = fixture();
    state.resources.fish = 2;
    state.resources.cookedFish = 3;
    const entries = getInventoryEntries(state);
    expect(entries.find((entry) => entry.resource === 'fish')).toMatchObject({
      label: 'Pesce crudo',
      amount: 2,
    });
    expect(entries.find((entry) => entry.resource === 'cookedFish')).toMatchObject({
      label: 'Pesce cotto',
      amount: 3,
    });
    expect(getCampStockSlots(state).find((slot) => slot.group === 'food')?.resources).toEqual(
      expect.arrayContaining(['fish', 'cookedFish']),
    );
    expect(describeResourceAmount('fish', 2, false)).toBe('Poco pesce crudo');
    expect(describeResourceAmount('cookedFish', 3, false)).toBe('Poco pesce cotto');
    state.words.O_04.retention = 0;
    expect(getInventoryEntries(state).find((entry) => entry.resource === 'fish')?.label).toBe(
      'Alimento crudo senza nome',
    );
  });
});
