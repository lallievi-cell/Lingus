import { describe, expect, it } from 'vitest';
import { createGame } from '../game/engine';
import { targetPresentation } from './targetPresentation';
import {
  lifeStageLabel,
  physicalWarnings,
  sexLabel,
  unitLifeHint,
  visibleUnitName,
} from './unitReadability';

describe('observable people before names and arithmetic', () => {
  it('distinguishes sex and each stage without requiring a learned word', () => {
    const state = createGame(6842);
    const child = state.units.find((unit) => unit.name === 'Ilo')!;
    expect(lifeStageLabel(child)).toBe('Bambino');
    expect(sexLabel(child)).toBe('Maschio');
    expect(unitLifeHint(child)).toContain('Troppo giovane per lavorare');
    expect(unitLifeHint(child)).toContain('Può imparare al Falò');
    const female = state.units.find((unit) => unit.name === 'Uma')!;
    expect(lifeStageLabel(female)).toBe('Anziana');
    expect(sexLabel(female)).toBe('Donna');
    expect(lifeStageLabel({ ...female, age: 0 })).toBe('Neonata');
    expect(lifeStageLabel({ ...female, age: 8 })).toBe('Adulta');
    expect(visibleUnitName(state, female)).toBe('Una compagna');
    state.words.S_02 = { retention: 50, uses: 0, custodians: [female.id] };
    expect(visibleUnitName(state, female)).toBe('Uma');
  });

  it('presents critical cold, hunger and wounds even when a person holds no discovered word', () => {
    const state = createGame(6842);
    const person = state.units[0];
    Object.assign(person, { temp: 20, hunger: 95, hp: 30 });
    expect(physicalWarnings(person).map((warning) => warning.label)).toEqual([
      'Freddo intenso',
      'Fame estrema',
      'Ferite gravi',
    ]);
    const details = targetPresentation(state, {
      type: 'unit',
      id: person.id,
      x: person.x,
      y: person.y,
    })!;
    expect(details.stage).toBe('Uomo · Adulto');
    expect(details.description).toContain('Freddo intenso');
    expect(details.description).toContain('Fame estrema');
    expect(details.label).not.toContain(person.name);
    expect(details.stage).not.toMatch(/\d/);
  });

  it('explains a selected child instead of leaving the map without person details', () => {
    const state = createGame(6842);
    const child = state.units.find((unit) => unit.name === 'Ilo')!;
    const details = targetPresentation(state, {
      type: 'unit',
      id: child.id,
      x: child.x,
      y: child.y,
    })!;
    expect(details.stage).toContain('Bambino');
    expect(details.description).toContain('Può imparare al Falò');
    expect(details.hint).toContain('richiedono un adulto');
    expect(`${details.label} ${details.stage} ${details.description}`).not.toContain('Ilo');
  });

  it('shows the loss when a death event focuses a person instead of presenting an ordinary injury', () => {
    const state = createGame(6842);
    const person = state.units.find((unit) => unit.name === 'Uma')!;
    person.hp = 0;
    person.temp = 0;
    person.hunger = 100;
    const details = targetPresentation(state, {
      type: 'unit',
      id: person.id,
      x: person.x,
      y: person.y,
    })!;
    expect(details.stage).toContain('Deceduta');
    expect(details.description).toContain('vita si è spenta');
    expect(physicalWarnings(person)).toEqual([]);
    expect(details.description).not.toContain('Ferite gravi');
  });

  it('retains custodian warnings without leaking names, exact ages or the undiscovered death word', () => {
    const state = createGame(6842);
    const person = state.units.find((unit) => unit.name === 'Uma')!;
    state.words.V_06 = { retention: 50, custodians: [person.id], uses: 0 };
    const details = targetPresentation(state, {
      type: 'unit',
      id: person.id,
      x: person.x,
      y: person.y,
    })!;
    expect(details.stage).toContain('Donna · Anziana');
    expect(details.stage).toContain('Ultimo custode');
    expect(details.description).toContain('Custodisce da solo: Scheggiare');
    expect(`${details.label} ${details.stage} ${details.description} ${details.hint}`).not.toMatch(
      /Uma|muore|morte|\d|%/i,
    );
    state.words.O_08 = { retention: 50, custodians: [person.id], uses: 0 };
    expect(
      targetPresentation(state, { type: 'unit', id: person.id, x: person.x, y: person.y })!.stage,
    ).toContain('14 stagioni');
  });
});
