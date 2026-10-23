import { ADULT_AGE } from '../game/content';
import { getLifeStage, resolveUnitSex } from '../game/demography';
import { hasWord } from '../game/runtime';
import type { GameState, Unit } from '../game/types';

export function lifeStageLabel(unit: Unit): string {
  const female = resolveUnitSex(unit) === 'F';
  switch (getLifeStage(unit)) {
    case 'newborn':
      return female ? 'Neonata' : 'Neonato';
    case 'child':
      return female ? 'Bambina' : 'Bambino';
    case 'adult':
      return female ? 'Adulta' : 'Adulto';
    case 'elder':
      return female ? 'Anziana' : 'Anziano';
  }
}

export function sexLabel(unit: Unit): string {
  const grown = unit.age >= ADULT_AGE;
  return resolveUnitSex(unit) === 'F' ? (grown ? 'Donna' : 'Femmina') : grown ? 'Uomo' : 'Maschio';
}

export function visibleUnitName(state: GameState, unit: Unit): string {
  return hasWord(state, 'S_02')
    ? unit.name
    : resolveUnitSex(unit) === 'F'
      ? 'Una compagna'
      : 'Un compagno';
}

export function unitLifeHint(unit: Unit): string {
  if (unit.hp <= 0) return 'Questa vita si è spenta. La tribù ricorda ciò che custodiva.';
  const stage = getLifeStage(unit);
  if (stage === 'newborn' || stage === 'child')
    return 'Troppo giovane per lavorare. Può imparare al Falò.';
  if (stage === 'elder') return 'Età avanzata. Proteggi la sua memoria e tramanda ciò che sa.';
  return 'Età fertile: per una nascita servono cibo, riposo e spazio negli alloggi.';
}

export interface PhysicalWarning {
  kind: 'cold' | 'hunger' | 'health';
  label: string;
}

/** Observable danger is visible even before the tribe has names or arithmetic. */
export function physicalWarnings(unit: Unit): PhysicalWarning[] {
  const warnings: PhysicalWarning[] = [];
  if (unit.hp <= 0) return warnings;
  if (unit.temp <= 20) warnings.push({ kind: 'cold', label: 'Freddo intenso' });
  if (unit.hunger >= 95) warnings.push({ kind: 'hunger', label: 'Fame estrema' });
  else if (unit.hunger >= 75) warnings.push({ kind: 'hunger', label: 'Ha fame' });
  if (unit.hp <= 30) warnings.push({ kind: 'health', label: 'Ferite gravi' });
  return warnings;
}
