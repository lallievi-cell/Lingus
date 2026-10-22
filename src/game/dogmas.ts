import { BUILDING_SPECS, RESOURCE_SPECS, WORDS } from './content';
import { dogmaWeight } from './math';
import {
  DOGMA_TARGETS,
  DOGMA_VECTOR_TOKENS,
  DOGMA_OPPOSITES,
  dogmaFamily,
  getDogmaPolicy,
  getDogmaConflict,
} from './dogmaPolicy';
export {
  DOGMA_POLICY_MATRIX,
  getDogmaPolicy,
  getDogmaConflict,
  dogmaDiplomaticPenalty,
} from './dogmaPolicy';
import {
  activeUnits,
  clamp,
  copy,
  distance,
  hasBuilding,
  hasWord,
  isPlayerBuilding,
  log,
  nextId,
  totalFood,
} from './runtime';
import type { Dogma, DogmaVector, GameState, MapEntity, Resource, Target, Unit } from './types';

export const SACRED_TARGETS: string[] = [...DOGMA_TARGETS];
export const VECTOR_TOKENS = DOGMA_VECTOR_TOKENS;
export function getDogmaVectors(target: string) {
  return VECTOR_TOKENS.filter((vector) => getDogmaPolicy(target, vector)?.allowed);
}
export function vectorFamily(vector: string): DogmaVector {
  return dogmaFamily(vector) ?? 'martyr';
}
const resourceFor = (token: string): Resource | undefined =>
  token === 'O_02'
    ? 'stone'
    : token === 'O_03'
      ? 'wood'
      : token === 'O_04'
        ? 'meat'
        : token === 'O_05'
          ? 'wood'
          : token === 'O_07'
            ? 'ingot'
            : token === 'O_12'
              ? 'coin'
              : undefined;
const resourceToken = (r: Resource) =>
  r === 'wood'
    ? 'O_03'
    : ['stone', 'tool', 'spear', 'pottery'].includes(r)
      ? 'O_02'
      : ['ore', 'ingot', 'metalArms'].includes(r)
        ? 'O_07'
        : r === 'coin'
          ? 'O_12'
          : 'O_04';
export interface DogmaContext {
  unit?: Unit;
  tokens?: string[];
  target?: Target;
  targetId?: string;
  subjectId?: string;
  resource?: Resource;
  againstForeign?: boolean;
  inBorders?: boolean;
  isNight?: boolean;
}
function inferredTarget(s: GameState, ctx: DogmaContext): string | undefined {
  if (ctx.resource) return resourceToken(ctx.resource);
  const id = ctx.target?.id ?? ctx.unit?.targetId,
    e = s.entities.find((e) => e.id === id);
  if (e)
    return e.kind === 'tree'
      ? 'O_03'
      : e.kind === 'stone'
        ? 'O_02'
        : e.kind === 'ore'
          ? 'O_07'
          : e.kind === 'corpse'
            ? 'O_06'
            : e.resource
              ? resourceToken(e.resource)
              : ['berries', 'deer', 'wolf', 'alpha', 'mammoth'].includes(e.kind)
                ? 'O_04'
                : undefined;
  return undefined;
}
function touchesDogma(s: GameState, a: string, ctx: DogmaContext): boolean {
  const tokens = ctx.tokens ?? ctx.unit?.command ?? [];
  return (
    ctx.targetId === a ||
    ctx.subjectId === a ||
    tokens.includes(a) ||
    inferredTarget(s, ctx) === a ||
    (a === 'O_05' && (tokens.includes('V_07') || tokens.includes('V_12'))) ||
    (!!ctx.unit && a.startsWith('S_') && matchesCaste(s, ctx.unit, a))
  );
}
export interface DogmaEffects {
  protected: boolean;
  morale: number;
  production: number;
  agriculture: number;
  herding: number;
  combat: number;
  movement: number;
  cognitive: number;
  decay: number;
  gamma: number;
  trade: number;
  growth: number;
  birthAdd: number;
  slaveRevolt: number;
  inequality: number;
  corruption: number;
  attentionCap: number;
  elderAttention: number;
  upkeep: number;
  defense: number;
  teaching: number;
  elderFoodPrivilege: boolean;
  warriorRebellionThreshold: number;
  conquestCohesion: number;
  obsidianDamage: number;
  nightTaboo: boolean;
  nightWatch: boolean;
  vegetarian: boolean;
  pacifism: boolean;
  isolated: boolean;
  collectiveFood: boolean;
  cremation: boolean;
  cannibalism: boolean;
  celibateSages: boolean;
  emancipationForbidden: boolean;
  slaveryForbidden: boolean;
  kingDeathCollapse: boolean;
  borderLocked: boolean;
  machinesForbidden: boolean;
  writingForbidden: boolean;
  moneyForbidden: boolean;
  monarchSelection: null | 'strength' | 'intelligence';
}
function applyOppositeBonus(s: GameState, target: string, ctx: DogmaContext, f: DogmaEffects) {
  // Explicit historical archetypes override the generic compensation rather than stacking it.
  if (['O_04', 'S_05', 'O_07', 'O_09', 'O_12', 'O_13', 'V_03', 'V_09'].includes(target)) return;
  const tokens = ctx.tokens ?? ctx.unit?.command ?? [],
    subject = ctx.subjectId ?? tokens.find((t) => t.startsWith('S_')),
    inferred = inferredTarget(s, ctx),
    day = !(ctx.isNight ?? s.time % 90 >= 60);
  if (target === 'O_06') {
    f.growth *= 1.25;
    return;
  }
  if (target === 'V_11') {
    f.agriculture *= 1.25;
    return;
  }
  if (target === 'V_13') {
    f.defense *= 1.25;
    return;
  }
  if (target === 'S_08') {
    f.trade *= 1.25;
    return;
  }
  if (target === 'C_01') {
    if (day) f.production *= 1.25;
    return;
  }
  if (target === 'S_06') {
    if ((ctx.unit && ctx.unit.caste !== 'slave') || tokens.includes('M_05')) f.production *= 1.25;
    return;
  }
  if (target === 'S_07') {
    if (s.government === 'republic' && ctx.unit && !ctx.unit.isKing) f.production *= 1.25;
    return;
  }
  if (target === 'O_14') {
    if (tokens.length && !tokens.includes('O_14') && !tokens.includes('C_03')) f.production *= 1.25;
    return;
  }
  if (target === 'O_01' || target === 'O_10') {
    const point = ctx.unit ?? ctx.target;
    if (tokens.includes('V_01') && point && distance(point, s.home) > 35) f.movement *= 1.25;
    return;
  }
  if (target === 'O_05') {
    if (tokens.includes('V_06') && !tokens.includes('O_05') && !tokens.includes('V_12'))
      f.production *= 1.25;
    return;
  }
  const opposite = DOGMA_OPPOSITES[target]?.tokens ?? [];
  if (target.startsWith('S_')) {
    if (opposite.includes(subject ?? '')) f.production *= 1.25;
  } else if (opposite.some((t) => tokens.includes(t) || inferred === t)) f.production *= 1.25;
}

