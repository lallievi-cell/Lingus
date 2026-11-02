import { BUILDING_ORDER, BUILDING_SPECS, WORDS } from './content';
import { cognitiveSlots, getPredicate, resolveConstruction } from './grammar';
import { hasWord } from './runtime';
import type { BuildingKind, GameState, PhrasebookEntry } from './types';

export const PHRASEBOOK_LIMIT = 64;
export type PhraseCategory = 'construction' | 'work' | 'tradition' | 'law' | 'dogma' | 'other';
export interface PhrasebookItem extends PhrasebookEntry {
  title: string;
  description: string;
  category: PhraseCategory;
  used: boolean;
  /** Ready to prepare, rather than a guarantee that the order can run now. */
  available: boolean;
  issue?: string;
  buildingKind?: BuildingKind;
}

export const phraseKey = (tokens: readonly string[]) => tokens.join('|');

/** Physical benefits remain understandable before the tribe knows numbers. */
export function buildingPurpose(kind: BuildingKind): string {
  const descriptions: Record<BuildingKind, string> = {
    campfire:
      'Riscalda chi si avvicina e permette di tramandare le parole. Va alimentato con legna.',
    storage: 'Conserva più cibo e rallenta il deterioramento delle scorte alimentari.',
    depot: 'Dà più spazio a legna, pietra, pelli, utensili e agli altri materiali consegnati.',
    menhir: 'Accoglie i dogmi della comunità e sostiene il morale nelle vicinanze.',
    stele: 'Affida una parola alla pietra e la protegge dall’oblio.',
    farm: 'Gli addetti coltivano cibo da raccogliere alla fine dell’autunno. Occorrono semi per costruzione e manutenzione.',
    pen: 'Gli allevatori mantengono il bestiame e producono carne e pelli. In inverno serve foraggio vegetale.',
    foundry:
      'Gli addetti trasformano minerale e legna in lingotti; con le conoscenze adatte lavorano anche armi e monete.',
    hut: 'Ospita nuove famiglie e offre calore e riparo per il riposo. Consuma legna per la manutenzione.',
    palisade:
      'Protegge il campo da predatori e incursori senza mezzi d’assedio. Richiede manutenzione.',
    house:
      'Ospita famiglie, offre calore e resiste al fuoco. Occorre pietra per mantenerla attiva.',
    grave:
      'Un addetto seppellisce i defunti vicini, riducendo i rischi dei corpi insepolti e restituendo Coesione.',
    temple:
      'Con i saggi al lavoro sostiene l’Attenzione, amplia lo spazio per i dogmi e protegge il fuoco dalle intemperie.',
    walls:
      'Proteggono la città dai danni di frecce e mezzi d’assedio. Occorre pietra per mantenerle.',
    archive:
      'Gli scribi proteggono le parole dall’oblio. Perdere l’Archivio mette in pericolo il sapere inutilizzato.',
    palace:
      'Permette di promulgare leggi imperiali e raccogliere tributi. Richiede un mantenimento in monete.',
    market:
      'Gli addetti vendono le eccedenze quando le scorte sono abbondanti. Richiede un mantenimento in monete.',
    court:
      'Contiene la corruzione e applica le sanzioni previste dalle leggi, con gli addetti necessari.',
    school: 'Permette ai saggi di praticare Dubitare e sostiene l’Intelligenza dei giovani.',
    workshop: 'Con gli addetti al lavoro aumenta la produzione dei campi e dei giacimenti.',
  };
  return descriptions[kind];
}

/** Entry ID contains only vocabulary IDs, never a location or unit identifier. */
function validTokens(tokens: unknown, state: GameState): tokens is string[] {
  return (
    Array.isArray(tokens) &&
    tokens.length >= 2 &&
    tokens.length <= 6 &&
    tokens.every(
      (id) => typeof id === 'string' && Object.hasOwn(WORDS, id) && Object.hasOwn(state.words, id),
    )
  );
}

