import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BUILDING_SPECS, emptyInventory, RESOURCE_ORDER, WORD_ORDER } from '../game/content';
import { createGame } from '../game/engine';
import { createCoastGeometry, isSeaPoint } from '../game/coastGeometry';
import {
  getPhrasebook,
  suggestedBoardingGroup,
  suggestedBoatBuilderGroup,
} from '../game/phrasebook';
import { findShoreAccess } from '../game/shoreAccess';
import { isDryLandPoint } from '../game/landNavigation';
import { BOAT_BUILD_COST, BOAT_BUILD_SECONDS } from '../game/maritimeConfig';
import { getUnitWorkStatus } from '../game/workDiagnostics';
import type { Boat, GameState } from '../game/types';
import { BoatPanel } from './BoatPanel';
import {
  getBoatPreparations,
  getBoatPresentation,
  getBoatCargoChoices,
  getSelectedCargoPreparations,
} from './maritimePresentation';
import { getVisibleWorldTargets } from './visibleWorldTargets';
import { getInventoryEntries } from './campInventory';
import { boatArtFrame, drawBoat, drawHarbor, unitIsSeatedAboard } from './mapMaritimeArt';
import { targetPresentation } from './targetPresentation';

function learn(state: GameState, ...words: string[]) {
  for (const word of words) {
    state.words[word] = { retention: 100, custodians: [state.units[0].id], uses: 0 };
    for (const unit of state.units) if (!unit.knows.includes(word)) unit.knows.push(word);
  }
}

function fixture() {
  const state = createGame(42, 'guided', 'random', 1000);
  state.started = true;
  state.paused = true;
  state.tier = 3;
  for (const sector of state.sectors) sector.explored = true;
  learn(state, 'O_01', 'O_02', 'O_03', 'O_04', 'V_04', 'V_06', 'V_08', 'M_02');
  const coast = createCoastGeometry(state)!;
  const inward = {
    x: coast.side === 'west' ? 1 : coast.side === 'east' ? -1 : 0,
    y: coast.side === 'north' ? 1 : coast.side === 'south' ? -1 : 0,
  };
  const access = coast.points
    .slice(3, 17)
    .map((point) =>
      findShoreAccess(state, {
        x: point.x + inward.x * 8,
        y: point.y + inward.y * 8,
      }),
    )
    .find((point) => point !== undefined)!;
  expect(access).toBeDefined();
  const harbor = {
    id: 'observed-harbor',
    kind: 'harbor' as const,
    ...access.land,
    hp: BUILDING_SPECS.harbor.maxHp,
    active: true,
    completed: true,
    seaAccess: { ...access.water },
  };
  state.buildings.push(harbor);
  const boat: Boat = {
    id: 'observed-boat',
    ...access.water,
    hp: 100,
    maxHp: 100,
    ownerId: 'player',
    harborId: harbor.id,
    status: 'moored',
    passengerIds: [],
    resources: emptyInventory(),
    paidMaterials: { ...emptyInventory(), ...BOAT_BUILD_COST },
    progress: BOAT_BUILD_SECONDS,
    accessLand: { ...access.land },
  };
  state.boats!.push(boat);
  for (const unit of state.units) Object.assign(unit, { ...access.land, action: 'idle' });
  return { state, boat, harbor, access };
}

const text = (markup: string) => markup.replace(/<[^>]+>/g, ' ');
const render = (state: GameState, boat: Boat) =>
  renderToStaticMarkup(
    createElement(BoatPanel, {
      state,
      target: { type: 'boat', id: boat.id, x: boat.x, y: boat.y },
      onPrepare: () => {},
    }),
  );

