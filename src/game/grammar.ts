import { BUILDING_SPECS, WORDS } from './content';
import { forbiddenByDogma, getDogmaConflict, getDogmaVectors, SACRED_TARGETS } from './dogmas';
import { hasBuilding, hasWord } from './runtime';
import type { BuildingKind, Compilation, GameState, Inventory, Target } from './types';

export const MAX_SLOTS = [2, 3, 4, 5, 6, 6] as const;
export const TRADITION_LIMITS = [0, 0, 0, 3, 5, 8] as const;
export const LAW_LIMITS = [0, 0, 0, 0, 3, 6] as const;
export const SANCTIONS = [
  'O_06',
  'S_06',
  'V_03',
  'O_12',
  'O_11',
  'O_10',
  'M_03',
  'M_05',
  'M_04',
  'S_04',
  'S_03',
  'O_05',
];
export interface Predicate {
  subject: string;
  verb: string;
  args: string[];
  condition?: string;
  kind: 'direct' | 'tradition' | 'law' | 'dogma';
}
export function getPredicate(tokens: string[]): Predicate {
  const condition = ['C_01', 'C_02'].includes(tokens[0]) ? tokens[0] : undefined;
  const start = condition ? 1 : 0;
  const subject = tokens[start] ?? '',
    verb = tokens[start + 1] ?? '';
  return {
    subject,
    verb,
    args: tokens.slice(start + 2),
    condition,
    kind: tokens.includes('C_03') ? 'law' : condition === 'C_02' ? 'tradition' : 'direct',
  };
}
export function cognitiveSlots(s: GameState) {
  return Math.max(2, MAX_SLOTS[s.tier] - (s.lockedSlot ? 1 : 0));
}
export function resolveConstruction(
  tokens: string[],
): { kind: BuildingKind; cost: Partial<Inventory>; quantity: number } | null {
  const p = getPredicate(tokens),
    sequence = [p.verb, ...p.args];
  for (const [kind, spec] of Object.entries(BUILDING_SPECS)) {
    if (kind === 'campfire') continue;
    if (spec.recipe.length === sequence.length && spec.recipe.every((v, i) => v === sequence[i])) {
      const quantity = p.subject === 'S_09' && kind === 'house' ? 4 : 1;
      const cost = Object.fromEntries(
        Object.entries(spec.cost).map(([r, n]) => [r, n * quantity]),
      ) as Partial<Inventory>;
      return { kind: kind as BuildingKind, cost, quantity };
    }
  }
  // The two material tokens name the same depot; food stores permit stone instead of wood.
  if (p.verb === 'V_05' && p.args.length === 1 && ['O_02', 'O_03', 'O_07'].includes(p.args[0]))
    return { kind: 'depot', cost: { wood: 5 }, quantity: 1 };
  return null;
}
const resourceTokens = ['O_02', 'O_03', 'O_04', 'O_07', 'O_12'];
const allArgs = (args: string[], allowed: string[]) => args.every((a) => allowed.includes(a));
export function compileSentence(s: GameState, tokens: string[], target?: Target): Compilation {
  const no = (message: string): Compilation => ({ valid: false, message, requiresTarget: false });
  if (s.gameOver) return no('La storia è terminata.');
  if (tokens.some((t) => !WORDS[t] || !hasWord(s, t)))
    return no('La tribù non conosce tutte le parole della frase.');
  if (tokens.length > cognitiveSlots(s))
    return no(`La frase può contenere al massimo ${cognitiveSlots(s)} parole.`);
  if (tokens.length < 2) return no('Un pensiero richiede almeno un soggetto e un’azione.');
  const p = getPredicate(tokens);
  // Emancipation is the explicitly defined exception to the verbal grammar.
  if (tokens.join('|') === 'C_02|S_01|M_05') {
    if (s.tier < 3) return no('Le tradizioni richiedono il Neolitico.');
    const restriction = forbiddenByDogma(s, tokens, target);
    if (restriction) return no(restriction);
    return {
      valid: true,
      message: 'Abolire la schiavitù: tutti diventano liberi.',
      requiresTarget: false,
      kind: 'tradition',
      subject: 'S_01',
      verb: 'M_05',
      args: [],
      condition: 'C_02',
      action: 'emancipating',
    };
  }
  const grammaticalOrder = WORDS[p.subject]?.kind === 'S' && WORDS[p.verb]?.kind === 'V';
  const historicalGerontocracy = tokens.join('|') === 'S_04|C_02|M_04';
  if (historicalGerontocracy && !hasWord(s, 'M_03'))
    return no('Per incidere questo dogma devi conoscere Sacro.');
  if ((tokens.includes('M_03') && !grammaticalOrder) || historicalGerontocracy) {
    const remaining = historicalGerontocracy
      ? ['S_04', 'M_04']
      : tokens.filter((t) => t !== 'M_03');
    if (
      s.tier < 2 ||
      remaining.length !== 2 ||
      !SACRED_TARGETS.includes(remaining[0]) ||
      !getDogmaVectors(remaining[0]).includes(remaining[1])
    )
      return no(
        'Questi concetti non possono formare un dogma. Scegli cosa rendere sacro e quale regola imporgli.',
      );
    const conflict = getDogmaConflict(s.dogmas, remaining[0], remaining[1]);
    if (conflict) return no(conflict);
    return {
      valid: true,
      message: 'Incidere una regola sulla Pietra Sacra.',
      requiresTarget: false,
      kind: 'dogma',
      args: remaining,
      action: 'inscribing',
    };
  }
  if (tokens.includes('C_03')) {
    if (
      s.tier < 4 ||
      tokens.length !== 6 ||
      tokens[4] !== 'C_03' ||
      WORDS[tokens[0]]?.kind !== 'S' ||
      WORDS[tokens[1]]?.kind !== 'V' ||
      !SANCTIONS.includes(tokens[5])
    )
      return no(
        'La legge richiede sei parole: Soggetto · Azione · Oggetto · Misura o condizione · Altrimenti · Conseguenza.',
      );
    if (tokens.slice(0, 4).some((t) => t === 'C_03'))
      return no('I primi quattro spazi devono descrivere il dovere o il reato.');
    if (!hasBuilding(s, 'palace')) return no('Le leggi si promulgano nel Palazzo Reale attivo.');
    const prohibited = tokens[3] === 'M_01';
    return {
      valid: true,
      message: prohibited
        ? 'Codice penale: questa azione sarà un reato.'
        : 'Dovere stagionale: la comunità dovrà rispettarlo a ogni cambio di stagione.',
      requiresTarget: false,
      kind: 'law',
      subject: p.subject,
      verb: p.verb,
      args: tokens.slice(2),
      action: 'legislating',
    };
  }
  if (!grammaticalOrder) return no('Inizia con un soggetto, seguito da un verbo.');
  if (p.condition === 'C_02' && s.tier < 3)
    return no('Solo il Neolitico consente di fissare tradizioni permanenti.');
  if (p.condition === 'C_01' && s.tier < 1) return no('La tribù deve comprendere la Notte.');
  if (p.args.some((a) => a === 'C_03' || a === 'C_01'))
    return no('Metti la condizione prima del soggetto, non dopo l’azione.');
  const restriction = forbiddenByDogma(s, tokens, target);
  if (restriction) return no(restriction);
  const out = (
    message: string,
    action: string,
    requiresTarget = false,
    extra: Partial<Compilation> = {},
  ): Compilation => ({
    valid: true,
    message,
    requiresTarget,
    action,
    subject: p.subject,
    verb: p.verb,
    args: p.args,
    condition: p.condition,
    kind:
      p.condition === 'C_02' || (p.condition === 'C_01' && s.tier >= 3) ? 'tradition' : 'direct',
    ...extra,
  });
  const a = p.args;
  const construction = resolveConstruction(tokens);
  const entity = target?.type === 'entity' ? s.entities.find((e) => e.id === target.id) : undefined;
  if (p.verb === 'V_01') {
    if (!allArgs(a, ['O_01', 'M_01', 'O_10', 'S_05', 'S_08']))
      return no('Per andare, scegli un luogo, un confine, un pericolo o uno straniero.');
    return out(
      a.includes('O_01') ? 'Ritorna al giaciglio.' : 'Scegli un luogo da raggiungere.',
      'moving',
      !target && !a.length,
    );
  }
  if (p.verb === 'V_02') {
    if (!allArgs(a, ['O_04', 'O_06', 'M_04']))
      return no('Per mangiare, indica una fonte di cibo o una carcassa.');
    if (!a.length && target && target.type !== 'entity')
      return no('Indica un cespuglio o una carcassa da mangiare.');
    if (
      !a.length &&
      entity &&
      !['berries', 'corpse', 'deer', 'wolf', 'alpha', 'mammoth', 'ground'].includes(entity.kind)
    )
      return no('Questo bersaglio non è commestibile.');
    if (entity && ['deer', 'wolf', 'alpha', 'mammoth'].includes(entity.kind) && entity.hp > 0)
      return no('La preda deve essere abbattuta prima di essere mangiata.');
    return out(
      a.includes('M_04') && a.includes('O_04')
        ? 'Le persone indicate avranno la precedenza sulle scorte di cibo, anche dopo questo pasto.'
        : 'Nutrirsi sul posto fino alla sazietà.',
      'eating',
      !target && !a.length,
    );
  }
  if (p.verb === 'V_03') {
    if (
      !allArgs(a, [
        'O_02',
        'O_03',
        'O_04',
        'O_07',
        'M_01',
        'M_02',
        'S_01',
        'S_02',
        'S_05',
        'S_06',
        'V_05',
        'S_08',
      ])
    )
      return no('Il bersaglio non può essere colpito con questa frase.');
    if (
      !a.length &&
      target &&
      target.type === 'entity' &&
      entity &&
      ['berries', 'corpse', 'seedling'].includes(entity.kind)
    )
      return no('Questa risorsa si mangia o si trasporta.');
    if (!a.length && target && target.type === 'point')
      return no('Indica una risorsa, un animale o un nemico.');
    return out(
      'Caccia, estrai o combatti secondo il bersaglio.',
      'gathering',
      !target && !a.length,
    );
  }
  if (p.verb === 'V_04') {
    if (
      !allArgs(a, [
        ...resourceTokens,
        'O_01',
        'O_05',
        'O_06',
        'O_09',
        'O_10',
        'O_11',
        'M_04',
        'S_05',
        'S_07',
        'S_09',
        'M_02',
      ])
    )
      return no('Per trasportare qualcosa, scegli una risorsa e una destinazione adatte.');
    if (!a.length && !target) return no('Scegli ciò che va portato.');
    return out(
      a.includes('O_09')
        ? 'Invia i saggi a insegnare la scrittura.'
        : 'Raccoglie la risorsa e la riporta al giaciglio.',
      'gathering',
      false,
    );
  }
  if (p.verb === 'V_05') {
    if (!allArgs(a, [...resourceTokens, 'M_02', 'O_05', 'O_09', 'O_01']))
      return no('Scegli una risorsa, il fuoco o la scrittura da conservare.');
    if (a.includes('O_04') && !a.includes('M_02'))
      return no('Per creare scorte di cibo serve il concetto di Domani.');
    if (construction)
      return out(`Preparare ${BUILDING_SPECS[construction.kind].label}.`, 'building', false, {
        buildingKind: construction.kind,
        cost: construction.cost,
      });
    if (a.includes('O_05')) return out('Custodire e alimentare il fuoco.', 'guarding');
    if (a.includes('O_09')) return out('Gli scribi mantengono attivo l’Archivio.', 'copying');
    if (a.includes('O_12'))
      return out('Conservare moneta: le scorte aumentano del 5% a stagione.', 'saving');
    if (a.includes('O_01')) return out('Sorvegliare il giaciglio.', 'guarding');
    return no('Queste parole non indicano cosa conservare. Controlla le ricette conosciute.');
  }
  if (p.verb === 'V_06') {
    if (!a.includes('O_02') || !allArgs(a, ['O_02', 'O_03', 'M_03', 'O_09']))
      return no('Scheggiare richiede Pietra, eventualmente con Legno, Sacro o Scrittura.');
    if (construction)
      return out(`Erigere ${BUILDING_SPECS[construction.kind].label}.`, 'building', false, {
        buildingKind: construction.kind,
        cost: construction.cost,
      });
    return out(
      a.includes('O_03')
        ? 'Fabbricare una lancia: un’unità di pietra e una di legno.'
        : 'Fabbricare un utensile: un’unità di pietra.',
      'crafting',
      false,
      { cost: a.includes('O_03') ? { stone: 1, wood: 1 } : { stone: 1 } },
    );
  }
  if (p.verb === 'V_07') {
    if (
      !a.includes('O_05') ||
      !a.some((t) => ['O_04', 'O_02'].includes(t)) ||
      !allArgs(a, ['O_05', 'O_04', 'O_02'])
    )
      return no('Cuocere richiede Fuoco con Preda oppure Pietra.');
    if (!hasBuilding(s, 'campfire')) return no('Occorre un falò attivo.');
    return out(
      a.includes('O_02')
        ? 'Cuocere ceramica: il cibo marcisce più lentamente.'
        : 'Cuocere la carne: il nutrimento passa da 40 a 60 per porzione.',
      'cooking',
    );
  }
  if (p.verb === 'V_08') {
    if (a.includes('O_01') && a.includes('O_10'))
      return out(
        'Fondare una colonia: 30 cittadini e 50 unità di ciascuna risorsa, legno, pietra e cibo.',
        'colonizing',
        !target,
      );
    if (a.includes('O_13') && a.includes('S_08'))
      return out('Aggregare una catapulta: 40 unità di legno e 20 lingotti.', 'building', !target, {
        cost: { wood: 40, ingot: 20 },
      });
    if (!construction)
      return no(
        'Queste parole non formano una ricetta edilizia. Consulta le costruzioni conosciute.',
      );
    return out(
      `Costruire ${BUILDING_SPECS[construction.kind].label}${construction.quantity === 4 ? ' ×4' : ''}.`,
      'building',
      false,
      { buildingKind: construction.kind, cost: construction.cost },
    );
  }
  if (p.verb === 'V_09') {
    if (a.length === 1 && a[0] === 'O_03')
      return out('Rimboschire il terreno.', 'planting', !target);
    if (!a.includes('O_04') || !allArgs(a, ['O_04', 'O_01']))
      return no('Seminare richiede Preda (cibo vegetale) e, per il campo, Qui.');
    return out(
      'Seminare un campo: servono 5 semi. A pieno rendimento, il raccolto fornisce 50 unità di cibo alla fine dell’autunno.',
      'farming',
      false,
      construction ? { buildingKind: construction.kind, cost: construction.cost } : {},
    );
  }
  if (p.verb === 'V_10') {
    if (!a.includes('O_04') || !allArgs(a, ['O_04', 'O_01', 'M_01', 'S_08']))
      return no('Addomesticare richiede Preda, con Qui o Pericolo secondo la destinazione.');
    return out(
      a.includes('M_01')
        ? 'Addomesticare il lupo o organizzare la cavalleria.'
        : 'Creare un recinto e allevare la preda.',
      'domesticating',
      !a.includes('O_01') && !target,
      construction ? { buildingKind: construction.kind, cost: construction.cost } : {},
    );
  }
  if (p.verb === 'V_11') {
    if (
      !a.some((t) => resourceTokens.includes(t)) ||
      !allArgs(a, [...resourceTokens, 'S_05', 'S_06', 'S_08'])
    )
      return no('Scambiare richiede una risorsa e una controparte.');
    return out('Inviare una carovana di scambio.', 'trading', !a.includes('S_05') && !target);
  }
  if (p.verb === 'V_12') {
    if (!a.includes('O_07') || !allArgs(a, ['O_07', 'O_05', 'V_03', 'S_08', 'O_08']))
      return no('Fondere richiede Metallo con Fuoco, Colpire/Esercito oppure Numero.');
    return out(
      a.includes('O_08')
        ? 'Coniare moneta: un lingotto produce 100 monete.'
        : a.includes('V_03') || a.includes('S_08')
          ? 'Forgiare armi e armature.'
          : 'Raffinare: un’unità di minerale e due di legno producono un lingotto.',
      'smelting',
      false,
      construction ? { buildingKind: construction.kind, cost: construction.cost } : {},
    );
  }
  if (p.verb === 'V_13') {
    if (p.subject !== 'S_08') return no('Solo l’Esercito può conquistare.');
    if (!allArgs(a, ['S_09', 'S_05', 'O_10', 'M_02']))
      return no('Scegli una città straniera o un confine da occupare.');
    return out(
      a.includes('O_10')
        ? 'Fondare un avamposto.'
        : 'Assediare, occupare per 30 secondi e annettere la città.',
      'conquering',
      !target,
    );
  }
  if (p.verb === 'V_14') {
    if (p.subject !== 'S_04') return no('Dubitare è il compito di Chi è Saggio.');
    if (!hasBuilding(s, 'school')) return no('La riforma richiede una Scuola Filosofica attiva.');
    if (a.includes('S_07') && a.includes('M_05'))
      return out('Fondare una repubblica ed emancipare i cittadini.', 'reforming');
    if (a.includes('M_03') && a.some((t) => t !== 'M_03' && SACRED_TARGETS.includes(t)))
      return out('Erodere il peso del dogma di 15 punti a stagione.', 'reforming');
    return no('Dubitare richiede Sacro e il concetto del dogma, oppure Re e Libero.');
  }
  return no('La tribù non comprende questo ordine. Controlla l’azione e le parole che la seguono.');
}

export const getSyntaxSlots = cognitiveSlots;