/** Presence of an abstract target is a real institution or an action in the last season. */
export function dogmaTargetPresent(s: GameState, target: string): boolean {
  const r = resourceFor(target),
    ownBuildings = s.buildings.filter((b) => isPlayerBuilding(s, b) && b.hp > 0);
  if (target === 'O_04') return totalFood(s.resources) > 0;
  if (target === 'O_07') return s.resources.ore + s.resources.ingot + s.resources.metalArms > 0;
  if (target === 'O_05') return ownBuildings.some((b) => b.kind === 'campfire' && b.active);
  if (r) return s.resources[r] > 0;
  if (target === 'S_07') return !!s.kingId && activeUnits(s).some((u) => u.id === s.kingId);
  if (target === 'S_08') return s.battalions.some((b) => b.factionId === 'player' && b.hp > 0);
  if (target === 'S_05') {
    const radius = hasBuilding(s, 'palace') ? 100 : 35;
    const places = [s.home, ...s.cities.filter((c) => c.factionId === 'player')];
    const present = (visitor: { x: number; y: number; hp: number; factionId?: string }) =>
      visitor.hp > 0 &&
      visitor.factionId !== undefined &&
      visitor.factionId !== 'player' &&
      places.some((place) => distance(place, visitor) <= radius);
    return (
      s.units.some(present) ||
      s.caravans.some((c) => !c.arrived && present(c)) ||
      s.battalions.some(present)
    );
  }
  if (target.startsWith('S_')) {
    const cities = s.cities.filter((c) => c.factionId === 'player');
    if (
      s.urbanized &&
      cities.some((c) =>
        target === 'S_03'
          ? c.cohorts.warriors > 0
          : target === 'S_04'
            ? c.cohorts.sages > 0
            : target === 'S_06'
              ? c.cohorts.slaves > 0
              : ['S_01', 'S_02'].includes(target) && Object.values(c.cohorts).some((n) => n > 0),
      )
    )
      return true;
    return activeUnits(s).some((u) => matchesCaste(s, u, target));
  }
  if (target === 'O_01')
    return (
      activeUnits(s).some((u) => distance(u, s.home) <= 35) ||
      s.cities.some((c) => c.factionId === 'player')
    );
  if (target === 'O_06')
    return s.entities.some((e) => e.kind === 'corpse' && e.amount > 0 && distance(e, s.home) <= 35);
  if (target === 'O_09')
    return ownBuildings.some((b) => b.kind === 'stele' || b.kind === 'archive');
  if (target === 'O_10') return hasWord(s, 'O_10') && dogmaTargetPresent(s, 'O_01');
  if (target === 'O_13')
    return (
      ownBuildings.some((b) => b.kind === 'workshop') ||
      s.battalions.some((b) => b.factionId === 'player' && b.hp > 0 && b.catapult)
    );
  if (target === 'O_14') return s.laws.length > 0 || ownBuildings.some((b) => b.kind === 'court');
  if (target === 'M_05')
    return (
      activeUnits(s).some((u) => u.caste !== 'slave') ||
      s.cities.some((c) => c.factionId === 'player' && c.cohorts.workers > 0)
    );
  if (target === 'C_01') return s.time % 90 >= 60 || s.time >= 60;
  if (
    target === 'V_09' &&
    ownBuildings.some(
      (b) => b.kind === 'farm' && b.active && (b.lastEfficiency ?? (b.workerIds ?? []).length) > 0,
    )
  )
    return true;
  if (
    target === 'V_11' &&
    (s.caravans.some(
      (c) => c.kind === 'trade' && c.factionId === 'player' && !c.arrived && c.hp > 0,
    ) ||
      s.factions.some((f) => f.lastTradeAt !== undefined && s.time - f.lastTradeAt <= 90))
  )
    return true;
  if (
    target === 'V_13' &&
    s.battalions.some((b) => b.factionId === 'player' && b.hp > 0 && b.action === 'attacking')
  )
    return true;
  const last = s.eventTimes[`dogmaUse:${target}`];
  return last !== undefined && s.time - last <= 90;
}
export function getDogmaEffects(s: GameState, ctx: DogmaContext = {}): DogmaEffects {
  const f: DogmaEffects = {
    protected: false,
    morale: 1,
    production: 1,
    agriculture: 1,
    herding: 1,
    combat: 1,
    movement: 1,
    cognitive: 1,
    decay: 1,
    gamma: 3,
    trade: 1,
    growth: 1,
    birthAdd: 0,
    slaveRevolt: 1,
    inequality: 1,
    corruption: 1,
    attentionCap: 100,
    elderAttention: 1,
    upkeep: 1,
    defense: 1,
    teaching: 1,
    elderFoodPrivilege: false,
    warriorRebellionThreshold: 100,
    conquestCohesion: 0,
    obsidianDamage: 0,
    nightTaboo: false,
    nightWatch: false,
    vegetarian: false,
    pacifism: false,
    isolated: false,
    collectiveFood: false,
    cremation: false,
    cannibalism: false,
    celibateSages: false,
    emancipationForbidden: false,
    slaveryForbidden: false,
    kingDeathCollapse: false,
    borderLocked: false,
    machinesForbidden: false,
    writingForbidden: false,
    moneyForbidden: false,
    monarchSelection: null,
  };
  const night = ctx.isNight ?? s.time % 90 >= 60;
  for (const d of s.dogmas) {
    const a = d.targetId,
      b = d.vectorId,
      touches = touchesDogma(s, a, ctx);
    if (
      vectorFamily(b) === 'sanctuary' &&
      a.startsWith('S_') &&
      touches &&
      ctx.unit &&
      distance(ctx.unit, s.home) <= (hasBuilding(s, 'palace') ? 100 : 35)
    )
      f.protected = true;
    if (b === 'C_02' && touches && !['C_01', 'M_05', 'O_12'].includes(a)) f.production *= 1.3;
    if (b === 'M_01') applyOppositeBonus(s, a, ctx, f);
    if (b === 'M_04' && touches) f.production *= 1.35;
    if (
      b.startsWith('S_') &&
      b !== 'S_01' &&
      touches &&
      (ctx.subjectId === b || (ctx.unit && matchesCaste(s, ctx.unit, b)))
    )
      f.production *= 1.3;
    if (a === 'C_01' && b === 'M_01') f.nightTaboo = true;
    if (a === 'O_04' && b === 'M_01') {
      f.vegetarian = true;
      f.agriculture *= 1.4;
    }
    if (a === 'O_06' && b === 'V_02') {
      f.cannibalism = true;
      if (ctx.againstForeign) f.combat *= 1.25;
    }
    if (a === 'O_06' && b === 'O_05') f.cremation = true;
    if (a === 'O_05' && b === 'S_04' && touches && (!ctx.unit || ctx.unit.intelligence >= 7))
      f.morale *= 1.3;
    if (a === 'S_05' && b === 'M_01') {
      f.isolated = true;
      if (ctx.inBorders) f.combat *= 1.2;
    }
    if (a === 'S_05' && b === 'O_01') {
      f.trade *= 2;
    }
    if (a === 'S_07' && b === 'C_02') f.kingDeathCollapse = true;
    if (a === 'V_03' && b === 'O_06') f.combat *= 1.35;
    if (a === 'C_01' && b === 'C_02') {
      f.nightWatch = true;
      if (night) f.movement *= 1.3;
      else f.agriculture *= 0.75;
    }
    if (a === 'S_04' && b === 'V_05') {
      f.celibateSages = true;
      f.elderAttention *= 2;
    }
    if (a === 'S_04' && b === 'M_04') {
      f.elderFoodPrivilege = true;
      f.teaching = 1.25;
      if (s.tier >= 4) {
        f.gamma = 0.5;
        f.warriorRebellionThreshold = 70;
      }
    }
    if (a === 'O_13' && b === 'M_01') {
      f.machinesForbidden = true;
      if (!(ctx.tokens ?? ctx.unit?.command ?? []).includes('O_13')) f.production *= 1.25;
    }
    if (['O_02', 'O_03'].includes(a) && b === 'V_05') f.machinesForbidden = true;
    if (a === 'V_09' && b === 'M_01') {
      f.agriculture = 0;
      f.herding *= 1.5;
      f.movement *= 1.4;
    }
    if (a === 'O_09' && b === 'M_01') {
      f.writingForbidden = true;
      f.attentionCap = 250;
    }
    if (a === 'O_12' && b === 'M_01') {
      f.moneyForbidden = true;
      f.corruption = 0;
      f.inequality *= 0.3;
    }
    if (a === 'O_12' && b === 'C_02') f.trade *= 1.4;
    if (a === 'O_07' && b === 'M_01') f.obsidianDamage = 35;
    if (a === 'O_04' && b === 'S_01') f.collectiveFood = true;
    if (a === 'V_13' && b === 'S_05') {
      if (ctx.againstForeign) f.combat *= 1.25;
      f.conquestCohesion += 20;
    }
    if (a === 'V_03' && b === 'M_01') {
      f.pacifism = true;
      f.growth *= 1.4;
    }
    if (a === 'O_10' && b === 'V_05') {
      f.borderLocked = true;
      f.defense *= 2;
      f.upkeep *= 0.7;
    }
    if (a === 'S_06' && b === 'C_02') {
      f.emancipationForbidden = true;
      f.slaveRevolt *= 0.5;
    }
    if (a === 'M_05' && b === 'C_02') {
      f.slaveryForbidden = true;
      f.birthAdd += 0.2;
      if (!ctx.unit || ctx.unit.caste !== 'slave') f.production *= 1.25;
    }
    if (a === 'S_03' && b === 'S_07') {
      f.monarchSelection = 'strength';
      f.combat *= 1.3;
    }
    if (a === 'S_04' && b === 'S_07') {
      f.monarchSelection = 'intelligence';
      f.cognitive *= 1.4;
      f.decay *= 0.5;
      f.combat *= 0.85;
    }
  }
  if ((s.eventTimes.sacrificeMorale ?? 0) > s.time) f.morale *= 1.2;
  return f;
}
function matchesCaste(s: GameState, u: Unit, subject: string) {
  return (
    subject === 'S_01' ||
    subject === 'S_02' ||
    (subject === 'S_03' && u.strength >= 7) ||
    (subject === 'S_04' && u.intelligence >= 7) ||
    (subject === 'S_05' && u.factionId !== undefined && u.factionId !== 'player') ||
    (subject === 'S_06' && u.caste === 'slave') ||
    (subject === 'S_07' && u.id === s.kingId) ||
    (subject === 'S_08' && u.caste === 'warrior') ||
    (subject === 'S_09' && !!u.cityId)
  );
}
export function previewDogma(target: string, vector: string): Pick<Dogma, 'name' | 'description'> {
  const a = WORDS[target]?.label ?? 'Concetto',
    family = vectorFamily(vector);
  const policy = getDogmaPolicy(target, vector);
  if (!policy?.allowed)
    return {
      name: 'Combinazione non applicabile',
      description: policy?.reason ?? 'Vettore dogmatico sconosciuto.',
    };
  const specials: Record<string, [string, string]> = {
    'C_01|M_01': [
      'Tabù delle Tenebre',
      'Di notte tutti tornano alla tana; sono vietati ordini, lavori e assedi notturni.',
    ],
    'O_04|M_01': [
      'Vegetarianesimo Sacro',
      'Vietate caccia, carne, pelli e cavalleria; restano bacche e agricoltura, con raccolti +40%.',
    ],
    'V_03|M_01': [
      'Pacifismo Assoluto',
      'Vietato attaccare per primi gli esseri umani; difesa consentita. Nascite +40%.',
    ],
    'O_09|M_01': [
      'Tradizione Orale Sacra',
      'Vietati stele e archivi. L’Attenzione orale può arrivare a 250.',
    ],
    'O_12|M_01': [
      'Maledizione dell’Oro',
      'Valuta e mercato monetario vietati; corruzione nulla e disuguaglianza ridotta del 70%.',
    ],
    'O_07|M_01': [
      'Metallurgia Impura',
      'Metallurgia vietata. Gli utensili di ossidiana infliggono 35 danni nell’Età dei Metalli.',
    ],
    'O_06|V_02': [
      'Comunione dei Morti',
      'I cadaveri sfamano senza perdita di coesione; +25% forza contro stranieri, relazioni −80.',
    ],
    'O_06|O_05': [
      'Cremazione Obbligatoria',
      'Ogni corpo richiede cinque legna, evita epidemie e genera cinque Attenzione. Sepoltura vietata.',
    ],
    'O_05|S_04': [
      'Monopolio del Fuoco',
      'Solo i saggi possono custodire il fuoco, cuocere e fondere; le loro azioni hanno efficienza +30%.',
    ],
    'S_05|M_01': [
      'Xenofobia Rituale',
      'Commercio estero e osmosi culturale vietati; +20% forza entro i confini.',
    ],
    'S_05|O_01': [
      'Ospitalità Sacra',
      'Vietato aggredire stranieri pacifici; rendita commerciale doppia e rivolta delle annessioni dimezzata.',
    ],
    'S_07|C_02': [
      'Teocrazia del Re-Dio',
      'Il sovrano non può essere deposto. La sua morte causa il collasso; l’istituzione aggiunge trenta coesione.',
    ],
    'V_09|M_01': ['Terra Madre', 'Agricoltura vietata; allevamento +50% e movimento +40%.'],
    'O_13|M_01': ['Tabù delle Macchine', 'Vietate officine e catapulte; lavoro manuale +25%.'],
    'C_01|C_02': [
      'Veglia Notturna',
      'Riposo di giorno, attività notturna con movimento +30%; agricoltura diurna −25%.',
    ],
    'S_04|V_05': [
      'Celibato dei Saggi',
      'I saggi non si riproducono; il loro contributo all’Attenzione raddoppia.',
    ],
    'S_04|M_04': [
      'Gerontocrazia / Oligarchia Sacerdotale',
      'Gli anziani mangiano per primi e non perdono salute per fame. Insegnamento +25%; dal Bronzo, oblio γ=0,5 e soglia di ribellione dei Forti ridotta del 30%.',
    ],
    'S_06|C_02': ['Schiavitù Naturale', 'Tensione servile dimezzata; emancipazione vietata.'],
    'M_05|C_02': [
      'Fratellanza Universale',
      'Schiavitù vietata, bonus nascite +0,20 e produttività dei cittadini +25%.',
    ],
  };
  const special = specials[`${target}|${vector}`];
  if (special) return { name: special[0], description: special[1] };
  const descriptions: Record<DogmaVector, string> = {
    prohibition: `L’interazione con ${a} è vietata. La rinuncia favorisce ${DOGMA_OPPOSITES[target]?.description ?? 'l’attività opposta'}.`,
    veneration: `${a} riceve +30% efficienza. La sua assenza costa cinque coesione al minuto.`,
    monopoly: `Solo «${WORDS[vector]?.label}» può usare ${a}: efficienza +30% e +0,5 coesione per uso.`,
    sacrifice: target.startsWith('S_')
      ? 'Una persona della casta viene immolata ogni stagione: +25 coesione e +30 Attenzione, relazioni −60.'
      : `Ogni stagione si offrono dieci unità di ${a}: +15 coesione e +20% morale.`,
    protection: `Non si può esaurire o uccidere ${a}. Le risorse restano almeno al 20% e si rigenerano al doppio.`,
    sanctuary: `${a} è protetto nel perimetro della tana; per gli stranieri il beneficio diplomatico raddoppia.`,
    property:
      vector === 'M_04'
        ? `${a} diventa privato: output +35%, disuguaglianza +1 al minuto.`
        : `${a} appartiene al gruppo: niente furti, vietata la vendita in moneta.`,
    martyr: `Le morti legate a ${a} danno dieci coesione e quindici Attenzione al posto del trauma.`,
  };
  return {
    name: `${{ prohibition: 'Tabù', veneration: 'Culto', monopoly: 'Custodia', sacrifice: 'Offerta', protection: 'Tutela', sanctuary: 'Santuario', property: vector === 'M_04' ? 'Proprietà' : 'Comunione', martyr: 'Martirio' }[family]} di ${a}`,
    description: descriptions[family],
  };
}
export function inscribeDogma(state: GameState, targetId: string, vectorId: string) {
  const s = copy(state);
  const policy = getDogmaPolicy(targetId, vectorId);
  if (!policy?.allowed) {
    log(s, policy?.reason ?? 'Vettore dogmatico sconosciuto.', 'warning');
    return s;
  }
  const conflict = getDogmaConflict(s.dogmas, targetId, vectorId);
  if (conflict) {
    log(s, conflict, 'warning');
    return s;
  }
  if (
    !hasWord(s, 'M_03') ||
    !hasBuilding(s, 'menhir') ||
    !hasWord(s, targetId) ||
    !hasWord(s, vectorId) ||
    !getDogmaVectors(targetId).includes(vectorId)
  ) {
    log(s, 'Servono il Sacro, una Pietra Sacra attiva e una coppia di concetti valida.', 'warning');
    return s;
  }
  if (s.dogmas.some((d) => d.targetId === targetId && d.vectorId === vectorId)) {
    log(s, 'Questo dogma è già inciso.', 'warning');
    return s;
  }
  if (s.dogmas.length >= (hasBuilding(s, 'temple') ? 6 : 3)) {
    log(s, 'La Pietra Sacra e il Tempio non possono custodire altri dogmi.', 'warning');
    return s;
  }
  const dogma: Dogma = {
    id: nextId(s, 'dogma'),
    targetId,
    vectorId,
    age: 0,
    weight: 10,
    vector: vectorFamily(vectorId),
    bornAt: s.time,
    ...previewDogma(targetId, vectorId),
  };
  s.dogmas.push(dogma);
  if (s.recentTrauma && s.time - s.recentTrauma.time <= 60) {
    s.cohesion = clamp(s.cohesion + 40);
    s.recentTrauma = undefined;
  }
  if (targetId === 'S_07' && vectorId === 'C_02') s.cohesion = clamp(s.cohesion + 30);
  if (targetId === 'O_12' && vectorId === 'M_01') s.inequality *= 0.3;
  if (targetId === 'O_06' && vectorId === 'V_02')
    for (const f of s.factions) f.relation = clamp(f.relation - 80, -100, 100);
  if (targetId === 'M_05' && vectorId === 'C_02') {
    for (const u of activeUnits(s)) if (u.caste === 'slave') u.caste = 'citizen';
    for (const c of s.cities.filter((c) => c.factionId === 'player')) {
      c.cohorts.workers += c.cohorts.slaves;
      c.cohorts.slaves = 0;
    }
    s.emancipated = true;
  }
  log(s, `«${dogma.name}» è inciso: ${dogma.description}`, 'good');
  return s;
}
export function removeDogma(state: GameState, id: string) {
  const s = copy(state),
    d = s.dogmas.find((d) => d.id === id);
  if (!d) return s;
  s.cohesion = clamp(s.cohesion - d.weight);
  s.dogmas = s.dogmas.filter((d) => d.id !== id);
  if (s.cohesion <= 0) {
    s.revoltTension = 100;
    s.eventTimes.schism = s.time;
    log(s, 'La riforma spezza la comunità: la fazione conservatrice insorge.', 'danger');
  } else log(s, `Il dogma è abolito. Coesione −${d.weight.toFixed(1)}.`, 'warning');
  return s;
}
export function forbiddenByDogma(
  s: GameState,
  tokens: string[],
  target?: Target,
  unit?: Unit,
): string | null {
  const entity = target?.type === 'entity' ? s.entities.find((e) => e.id === target.id) : undefined;
  const resource = entity
    ? entity.kind === 'tree'
      ? 'O_03'
      : entity.kind === 'stone'
        ? 'O_02'
        : entity.kind === 'ore'
          ? 'O_07'
          : ['deer', 'wolf', 'alpha', 'mammoth', 'berries'].includes(entity.kind)
            ? 'O_04'
            : entity.kind === 'corpse'
              ? 'O_06'
              : entity.resource
                ? resourceToken(entity.resource)
                : undefined
    : undefined;
  const foreign =
    target?.type === 'city'
      ? s.cities.find((c) => c.id === target.id)?.factionId !== 'player'
      : tokens.includes('S_05');
  const humanTarget = target?.type === 'unit' ? s.units.find((u) => u.id === target.id) : undefined;
  const humanInteraction = foreign || !!humanTarget;
  const hostile =
    target?.type === 'city'
      ? s.factions.find((f) => f.id === s.cities.find((c) => c.id === target.id)?.factionId)
          ?.hostile
      : humanTarget
        ? (humanTarget.lastEventAt?.CIVIL_AGGRESSOR_UNTIL ?? 0) > s.time ||
          (humanTarget.action === 'combat' && !!humanTarget.command?.includes('V_03')) ||
          !!s.factions.find((f) => f.id === humanTarget.factionId)?.hostile
        : entity?.attacked;
  for (const d of s.dogmas) {
    const a = d.targetId,
      b = d.vectorId,
      touches =
        tokens.includes(a) ||
        resource === a ||
        (a === 'O_05' && (tokens.includes('V_07') || tokens.includes('V_12')));
    if (a === 'C_01' && b === 'M_01' && s.time % 90 >= 60)
      return 'Il Tabù delle Tenebre impone il ritorno alla tana.';
    if (a === 'O_04' && b === 'M_01') {
      if (tokens.includes('V_03') && (resource === 'O_04' || tokens.includes('O_04')))
        return 'Gli animali sono sacri: la caccia è vietata.';
      if (
        tokens.includes('V_02') &&
        ((entity && entity.kind !== 'berries' && entity.resource !== 'food') ||
          (!entity && s.resources.food <= 0))
      )
        return 'Il Vegetarianesimo Sacro consente soltanto nutrimento vegetale.';
      continue;
    }
    if (a === 'V_03' && b === 'M_01') {
      if (tokens.includes('V_03') && humanInteraction && !hostile)
        return 'Il Pacifismo vieta di attaccare per primi altri esseri umani.';
      continue;
    }
    if (a === 'S_05' && b === 'M_01') {
      if (tokens.includes('V_11')) return 'La Xenofobia vieta il commercio con gli stranieri.';
      continue;
    }
    if (['O_02', 'O_03'].includes(a) && b === 'V_05' && tokens.includes('O_13'))
      return 'L’Animismo della Natura vieta le macchine estrattive.';
    if (a === 'S_05' && b === 'O_01' && tokens.includes('V_03') && foreign && !hostile)
      return 'L’Ospitalità vieta l’aggressione degli stranieri pacifici.';
    if (a === 'S_06' && b === 'C_02' && tokens.includes('M_05'))
      return 'La schiavitù sacra impedisce l’emancipazione.';
    if (a === 'M_05' && b === 'C_02' && tokens.includes('S_06'))
      return 'La Fratellanza vieta ogni forma di schiavitù.';
    if (
      a === 'O_10' &&
      b === 'V_05' &&
      target &&
      distance(target, s.home) > (hasBuilding(s, 'palace') ? 100 : 35)
    )
      return 'L’inviolabilità dei confini impedisce di uscire dal territorio.';
    if (a === 'O_06' && b === 'O_05' && tokens.includes('V_08') && tokens.includes('O_06'))
      return 'La Cremazione vieta la sepoltura in terra.';
    if (b === 'M_01' && touches) return `Il dogma «${d.name}» vieta questa interazione.`;
    if (vectorFamily(b) === 'monopoly' && touches) {
      if (unit ? !matchesCaste(s, unit, b) : !tokens.includes(b))
        return `«${d.name}» riserva il gesto a ${WORDS[b]?.label}.`;
    }
    if (b === 'S_01' && tokens.includes('V_11') && tokens.includes('O_12') && touches)
      return 'Il bene collettivo non può essere venduto per moneta.';
  }
  return null;
}
/** Sanctuary protects the target itself, not an artisan merely working that material. */
export function sanctuaryProtected(
  s: GameState,
  targetId: string,
  position: { x: number; y: number },
) {
  return (
    distance(position, s.home) <= (hasBuilding(s, 'palace') ? 100 : 35) &&
    s.dogmas.some((d) => d.targetId === targetId && d.vectorId === 'O_01')
  );
}
export function protectedByDogma(s: GameState, targetId: string, unit?: Unit) {
  return s.dogmas.some(
    (d) =>
      d.vectorId === 'V_05' &&
      (d.targetId === targetId ||
        (!!unit && d.targetId.startsWith('S_') && matchesCaste(s, unit, d.targetId))) &&
      (!unit || !d.targetId.startsWith('S_') || matchesCaste(s, unit, d.targetId)),
  );
}
export function resourcePreservationFloor(s: GameState, e: MapEntity) {
  const id =
    e.kind === 'tree' ? 'O_03' : e.kind === 'stone' ? 'O_02' : e.kind === 'ore' ? 'O_07' : 'O_04';
  return s.dogmas.some((d) => d.targetId === id && d.vectorId === 'V_05')
    ? (e.maxAmount ?? e.amount) * 0.2
    : 0;
}
export function onDogmaticUse(s: GameState, tokens: string[], u?: Unit, target?: Target) {
  for (const token of tokens) s.eventTimes[`dogmaUse:${token}`] = s.time;
  for (const d of s.dogmas)
    if (
      vectorFamily(d.vectorId) === 'monopoly' &&
      touchesDogma(s, d.targetId, { tokens, unit: u, target }) &&
      u &&
      matchesCaste(s, u, d.vectorId)
    )
      s.cohesion = clamp(s.cohesion + 0.5);
}
export function handleDogmaticDeath(s: GameState, u: Unit, cause: string) {
  // Valhalla explicitly treats senile death as dishonour, even if the last order was combat.
  if (cause === 'oldAge' && s.dogmas.some((d) => d.targetId === 'V_03' && d.vectorId === 'O_06'))
    return {
      handled: true,
      cohesion: -5,
      attention: 0,
      collapse: !!(u.isKing && getDogmaEffects(s).kingDeathCollapse),
    };
  const martyr = s.dogmas.some(
    (d) =>
      d.vectorId === 'O_06' &&
      (cause === d.targetId ||
        u.lastDamageCause === d.targetId ||
        touchesDogma(s, d.targetId, { unit: u, tokens: u.command })),
  );
  return {
    handled: martyr,
    cohesion: martyr ? 10 : 0,
    attention: martyr ? 15 : 0,
    collapse: !!(u.isKing && getDogmaEffects(s).kingDeathCollapse),
  };
}
export function updateDogmas(s: GameState, dt: number) {
  for (const d of s.dogmas) {
    if (d.vectorId === 'C_02') {
      const present = dogmaTargetPresent(s, d.targetId);
      if (!present) s.cohesion = clamp(s.cohesion - (5 / 60) * dt);
    }
    if (d.vectorId === 'M_04') s.inequality = clamp(s.inequality + dt / 60);
  }
}
/** A condensed city still counts the person represented by each living unit. */
function immolate(s: GameState, victim: Unit) {
  const city = s.cities.find((c) => c.id === victim.cityId);
  if (city) {
    const cohort =
      victim.caste === 'slave'
        ? 'slaves'
        : victim.caste === 'warrior' || (victim.strength >= 7 && victim.age >= 4)
          ? 'warriors'
          : victim.caste === 'sage' || (victim.intelligence >= 7 && victim.age >= 4)
            ? 'sages'
            : 'workers';
    city.cohorts[cohort] = Math.max(0, city.cohorts[cohort] - 1);
    if (cohort === 'warriors') city.garrisonHp = Math.max(0, (city.garrisonHp ?? 0) - 100);
  }
  victim.hp = 0;
  victim.action = 'sacrificed';
  victim.command = undefined;
  victim.jobBuildingId = undefined;
  for (const building of s.buildings)
    if (building.workerIds)
      building.workerIds = building.workerIds.filter((id) => id !== victim.id);
  s.stats.deaths++;
  for (const [id, m] of Object.entries(s.words))
    if (m.custodians.includes(victim.id)) {
      m.retention = WORDS[id].tier === 0 ? 100 : m.retention * (1 - 1 / m.custodians.length);
      m.custodians = m.custodians.filter((id) => id !== victim.id);
    }
  s.entities.push({
    id: nextId(s, 'corpse'),
    kind: 'corpse',
    x: victim.x,
    y: victim.y,
    hp: 0,
    maxHp: 1,
    amount: 1,
  });
}
export function updateDogmasSeason(s: GameState) {
  for (const d of s.dogmas) {
    d.age++;
    if (!d.reforming) d.weight = dogmaWeight(d.age);
    if (vectorFamily(d.vectorId) === 'sacrifice') {
      if (d.targetId.startsWith('S_')) {
        const pool = d.targetId === 'S_05' ? s.units.filter((u) => u.hp > 0) : activeUnits(s);
        const victim = pool.find(
          (u) =>
            matchesCaste(s, u, d.targetId) &&
            !protectedByDogma(s, d.targetId, u) &&
            !getDogmaEffects(s, { unit: u }).protected,
        );
        if (victim && (hasBuilding(s, 'campfire') || hasBuilding(s, 'temple'))) {
          const king = victim.isKing && s.government === 'monarchy',
            collapse = king && getDogmaEffects(s).kingDeathCollapse;
          immolate(s, victim);
          s.cohesion = clamp(s.cohesion + 25);
          s.attention = clamp(s.attention + 30, 0, getDogmaEffects(s).attentionCap);
          for (const f of s.factions) f.relation = clamp(f.relation - 60, -100, 100);
          if (s.tier >= 4) s.revoltTension = 0;
          if (king) {
            s.kingId = null;
            s.cohesion = collapse ? 0 : clamp(s.cohesion - 50);
            if (collapse) s.gameOver = 'La morte del Re-Dio spezza la comunità.';
          }
        }
      } else {
        const r = resourceFor(d.targetId);
        if (d.targetId === 'O_04' && totalFood(s.resources) >= 10) {
          let remaining = 10;
          for (const food of ['meat', 'food', 'cooked'] as const) {
            const consumed = Math.min(remaining, s.resources[food]);
            s.resources[food] -= consumed;
            remaining -= consumed;
          }
          s.cohesion = clamp(s.cohesion + 15);
          s.eventTimes.sacrificeMorale = s.time + 90;
        } else if (r && s.resources[r] >= 10) {
          s.resources[r] -= 10;
          s.cohesion = clamp(s.cohesion + 15);
          s.eventTimes.sacrificeMorale = s.time + 90;
        }
      }
    }
    if (d.targetId === 'O_12' && d.vectorId === 'C_02') {
      s.cohesion = clamp(
        s.cohesion + (s.resources.coin > 0 ? Math.floor(s.resources.coin / 1000) * 5 : -30),
      );
    }
    if (d.targetId === 'V_13' && d.vectorId === 'S_05' && d.age % 4 === 0) {
      const last = s.eventTimes.holyWarConquests ?? 0,
        current = s.stats.conquests ?? 0;
      if (current === last) s.cohesion = clamp(s.cohesion - 5);
      s.eventTimes.holyWarConquests = current;
    }
  }
  if (getDogmaEffects(s).cremation)
    for (const corpse of s.entities.filter((e) => e.kind === 'corpse' && e.amount > 0)) {
      if (s.resources.wood < 5) break;
      s.resources.wood -= 5;
      s.burntWood += 5;
      corpse.amount = 0;
      s.attention = clamp(s.attention + 5, 0, getDogmaEffects(s).attentionCap);
    }
  const monarch = getDogmaEffects(s).monarchSelection;
  if (monarch && s.government === 'monarchy') {
    const key = monarch === 'strength' ? 'strength' : 'intelligence',
      leader = activeUnits(s).sort((a, b) => b[key] - a[key])[0];
    if (leader) {
      for (const u of s.units) u.isKing = u.id === leader.id;
      s.kingId = leader.id;
    }
  }
}
/** Physical support is tied to a staffed, active building, never a global technology flag. */
export function memorySupport(s: GameState, wordId: string) {
  let support = 0;
  for (const b of s.buildings.filter((b) => isPlayerBuilding(s, b) && b.active && b.hp > 0)) {
    if (b.kind === 'stele' && b.fixedWordId === wordId) support = Math.max(support, 0.95);
    if (b.kind === 'archive') {
      const spec = BUILDING_SPECS.archive,
        workers = b.cityId
          ? (b.lastEfficiency ?? 0)
          : Math.min(
              1,
              (b.workerIds ?? []).filter((id) =>
                s.units.some(
                  (u) =>
                    u.id === id &&
                    u.hp > 0 &&
                    u.jobBuildingId === b.id &&
                    distance(u, b) <= 3 &&
                    u.hunger < 75 &&
                    u.temp > 30,
                ),
              ).length / spec.workers,
            );
      support = Math.max(support, Math.min(1, workers));
    }
  }
  return support;
}
export const hasNourishment = (s: GameState) => totalFood(s.resources) > 0;
export const materialPresent = (s: GameState, r: Resource) =>
  s.resources[r] > 0 && !!RESOURCE_SPECS[r];
