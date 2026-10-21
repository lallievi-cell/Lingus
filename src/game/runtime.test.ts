import { describe, expect, it } from 'vitest';
import { BUILDING_SPECS } from './content';
import { createGame } from './engine';
import { freeCapacity, hasBuilding } from './runtime';

describe('ownership of physical buildings', () => {
  it('does not borrow capacity or institutions from foreign cities', () => {
    const s = createGame(),
      foreign = s.cities[0];
    for (const kind of ['storage', 'depot', 'archive', 'palace', 'school'] as const) {
      s.buildings.push({
        id: kind,
        kind,
        x: foreign.x,
        y: foreign.y,
        cityId: foreign.id,
        hp: BUILDING_SPECS[kind].maxHp,
        active: true,
      });
      expect(hasBuilding(s, kind)).toBe(false);
    }
    s.resources.wood = 30;
    expect(freeCapacity(s, 'wood')).toBe(0);
    expect(freeCapacity(s, 'food')).toBe(0);
    foreign.factionId = 'player';
    expect(hasBuilding(s, 'archive')).toBe(true);
    // Annexing a distant store does not move its capacity to the shared home pile.
    expect(freeCapacity(s, 'wood')).toBe(0);
  });
  it('counts the capacity of a real local depot', () => {
    const s = createGame();
    s.buildings.push({ id: 'depot', kind: 'depot', ...s.home, hp: 150, active: true });
    s.resources.wood = 30;
    expect(freeCapacity(s, 'wood')).toBe(470);
    expect(freeCapacity(s, 'food')).toBe(30);
  });
});