export function validPhrasebook(value: unknown, state: GameState): boolean {
  if (value === undefined) return true;
  if (!Array.isArray(value) || value.length > PHRASEBOOK_LIMIT) return false;
  const ids = new Set<string>();
  return value.every((candidate) => {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return false;
    const entry = candidate as Record<string, unknown>;
    if (
      Object.keys(entry).some(
        (key) => !['id', 'tokens', 'favorite', 'firstUsedAt', 'lastUsedAt'].includes(key),
      )
    )
      return false;
    if (
      !validTokens(entry.tokens, state) ||
      entry.id !== phraseKey(entry.tokens) ||
      typeof entry.favorite !== 'boolean' ||
      ids.has(entry.id as string)
    )
      return false;
    ids.add(entry.id as string);
    const time = (at: unknown) =>
      typeof at === 'number' && Number.isFinite(at) && at >= 0 && at <= state.time;
    if (entry.firstUsedAt === undefined && entry.lastUsedAt === undefined) return true;
    return (
      time(entry.firstUsedAt) &&
      time(entry.lastUsedAt) &&
      (entry.firstUsedAt as number) <= (entry.lastUsedAt as number)
    );
  });
}

function bounded(entries: PhrasebookEntry[]) {
  // Newly used records are supplied first. Preserve favorites before evicting
  // older ordinary records; no unbounded log is appended to the simulation.
  const keep = [
    ...entries.filter((entry) => entry.favorite),
    ...entries.filter((entry) => !entry.favorite),
  ].slice(0, PHRASEBOOK_LIMIT);
  const ids = new Set(keep.map((entry) => entry.id));
  return entries.filter((entry) => ids.has(entry.id));
}

/** Call only after the real command handler has acknowledged an order. */
export function rememberPhrase(state: GameState, tokens: readonly string[]): GameState {
  if (!validTokens(tokens, state) || tokens.some((id) => !hasWord(state, id))) return state;
  const id = phraseKey(tokens),
    previous = state.phrasebook?.find((entry) => entry.id === id);
  const entry: PhrasebookEntry = {
    id,
    tokens: [...tokens],
    favorite: previous?.favorite ?? false,
    firstUsedAt: previous?.firstUsedAt ?? state.time,
    lastUsedAt: state.time,
  };
  return {
    ...state,
    phrasebook: bounded([entry, ...(state.phrasebook ?? []).filter((item) => item.id !== id)]),
  };
}

/** Favoriting a known recipe records a reference, rather than inventing a use. */
export function togglePhraseFavorite(state: GameState, tokens: readonly string[]): GameState {
  if (!validTokens(tokens, state)) return state;
  const id = phraseKey(tokens),
    previous = state.phrasebook?.find((entry) => entry.id === id);
  if (!previous && tokens.some((word) => !hasWord(state, word))) return state;
  if (
    !previous &&
    (state.phrasebook?.filter((entry) => entry.favorite).length ?? 0) >= PHRASEBOOK_LIMIT
  )
    return state;
  const entry: PhrasebookEntry = previous
    ? { ...previous, tokens: [...previous.tokens], favorite: !previous.favorite }
    : { id, tokens: [...tokens], favorite: true };
  const entries = previous
    ? (state.phrasebook ?? []).map((item) => (item.id === id ? entry : item))
    : bounded([entry, ...(state.phrasebook ?? [])]);
  if (!entries.some((item) => item.id === id)) return state;
  return { ...state, phrasebook: entries };
}

const WORK_TEMPLATES = [
  ['S_01', 'V_01'],
  ['S_01', 'V_01', 'O_01'],
  ['S_01', 'V_02'],
  ['S_01', 'V_03'],
  ['S_01', 'V_03', 'O_04'],
  ['S_01', 'V_03', 'O_04', 'M_01'],
  ['S_01', 'V_04', 'O_03'],
  ['S_01', 'V_04', 'O_02'],
  ['S_01', 'V_04', 'O_04'],
  ['S_01', 'V_06', 'O_02'],
  ['S_01', 'V_06', 'O_02', 'O_03'],
  ['S_01', 'V_07', 'O_04', 'O_05'],
  ['S_01', 'V_07', 'O_02', 'O_05'],
  ['S_01', 'V_05', 'O_01'],
  ['S_04', 'V_05', 'O_09'],
  ['S_01', 'V_09', 'O_03'],
] as const;