describe('reviewable maritime controls and physical presentation', () => {
  it('prepares each of the sixteen distinct cargo resources explicitly without paying or moving it', () => {
    const { state, boat } = fixture();
    learn(state, ...WORD_ORDER);
    const before = structuredClone(state);
    expect(getBoatCargoChoices(state, boat).map((choice) => choice.resource)).toEqual(
      RESOURCE_ORDER,
    );
    for (const resource of RESOURCE_ORDER) {
      const [load, unload] = getSelectedCargoPreparations(state, boat, resource);
      expect(load.tokens).toEqual(['S_01', 'V_04', 'M_02']);
      expect(unload.tokens).toEqual(['S_01', 'V_04', 'O_01']);
      expect(load.target).toMatchObject({ type: 'boat', id: boat.id, cargoResource: resource });
      expect(unload.target).toMatchObject({ cargoResource: resource });
      expect(load.issue).toBeUndefined();
      expect(unload.issue).toBeUndefined();
    }
    const selected = getSelectedCargoPreparations(state, boat, 'cookedFish')[0].target!;
    expect(targetPresentation(state, selected)!.description).toContain(
      'Carico scelto: Pesce cotto.',
    );
    const markup = render(state, boat);
    expect(markup).toContain('Altri carichi');
    expect(markup).toContain('aria-label="Risorsa da trasportare"');
    expect(markup).toContain('Prepara carico selezionato');
    expect(state).toEqual(before);
    expect(state.stats.commands).toBe(0);
    expect(state.voice).toBe(3);

    for (const word of ['O_07', 'V_12']) state.words[word].retention = 0;
    expect(getBoatCargoChoices(state, boat).some((choice) => choice.resource === 'ore')).toBe(
      false,
    );
    expect(getSelectedCargoPreparations(state, boat, 'ore')).toEqual([]);
  });

  it('prepares a named small crew only after Io, respecting the actual free seats without ordering', () => {
    const { state, boat, access } = fixture();
    const adults = state.units.filter((unit) => unit.age >= 4);
    expect(adults.length).toBeGreaterThan(3);
    const before = structuredClone(state);
    const local = getBoatPreparations(state, boat).find((item) => item.id === 'board')!;
    expect(local.issue).toContain('gruppo supera');
    expect(local.groupAnchor).toEqual({ type: 'point', ...access.land });
    expect(local.detail).toBeUndefined();
    expect(text(render(state, boat))).not.toMatch(/\d/);
    expect(state).toEqual(before);

    learn(state, 'S_02');
    const preparedBefore = structuredClone(state);
    const action = getBoatPreparations(state, boat).find((item) => item.id === 'board')!;
    expect(action.issue).toBeUndefined();
    expect(action.tokens).toEqual(['S_01', 'V_01']);
    expect(action.groupAnchor).toMatchObject({ id: 'selection:custom' });
    expect(action.groupAnchor!.unitIds).toHaveLength(3);
    expect(action.detail).toContain(
      state.units.find((unit) => unit.id === action.groupAnchor!.unitIds![0])!.name,
    );
    expect(state).toEqual(preparedBefore);
    expect(state.stats.commands).toBe(0);
    expect(state.voice).toBe(3);
    expect(state.phrasebook).toBeUndefined();

    const passenger = adults[0];
    passenger.boatId = boat.id;
    boat.passengerIds.push(passenger.id);
    expect(suggestedBoardingGroup(state, boat).groupAnchor.unitIds).toHaveLength(2);
    expect(suggestedBoardingGroup(state, boat).groupAnchor.unitIds).not.toContain(passenger.id);
  });

  it('keeps quantities and seafood names behind Numero and Preda while separating stiva from camp stock', () => {
    const { state, boat } = fixture();
    boat.resources.fish = 2;
    boat.resources.cookedFish = 3;
    state.words.O_04.retention = 0;
    let presentation = getBoatPresentation(state, boat)!;
    expect(presentation.inventory.find((entry) => entry.resource === 'fish')!.label).toBe(
      'Alimento crudo senza nome',
    );
    expect(presentation.inventory.find((entry) => entry.resource === 'cookedFish')!.label).toBe(
      'Alimento cotto senza nome',
    );
    expect(text(render(state, boat))).not.toMatch(/\d|Pesce/);
    learn(state, 'O_04', 'O_08');
    presentation = getBoatPresentation(state, boat)!;
    expect(presentation.cargo).toBe('5/20 di carico');
    expect(presentation.crew).toBe('0/3 persone a bordo');
    expect(presentation.inventory.find((entry) => entry.resource === 'fish')!.quantity).toBe('2');
    expect(presentation.inventory.find((entry) => entry.resource === 'cookedFish')!.quantity).toBe(
      '3',
    );
    expect(state.resources.fish).toBe(0);
    const person = state.units[0];
    person.action = 'returning';
    person.carry = { resource: 'fish', amount: 1 };
    person.deliveryBoatId = boat.id;
    expect(getInventoryEntries(state).find((entry) => entry.resource === 'fish')).toBeUndefined();
    person.deliveryBoatId = undefined;
    person.deliveryPoint = { x: person.x + 8, y: person.y };
    expect(getUnitWorkStatus(state, person).title).toBe('Porta pesce crudo sulla riva');
    expect(getUnitWorkStatus(state, person).detail).toContain('lasciato fisicamente sulla riva');
  });

  it('suggests only observed supported destinations and records no order while preparing references', () => {
    const { state, boat, harbor } = fixture();
    learn(state, 'S_02');
    const before = structuredClone(state);
    let book = getPhrasebook(state);
    expect(
      book.find((entry) => entry.title === 'Costruisci una barca all’approdo')!.suggestedTarget,
    ).toMatchObject({ id: harbor.id });
    expect(
      book.find((entry) => entry.title === 'Imbarca un equipaggio')!.suggestedGroupAnchor!.unitIds,
    ).toHaveLength(3);
    expect(state).toEqual(before);
    const person = state.units[0];
    Object.assign(person, { boatId: boat.id, x: boat.x, y: boat.y, action: 'sailing' });
    boat.passengerIds = [person.id];
    book = getPhrasebook(state);
    expect(
      book.find((entry) => entry.title === 'Naviga con la barca')!.suggestedGroupAnchor,
    ).toMatchObject({ type: 'boat', id: boat.id });
    const visible = getVisibleWorldTargets(state, { minX: 0, minY: 0, maxX: 1000, maxY: 1000 });
    expect(visible.find((entry) => entry.target.id === boat.id)!.target).toEqual({
      type: 'boat',
      id: boat.id,
      x: boat.x,
      y: boat.y,
    });
    for (const sector of state.sectors) sector.explored = false;
    expect(getBoatPresentation(state, boat)).toBeNull();
    expect(getPhrasebook(state).some((entry) => entry.suggestedGroupAnchor?.type === 'boat')).toBe(
      false,
    );
    expect(render(state, boat)).toBe('');
    state.mapGeneration!.maritimeRules = undefined;
    for (const sector of state.sectors) sector.explored = true;
    expect(getPhrasebook(state).some((entry) => entry.buildingKind === 'harbor')).toBe(false);
    expect(
      getPhrasebook(state).some((entry) => entry.title === 'Costruisci una barca all’approdo'),
    ).toBe(false);
  });

  it('selects a real reachable artisan for an empty harbor and leaves travellers on their missions', () => {
    const { state, harbor, access } = fixture();
    learn(state, 'S_02');
    const dx = access.land.x - access.water.x,
      dy = access.land.y - access.water.y;
    const length = Math.hypot(dx, dy);
    for (const unit of state.units)
      Object.assign(unit, {
        x: access.land.x + (dx / length) * 22,
        y: access.land.y + (dy / length) * 22,
      });
    state.units[0].action = 'delegating';
    const before = structuredClone(state);
    const group = suggestedBoatBuilderGroup(state, harbor)!;
    expect(group.unitIds).toHaveLength(1);
    expect(group.unitIds).not.toContain(state.units[0].id);
    const artisan = state.units.find((unit) => unit.id === group.unitIds![0])!;
    expect(group).toMatchObject({ x: artisan.x, y: artisan.y });
    expect(Math.hypot(group.x - harbor.x, group.y - harbor.y)).toBeGreaterThan(15);
    expect(
      getPhrasebook(state).find((entry) => entry.title === 'Costruisci una barca all’approdo')!
        .suggestedGroupAnchor,
    ).toEqual(group);
    expect(state).toEqual(before);
  });

  it('freezes crew rowing on pause, shows only real passengers and paints no hidden boat or pier', () => {
    const { state, boat, harbor } = fixture();
    const person = state.units[0];
    Object.assign(person, { boatId: boat.id, action: 'sailing', x: boat.x, y: boat.y });
    boat.passengerIds = [person.id];
    boat.status = 'sailing';
    boat.destination = { x: boat.x + 20, y: boat.y + 10 };
    state.time = 15;
    expect(isSeaPoint(state, boat)).toBe(true);
    expect(isDryLandPoint(state, harbor)).toBe(true);
    expect(unitIsSeatedAboard(state, person)).toBe(true);
    expect(boatArtFrame(state, boat, 100)).toEqual(boatArtFrame(state, boat, 200));
    state.paused = false;
    expect(boatArtFrame(state, boat, 100).stroke).not.toBe(boatArtFrame(state, boat, 200).stroke);
    expect(boatArtFrame(state, boat, 100, true).stroke).toBe(0);
    expect(getUnitWorkStatus(state, person).title).toBe('Naviga con l’equipaggio');
    person.action = 'disembarking';
    expect(unitIsSeatedAboard(state, person)).toBe(false);
    expect(boatArtFrame(state, boat, 100).passengers).toEqual([]);
    for (const sector of state.sectors) sector.explored = false;
    drawBoat({} as CanvasRenderingContext2D, state, boat, 100);
    drawHarbor({} as CanvasRenderingContext2D, state, harbor);
    expect(
      targetPresentation(state, { type: 'boat', id: boat.id, x: boat.x, y: boat.y }),
    ).toBeNull();
  });
});
