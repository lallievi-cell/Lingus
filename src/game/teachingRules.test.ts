import { describe, expect, it } from 'vitest';
import { createGame, teachWord } from './engine';
import { ELDER_AGE } from './content';

function lesson() {
  const s = createGame();
  s.started = true;
  s.attention = 30;
  s.buildings.push({ id: 'fire', kind: 'campfire', ...s.home, hp: 100, active: true });
  s.words.O_05 = {
    retention: 50,
    custodians: [s.units.find((u) => u.name === 'Uma')!.id],
    uses: 0,
  };
  return s;
}
describe('resolving the age of an oral learner', () => {
  it('prioritizes a child before an eligible young adult', () => {
    const s = lesson(),
      taught = teachWord(s, 'O_05');
    expect(taught.words.O_05.custodians).toContain(s.units.find((u) => u.name === 'Ilo')!.id);
    expect(taught.attention).toBe(20);
    expect(taught.words.O_05.retention).toBe(60);
  });
  it('can create another custodian among young adults after the child knows the word', () => {
    const s = lesson();
    const first = teachWord(s, 'O_05'),
      second = teachWord(first, 'O_05');
    expect(second.words.O_05.custodians).toHaveLength(3);
    const learned = second.units.find((u) => u.id === second.words.O_05.custodians[2])!;
    expect(learned.age).toBeLessThan(ELDER_AGE);
    expect(learned.age).toBeGreaterThanOrEqual(4);
    expect(learned.knows).toContain('O_05');
    expect(second.attention).toBe(10);
    expect(second.words.O_05.retention).toBe(70);
  });
  it('never charges an impossible lesson or gives custodianship to a slave', () => {
    const s = lesson();
    for (const u of s.units) {
      u.age = ELDER_AGE;
    }
    const ilo = s.units.find((u) => u.name === 'Ilo')!;
    ilo.age = 2;
    ilo.caste = 'slave';
    const rejected = teachWord(s, 'O_05');
    expect(rejected.attention).toBe(30);
    expect(rejected.words.O_05.custodians).toEqual(s.words.O_05.custodians);
  });
});