function recallIssue(state: GameState, tokens: readonly string[]) {
  const lost = tokens.filter((id) => !hasWord(state, id));
  if (lost.length)
    return `Da riscoprire: ${[...new Set(lost)].map((id) => WORDS[id]?.label ?? 'parola sconosciuta').join(', ')}.`;
  if (tokens.length > cognitiveSlots(state))
    return 'Questa frase richiede più spazi di pensiero di quelli attualmente disponibili.';
  return undefined;
}

function describe(
  state: GameState,
  tokens: string[],
): Pick<PhrasebookItem, 'title' | 'description' | 'category' | 'buildingKind'> {
  const p = getPredicate(tokens),
    args = p.args;
  const summary = tokens.map((id) => WORDS[id]?.label).join(' · ');
  if (tokens.includes('C_03')) {
    const known = state.laws.find((law) => phraseKey(law.tokens) === phraseKey(tokens));
    return {
      title: known?.name ?? `Legge: ${WORDS[p.verb]?.label ?? 'regola della comunità'}`,
      description: p.args.includes('M_01')
        ? 'Trasforma il comportamento indicato in un reato. L’ultima parola stabilisce la conseguenza: controlla l’anteprima prima di promulgare la legge.'
        : 'Stabilisce un dovere della comunità, verificato al cambio di stagione. L’ultima parola indica la conseguenza prevista dalla legge.',
      category: 'law',
    };
  }
  const grammaticalOrder = WORDS[p.subject]?.kind === 'S' && WORDS[p.verb]?.kind === 'V';
  const dogma =
    (tokens.includes('M_03') && !grammaticalOrder) || phraseKey(tokens) === 'S_04|C_02|M_04';
  if (dogma)
    return {
      title: `Dogma: ${summary}`,
      description:
        'Incide una regola sulla Pietra Sacra e modifica i comportamenti della comunità. Verifica effetti e conflitti prima di pronunciarla.',
      category: 'dogma',
    };
  if (phraseKey(tokens) === 'C_02|S_01|M_05')
    return {
      title: 'Abolisci la schiavitù',
      description:
        'Rende libere le persone in schiavitù e stabilisce l’emancipazione come tradizione.',
      category: 'tradition',
    };
  const construction = resolveConstruction(tokens);
  const fire = p.verb === 'V_05' && args.includes('O_05');
  const base = (): Pick<PhrasebookItem, 'title' | 'description' | 'category' | 'buildingKind'> => {
    if (p.verb === 'V_04' && args.includes('S_05'))
      return {
        title: 'Invia un dono diplomatico',
        description:
          'Invia una carovana con risorse effettive alla comunità indicata per migliorare i rapporti. Il dono non cambia automaticamente le dottrine.',
        category: 'work',
      };
    if (p.subject === 'S_04' && p.verb === 'V_04' && args.includes('O_09') && args.includes('S_09'))
      return {
        title: 'Invia una delegazione di saggi',
        description:
          'Un saggio viaggia verso la provincia o la comunità ospite e vi condivide le parole nel tempo. Un popolo straniero deve essere in pace e disposto ad accoglierlo.',
        category: 'work',
      };
    if (p.subject === 'S_08') {
      if (p.verb === 'V_01')
        return {
          title: args.includes('O_01') ? 'Richiama il battaglione' : 'Muovi il battaglione',
          description:
            'Manda il battaglione scelto verso il giaciglio o la destinazione indicata sulla mappa.',
          category: 'work',
        };
      if (p.verb === 'V_03')
        return {
          title: 'Attacca un insediamento',
          description:
            'Il battaglione avanza contro l’insediamento straniero indicato e avvia le ostilità. Attaccare non equivale ad annettere.',
          category: 'work',
        };
      if (p.verb === 'V_10')
        return {
          title: 'Organizza la cavalleria',
          description:
            'Trasforma il battaglione in cavalleria, migliorandone velocità e capacità di combattimento secondo le regole disponibili.',
          category: 'work',
        };
    }
    if (p.subject === 'S_09' && p.verb === 'V_04')
      return {
        title: 'Invia un convoglio fra città',
        description:
          'Preleva la risorsa scelta dalle scorte della città di partenza e la trasporta fisicamente a un’altra città dell’Impero.',
        category: 'work',
      };
    if (p.subject === 'S_09' && p.verb === 'V_12' && args.includes('S_08'))
      return {
        title: 'Recluta un battaglione',
        description:
          'Organizza un battaglione professionale usando reclute e armi metalliche effettivamente disponibili nella città scelta.',
        category: 'work',
      };
    if (construction || fire) {
      const kind = construction?.kind ?? 'campfire';
      if ((construction?.quantity ?? 1) > 1)
        return {
          title: 'Quartiere di case in muratura',
          description: 'Costruisce più case insieme nella città indicata. ' + buildingPurpose(kind),
          category: 'construction',
          buildingKind: kind,
        };
      const operation =
        kind === 'farm'
          ? 'Prepara il campo o assegna contadini a quello indicato. '
          : kind === 'pen'
            ? 'Prepara il recinto o assegna allevatori a quello indicato. '
            : kind === 'foundry'
              ? 'Prepara la fonderia o assegna addetti a quella indicata. '
              : kind === 'campfire'
                ? 'Accende il primo Falò se ci sono materiali sufficienti oppure alimenta quello indicato. '
                : BUILDING_SPECS[kind].workers > 0
                  ? 'Su un edificio compatibile già esistente assegna gli addetti.'
                  : '';
      return {
        title: BUILDING_SPECS[kind].label,
        description: `${buildingPurpose(kind)} ${operation}`.trim(),
        category: 'construction',
        buildingKind: kind,
      };
    }
    switch (p.verb) {
      case 'V_01':
        return {
          title: args.includes('O_01') ? 'Torna al campo' : 'Raggiungi un luogo',
          description: args.includes('O_01')
            ? 'Riporta gli esecutori al giaciglio. L’ordine non teletrasporta le persone.'
            : 'Manda gli esecutori verso il luogo o il bersaglio indicato sulla mappa.',
          category: 'work',
        };
      case 'V_02':
        return {
          title:
            args.includes('M_04') && args.includes('O_04')
              ? 'Dai precedenza al cibo'
              : 'Mangia fino alla sazietà',
          description:
            args.includes('M_04') && args.includes('O_04')
              ? 'Assegna agli esecutori l’accesso prioritario alle scorte, anche dopo il pasto.'
              : 'Fa mangiare gli esecutori dalle scorte raggiungibili o dalla fonte scelta. La carne cruda può causare malattia.',
          category: 'work',
        };
      case 'V_03':
        return {
          title:
            args.includes('S_06') || args.includes('V_05')
              ? 'Cattura uno straniero'
              : args.includes('O_04')
                ? args.includes('M_01')
                  ? 'Caccia grossa'
                  : 'Caccia una preda'
                : 'Colpisci ed estrai',
          description:
            args.includes('S_06') || args.includes('V_05')
              ? 'Attacca lo straniero indicato e tenta di catturarlo quando è abbastanza ferito, se le regole consentono la schiavitù.'
              : args.includes('O_04')
                ? args.includes('M_01')
                  ? 'Cerca predatori alfa e mammut. È una caccia pericolosa: scegli cacciatori ed equipaggiamento adatti.'
                  : 'Abbatte una preda viva, lasciando una carcassa da mangiare o raccogliere.'
                : 'Su alberi e rocce estrae materiali e li lascia sul posto. Contro animali o nemici avvia un combattimento.',
          category: 'work',
        };
      case 'V_04': {
        const material =
          args.includes('O_05') || args.includes('O_03')
            ? 'legna'
            : args.includes('O_02')
              ? 'pietra'
              : args.includes('O_07')
                ? 'minerale'
                : args.includes('O_04') || args.includes('O_06')
                  ? 'cibo'
                  : 'risorse';
        return {
          title: `Raccogli e porta ${material}`,
          description:
            material === 'cibo'
              ? 'Raccoglie cibo da cespugli, carcasse e risorse a terra e lo trasporta al campo. Non abbatte animali vivi.'
              : 'Raccoglie dai cumuli oppure estrae dalla fonte compatibile, poi trasporta il carico al campo.',
          category: 'work',
        };
      }
      case 'V_05':
        return {
          title: args.includes('O_09')
            ? 'Affida il sapere agli scribi'
            : args.includes('O_01')
              ? 'Sorveglia il campo'
              : args.includes('O_12')
                ? 'Conserva le monete'
                : 'Conserva le risorse',
          description: args.includes('O_09')
            ? 'Assegna gli esecutori all’Archivio, dove gli scribi proteggono la memoria della comunità.'
            : args.includes('O_01')
              ? 'Assegna agli esecutori la sorveglianza del giaciglio.'
              : args.includes('O_12')
                ? 'Favorisce nel tempo la crescita delle monete conservate.'
                : 'Conserva la risorsa indicata secondo le regole e le istituzioni disponibili.',
          category: 'work',
        };
      case 'V_06':
        return {
          title: args.includes('O_03') ? 'Fabbrica una lancia' : 'Fabbrica utensili',
          description: args.includes('O_03')
            ? 'Un artigiano consuma legno e pietra per fabbricare una lancia.'
            : state.playMode === 'guided'
              ? 'Un artigiano fabbrica utensili durante il giorno, consumando la pietra necessaria a ogni ciclo. Servono spazio e risorse disponibili.'
              : 'Un artigiano consuma pietra e completa un utensile, poi attende un nuovo ordine.',
          category: 'work',
        };
      case 'V_07':
        return {
          title: args.includes('O_02') ? 'Cuoci ceramica' : 'Cuoci la carne',
          description: args.includes('O_02')
            ? 'Un artigiano consuma pietra per cuocere ceramica, che rallenta il deterioramento del cibo. Serve un Falò acceso.'
            : state.playMode === 'guided'
              ? 'Un cuoco prepara pasti durante il giorno, consumando carne per ogni porzione. Servono un Falò acceso, spazio e ingredienti; i bisogni interrompono il lavoro.'
              : 'Un artigiano consuma carne e prepara una porzione cotta. Serve un Falò acceso; per un’altra porzione occorre un nuovo ordine.',
          category: 'work',
        };
      case 'V_08':
        return {
          title: args.includes('O_10') ? 'Fonda una colonia' : 'Prepara una macchina d’assedio',
          description: args.includes('O_10')
            ? 'Invia cittadini e risorse reali per fondare una colonia nel luogo indicato.'
            : 'Prepara il mezzo d’assedio indicato, consumando i materiali necessari.',
          category: 'work',
        };
      case 'V_09':
        return {
          title: 'Rimboschisci il terreno',
          description: 'Assegna gli esecutori al rimboschimento nel luogo indicato.',
          category: 'work',
        };
      case 'V_10':
        return {
          title: 'Addomestica una preda',
          description:
            'Avvicina e addomestica l’animale indicato; la combinazione con Pericolo riguarda lupi o cavalleria.',
          category: 'work',
        };
      case 'V_11':
        return {
          title: args.includes('S_06') ? 'Acquista un servo' : 'Invia una carovana di scambio',
          description: args.includes('S_06')
            ? 'Scambia monete con la comunità straniera per trasferire una persona della casta servile nella tua comunità, se le dottrine lo consentono.'
            : 'Invia merci reali alla controparte scelta. Lo scambio dipende da viaggio, scorte e rapporti fra le comunità.',
          category: 'work',
        };
      case 'V_12':
        return {
          title: args.includes('O_08')
            ? 'Conia monete'
            : args.includes('V_03') || args.includes('S_08')
              ? 'Forgia armi'
              : 'Raffina il minerale',
          description: args.includes('O_08')
            ? 'Trasforma lingotti in monete con gli addetti e le strutture necessarie.'
            : args.includes('V_03') || args.includes('S_08')
              ? 'Lavora lingotti per produrre equipaggiamento militare.'
              : 'Trasforma minerale e legna in lingotti. Occorrono una fonderia e gli addetti necessari.',
          category: 'work',
        };
      case 'V_13':
        return {
          title: 'Assedia e conquista',
          description:
            'Manda l’esercito contro una città: conquista e annessione richiedono un assedio e un’occupazione effettivi.',
          category: 'work',
        };
      case 'V_14':
        return {
          title: args.includes('M_05') ? 'Fonda una repubblica' : 'Riforma un dogma',
          description: args.includes('M_05')
            ? 'Affida ai saggi la riforma del governo e l’emancipazione dei cittadini. Occorre una Scuola filosofica attiva.'
            : 'Affida ai saggi la riforma della dottrina indicata, riducendone il peso nel tempo. Occorre una Scuola filosofica attiva.',
          category: 'work',
        };
      default:
        return {
          title: summary,
          description:
            'Prepara la frase e consulta l’anteprima per verificare esecutori, costi e bersaglio.',
          category: 'other',
        };
    }
  };
  const result = base();
  if (p.condition === 'C_02' || (p.condition === 'C_01' && state.tier >= 3))
    return {
      title: `${p.condition === 'C_01' ? 'Turno notturno' : 'Tradizione'}: ${result.title}`,
      description: `Stabilisce un incarico ${p.condition === 'C_01' ? 'notturno' : 'permanente'}, eseguito quando bisogni, risorse e regole lo consentono. ${result.description}`,
      category: 'tradition',
    };
  return p.condition === 'C_01' ? { ...result, title: `Di notte: ${result.title}` } : result;
}

