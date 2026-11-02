import { describe, expect, it } from 'vitest';
import { createGame, parseGame, serializeGame } from './engine';
import { pairFertileUnits } from './demography';
import { ADULT_AGE, ELDER_AGE } from './content';

const originalAges = [8, 10, 6, 7, 6, 14, 2];
describe('new Guided founders have time to establish a generation without changing life rules', () => {
  it('starts the five adult founders two seasons younger, retaining Uma and Ilo', () => {
    const s = createGame(6842, 'guided');
    expect(s.units.map((u) => u.age)).toEqual([6, 8, 4, 5, 4, 12, 2]);
    expect(s.units.slice(0, 5).every((u) => u.age >= ADULT_AGE)).toBe(true);
    expect(s.units.map((u) => u.sex)).toEqual(['M', 'F', 'F', 'M', 'F', 'F', 'M']);
  });
  it('keeps the document profiles and every other initial trait in Classic', () => {
    const classic = createGame(6842, 'classic'),
      guided = createGame(6842, 'guided');
    expect(classic.units.map((u) => u.age)).toEqual(originalAges);
    expect(guided.units.map((u) => ({ ...u, age: 0 }))).toEqual(
      classic.units.map((u) => ({ ...u, age: 0 })),
    );
  });
  it.each(['guided', 'classic'] as const)(
    'never reapplies age calibration when loading a %s story',
    (mode) => {
      const s = createGame(6842, mode);
      const persisted = [11, 13, 9, 10, 9, 17, 5];
      s.units.forEach((u, index) => {
        u.age = persisted[index];
      });
      const loaded = parseGame(serializeGame(s))!;
      expect(loaded).not.toBeNull();
      expect(loaded.units.map((u) => u.age)).toEqual(persisted);
      expect(parseGame(serializeGame(loaded))!.units.map((u) => u.age)).toEqual(persisted);
    },
  );
  it('preserves the original adult ages in a legacy Guided save', () => {
    const s = createGame(6842, 'guided');
    delete s.openingBalanceVersion;
    delete s.openingCouncilsCompleted;
    const ages = [...originalAges];
    ages[5] = 12; // Existing Guided Uma calibration, before A-59.
    s.units.forEach((u, i) => {
      u.age = ages[i];
    });
    expect(parseGame(serializeGame(s))!.units.map((u) => u.age)).toEqual(ages);
  });
  it('increases the surviving founders’ pair opportunities, without changing the fertile window', () => {
    const pairSeasons = (mode: 'classic' | 'guided') => {
      const s = createGame(6842, mode);
      return Array.from(
        { length: 6 },
        (_, i) =>
          pairFertileUnits(
            s.units.filter((u) => u.age + 5 + i >= ADULT_AGE && u.age + 5 + i < ELDER_AGE),
          ).length,
      ).reduce((sum, n) => sum + n, 0);
    };
    expect(pairSeasons('classic')).toBe(5);
    expect(pairSeasons('guided')).toBe(10);
    expect(ADULT_AGE).toBe(4);
    expect(ELDER_AGE).toBe(14);
  });
});
