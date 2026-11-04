import { describe, expect, it } from 'vitest';
import { RESOURCE_ORDER } from '../game/content';
import {
  describeAbility,
  describeAttention,
  describeCohesion,
  describeHealth,
  describeHunger,
  describePeople,
  describeResourceAmount,
  formatVisibleNumber,
} from './semanticReadability';

describe('semantic Italian conditions and quantities', () => {
  it('describes a condition rather than appending a generic amount to health or hunger', () => {
    expect(describeHealth(100, false)).toBe('In buona salute');
    expect(describeHealth(60, false)).toBe('Salute fragile');
    expect(describeHealth(30, false)).toBe('Salute critica');
    expect(describeHealth(0, false)).toBe('Vita conclusa');
    expect(describeHunger(0, false)).toBe('Sazio');
    expect(describeHunger(19.9, false)).toBe('Sazio');
    expect(describeHunger(20, false)).toBe('Ha fame');
    expect(describeHunger(60, false)).toBe('Ha fame');
    expect(describeHunger(74.9, false)).toBe('Ha fame');
    expect(describeHunger(75, false)).toBe('Affamato');
    expect(describeHunger(94.9, false)).toBe('Affamato');
    expect(describeHunger(95, false)).toBe('Fame estrema');
  });

  it('uses the attribute scale and an attention label that agree with their actual nouns', () => {
    expect(`Forza ${describeAbility(3, false)}`).toBe('Forza modesta');
    expect(`Intelligenza ${describeAbility(6, false)}`).toBe('Intelligenza nella media');
    expect(`Forza ${describeAbility(9, false)}`).toBe('Forza elevata');
    expect(describeAttention(10, false)).toBe('Poca');
    expect(describeAttention(0, false)).toBe('Nessuna');
    expect(describeAttention(30, false)).toBe('Disponibile');
    expect(describeAttention(100, false, 150)).toBe('Disponibile');
    expect(describeAttention(150, false, 150)).toBe('Al massimo');
    expect(describeCohesion(24, false)).toBe('In crisi');
    expect(describeCohesion(80, false)).toBe('Salda');
  });

  it('agrees with singular, plural and gender for people and materials', () => {
    expect(describePeople(0, false, 'slaves')).toBe('Nessuno schiavo');
    expect(describePeople(3, false, 'people')).toBe('Poche persone');
    expect(describePeople(3, false, 'warriors')).toBe('Pochi guerrieri');
    expect(describePeople(1, true, 'sages')).toBe('1 saggio');
    expect(describeHunger(0, false, 'F')).toBe('Sazia');
    expect(describeHunger(80, false, 'F')).toBe('Affamata');
    expect(describeResourceAmount('stone', 3, false)).toBe('Poca pietra');
    expect(describeResourceAmount('pelt', 3, false)).toBe('Poche pelli');
    expect(describeResourceAmount('seed', 7, false)).toBe('Alcuni semi');
    expect(describeResourceAmount('pelt', 1, true)).toBe('1 pelle');
    expect(describeResourceAmount('wood', 20, false)).toBe('Molto legno');
    expect(describeResourceAmount('meat', 100, false)).toBe('Carne in abbondanza');
  });

  it('keeps quantities qualitative before Numero and uses Italian numbers after it', () => {
    for (const value of [0, 0.01, 1, 4.9, 5, 19.9, 20, 99.9, 100, 251]) {
      for (const resource of RESOURCE_ORDER)
        expect(describeResourceAmount(resource, value, false)).not.toMatch(/\d/);
      expect(describeAttention(value, false)).not.toMatch(/\d/);
      expect(describeHunger(value, false)).not.toMatch(/\d/);
      expect(describePeople(value, false)).not.toMatch(/\d/);
    }
    expect(describeAttention(12.5, true)).toBe('12,5');
    expect(describeHealth(67.5, true)).toBe('Salute 67,5');
    expect(describeHunger(87.5, true)).toBe('Affamato · Fame 87,5/100');
    expect(describeResourceAmount('wood', 0.01, true)).toBe('<0,1 legno');
    expect(formatVisibleNumber(1200.5)).toBe('1.200,5');
  });

  it('does not turn an unavailable reading into a normal or fatal condition', () => {
    expect(describeHealth(NaN, false)).toBe('Salute non disponibile');
    expect(describeHunger(Infinity, false)).toBe('Fame non disponibile');
    expect(describeAttention(NaN, true)).toBe('Non disponibile');
    expect(formatVisibleNumber(NaN)).toBe('—');
  });
});