/** Read-only catalogue: knowledge creates recipes, actual accepted use creates history. */
export function getPhrasebook(state: GameState): PhrasebookItem[] {
  const entries = new Map((state.phrasebook ?? []).map((entry) => [entry.id, entry]));
  const candidates = new Map<string, string[]>();
  const addKnown = (tokens: readonly string[]) => {
    if (tokens.every((id) => hasWord(state, id))) candidates.set(phraseKey(tokens), [...tokens]);
  };
  for (const kind of BUILDING_ORDER)
    addKnown(
      kind === 'campfire' ? ['S_01', 'V_05', 'O_05'] : ['S_01', ...BUILDING_SPECS[kind].recipe],
    );
  for (const tokens of WORK_TEMPLATES) addKnown(tokens);
  for (const entry of entries.values()) candidates.set(entry.id, [...entry.tokens]);
  return [...candidates]
    .map(([id, tokens]) => {
      const entry = entries.get(id),
        issue = recallIssue(state, tokens);
      return {
        id,
        tokens,
        favorite: entry?.favorite ?? false,
        firstUsedAt: entry?.firstUsedAt,
        lastUsedAt: entry?.lastUsedAt,
        used: entry?.lastUsedAt !== undefined,
        available: !issue,
        issue,
        ...describe(state, tokens),
      };
    })
    .sort(
      (a, b) =>
        Number(b.favorite) - Number(a.favorite) ||
        (b.lastUsedAt ?? -1) - (a.lastUsedAt ?? -1) ||
        a.title.localeCompare(b.title, 'it'),
    );
}
