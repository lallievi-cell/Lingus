import { ELDER_AGE, WORDS } from './content';
import { activeUnits, hasWord } from './runtime';
import { getLessonPreview } from './teaching';
import type { GameState, Unit } from './types';

export type CustodianRisk = 'elder' | 'health' | 'hunger' | 'cold' | 'danger';
export interface CustodianStatus {
  unitId: string;
  wordIds: string[];
  risk: 'safe' | 'ageing' | 'critical';
  reasons: CustodianRisk[];
  displayName: string;
}

export const CUSTODIAN_RISK_LABELS: Record<CustodianRisk, string> = {
  elder: 'Età avanzata',
  health: 'Ferite gravi',
  hunger: 'Fame estrema',
  cold: 'Freddo intenso',
  danger: 'Esposto allo scontro',
};

function riskReasons(state: GameState, unit: Unit): CustodianRisk[] {
  const reasons: CustodianRisk[] = [];
  if (unit.age >= ELDER_AGE) reasons.push('elder');
  if (unit.hp <= 30) reasons.push('health');
  if (unit.hunger >= 95) reasons.push('hunger');
  if (unit.temp <= 20) reasons.push('cold');
  const quarry = state.entities.find((entity) => entity.id === unit.targetId);
  if (
    unit.action === 'combat' ||
    (unit.action === 'hunting' &&
      quarry &&
      quarry.hp > 0 &&
      ['wolf', 'alpha', 'mammoth'].includes(quarry.kind))
  )
    reasons.push('danger');
  return reasons;
}

/** A view of living oral custody. Written support does not prevent custodianLoss on death. */
export function getCustodianStatuses(state: GameState): CustodianStatus[] {
  const people = new Map(activeUnits(state).map((unit) => [unit.id, unit]));
  const byPerson = new Map<string, CustodianStatus>();
  for (const [wordId, memory] of Object.entries(state.words)) {
    if (!WORDS[wordId] || WORDS[wordId].tier === 0 || memory.retention <= 0) continue;
    const custodians = [...new Set(memory.custodians)].filter((id) => people.has(id));
    if (custodians.length !== 1) continue;
    const unit = people.get(custodians[0])!;
    const existing = byPerson.get(unit.id);
    if (existing) {
      existing.wordIds.push(wordId);
      continue;
    }
    const reasons = riskReasons(state, unit);
    byPerson.set(unit.id, {
      unitId: unit.id,
      wordIds: [wordId],
      risk: reasons.some((reason) => reason !== 'elder')
        ? 'critical'
        : reasons.length
          ? 'ageing'
          : 'safe',
      reasons,
      displayName: hasWord(state, 'S_02') ? unit.name : 'Un compagno',
    });
  }
  const priority = { critical: 0, ageing: 1, safe: 2 };
  return [...byPerson.values()].sort((a, b) => priority[a.risk] - priority[b.risk]);
}

/** The existing lesson may create another custodian even when retention is already full. */
export function canTransmitWord(state: GameState, wordId: string): boolean {
  return getLessonPreview(state, wordId).allowed;
}
