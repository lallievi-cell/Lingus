import { useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  Building2,
  Check,
  ChevronDown,
  Flag,
  Globe2,
  Search,
  ScrollText,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import { BUILDING_ORDER, BUILDING_SPECS, RESOURCE_SPECS, WORDS } from '../game/content';
import { getIntelligibility, playerPopulation, removeLaw, removeTradition } from '../game/imperial';
import { hasWord } from '../game/runtime';
import { isVisibleAt } from './mapDrawing';
import { Glyph } from './Glyph';
import { buildingPurpose } from '../game/phrasebook';
import { describeStockQuantity, getInventoryEntries } from './campInventory';
import { formatVisibleNumber, describePeople, describeResourceAmount } from './semanticReadability';
import type { BuildingKind, City, GameState, Resource, Target } from '../game/types';
import './CivilizationPanel.css';

export type CivilizationMode =
  | 'traditions'
  | 'laws'
  | 'world'
  | 'victory'
  | 'settlement'
  | 'recipes';

/** Bare quantity bands are retained for callers that supply their own context.
 * A sentence about people, health or an ingredient needs its semantic helper. */
export function describeQuantity(value: number, numbered: boolean) {
  return numbered
    ? `${Math.round(value * 10) / 10}`
    : value <= 0
      ? 'Nulla'
      : value < 5
        ? 'Poco'
        : value < 20
          ? 'Quanto basta'
          : value < 100
            ? 'Molto'
            : 'Abbondante';
}

const buildingGroups = {
  all: { label: 'Tutte', kinds: BUILDING_ORDER },
  shelter: { label: 'Ripari', kinds: ['campfire', 'hut', 'house', 'grave'] },
  resources: {
    label: 'Risorse',
    kinds: ['storage', 'depot', 'farm', 'pen', 'foundry', 'workshop', 'market'],
  },
  knowledge: { label: 'Sapere', kinds: ['menhir', 'stele', 'temple', 'archive', 'school'] },
  power: { label: 'Difese e governo', kinds: ['palisade', 'walls', 'palace', 'court'] },
} satisfies Record<string, { label: string; kinds: readonly BuildingKind[] }>;
type BuildingGroup = keyof typeof buildingGroups;
const modePresentation: Record<CivilizationMode, { title: string; detail: string }> = {
  traditions: {
    title: 'Frasi che durano.',
    detail: 'Affida un lavoro alla comunità, stagione dopo stagione.',
  },
  laws: {
    title: 'Il codice delle leggi.',
    detail: 'Doveri, divieti e conseguenze per la tua civiltà.',
  },
  world: {
    title: 'Le molte voci del mondo.',
    detail: 'Conosci i popoli incontrati e prepara il prossimo incontro.',
  },
  victory: {
    title: 'Il destino della civiltà.',
    detail: 'Tre percorsi per lasciare una traccia nell’Età del Ferro.',
  },
  settlement: {
    title: 'La nostra comunità.',
    detail: 'Abitanti, scorte e lavori dell’insediamento.',
  },
  recipes: {
    title: 'La materia delle parole.',
    detail: 'Scegli una costruzione. La frase sarà pronta nella tua Voce.',
  },
};

export function CivilizationPanel({
  state: s,
  mode,
  target,
  onChange,
  onCompose,
  onClose,
}: {
  state: GameState;
  mode: CivilizationMode;
  target: Target | null;
  onChange: (s: GameState) => void;
  onCompose: (tokens: string[], target?: Target) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const [buildingGroup, setBuildingGroup] = useState<BuildingGroup>('all');
  const numbered = hasWord(s, 'O_08');
  const own = s.cities.filter((city) => city.factionId === 'player');
  const selected =
    target?.type === 'city'
      ? s.cities.find((city) => city.id === target.id)
      : own.find((city) => city.capital);
  const known = (tokens: string[]) => tokens.every((id) => hasWord(s, id));
  const prepare = (tokens: string[], destination?: Target) => {
    onCompose(tokens, destination);
    onClose();
  };
  const cityTarget = (city: City): Target => ({ type: 'city', id: city.id, x: city.x, y: city.y });
  const sentence = (tokens: string[]) =>
    tokens.map((id, index) => (
      <span key={`${id}-${index}`}>
        <Glyph id={id} size={14} />
        {WORDS[id]?.label}
      </span>
    ));
  const inventory = (resources: GameState['resources']) => (
    <div className="inventory-grid">
      {getInventoryEntries(s, resources).map(({ resource, label, amount }) => (
        <div key={resource}>
          <Glyph id={RESOURCE_SPECS[resource].wordId ?? 'V_02'} size={19} />
          <span>{label}</span>
          <b>{describeStockQuantity(amount, numbered)}</b>
        </div>
      ))}
    </div>
  );
  const prompts = (items: { label: string; tokens: string[] }[], destination?: Target) => {
    const available = items.filter((item) => known(item.tokens));
    return (
      available.length > 0 && (
        <section className="civ-section civ-preparations" aria-label="Frasi da preparare">
          <div className="civ-section-heading">
            <h3>Prepara una frase</h3>
            <small>Pronunciarla resta una tua scelta</small>
          </div>
          <div className="recipe-prompts">
            {available.map(({ label, tokens }) => (
              <button key={tokens.join('|')} onClick={() => prepare(tokens, destination)}>
                <span className="civ-prompt-label">
                  {label}
                  <small>{tokens.map((id) => WORDS[id]?.label).join(' · ')}</small>
                </span>
                <ArrowRight size={18} aria-hidden="true" />
              </button>
            ))}
          </div>
        </section>
      )
    );
  };
  const knownBuildings = BUILDING_ORDER.filter((kind) =>
    known(['S_01', ...BUILDING_SPECS[kind].recipe]),
  );
  const matchingBuildings = knownBuildings.filter(
    (kind) =>
      (buildingGroups[buildingGroup].kinds as readonly BuildingKind[]).includes(kind) &&
      `${BUILDING_SPECS[kind].label} ${buildingPurpose(kind)}`
        .toLocaleLowerCase('it')
        .includes(search.trim().toLocaleLowerCase('it')),
  );
  const visibleFactions = s.factions.filter((faction) => {
    const city = s.cities.find((entry) => entry.id === faction.cityId);
    return city && isVisibleAt(s, city.x, city.y);
  });
  const totalCities = s.cities.filter((city) => city.factionId !== 'ruins').length;
  const controlledCities = s.cities.filter(
    (city) =>
      city.factionId === 'player' ||
      s.factions.some((faction) => faction.id === city.factionId && faction.subjugated),
  ).length;
  const fullWords = Object.values(s.words).filter((memory) => memory.retention >= 100).length;
  const title = mode === 'settlement' && selected ? selected.name : modePresentation[mode].title;

  return (
    <div className={`civilization-panel civ-view-${mode}`}>
      <header className="civ-heading">
        <h2>{title}</h2>
        <p>{modePresentation[mode].detail}</p>
      </header>
      {mode === 'traditions' && (
        <>
          <div className="institution-count">
            <BookOpen size={18} aria-hidden="true" />
            <strong>
              {s.traditions.length}/{s.tier === 5 ? 8 : s.tier === 4 ? 5 : s.tier === 3 ? 3 : 0}{' '}
              tradizioni
            </strong>
            <span>Incarichi permanenti</span>
          </div>
          <div className="institution-list">
            {s.traditions.map((tradition) => (
              <article key={tradition.id}>
                <div>
                  <h3>{tradition.name || 'Incarico della comunità'}</h3>
                  <div className="token-sentence">{sentence(tradition.tokens)}</div>
                </div>
                <button
                  className="icon-button civ-remove"
                  aria-label={`Rimuovi tradizione ${tradition.name}`}
                  onClick={() => onChange(removeTradition(s, tradition.id))}
                >
                  <X size={18} />
                </button>
              </article>
            ))}
            {s.traditions.length === 0 && (
              <div className="civ-empty">
                <BookOpen size={25} aria-hidden="true" />
                <div>
                  <strong>Nessun incarico permanente</strong>
                  <p>
                    Quando conosci Sempre o Notte, puoi affidare alla tribù un lavoro da ripetere.
                  </p>
                </div>
              </div>
            )}
          </div>
          {prompts([
            { label: 'Caccia con riserva', tokens: ['C_02', 'S_03', 'V_03', 'O_04', 'M_02'] },
            { label: 'Custodire la Scrittura', tokens: ['C_02', 'S_04', 'V_05', 'O_09'] },
            { label: 'Veglia al campo', tokens: ['C_01', 'S_03', 'V_05', 'O_01'] },
          ])}
          {own.length > 0 && (
            <section className="civ-section">
              <div className="civ-section-heading">
                <h3>Vocazioni delle città</h3>
                <small>Due per insediamento</small>
              </div>
              {own.map((city) => (
                <div className="city-vocations" key={city.id}>
                  <h3>
                    {city.name}
                    <small>{city.vocations.length}/2 vocazioni</small>
                  </h3>
                  {city.vocations.length === 0 && <p>Questa città non ha ancora una vocazione.</p>}
                  {city.vocations.map((tradition) => (
                    <article key={tradition.id}>
                      <span>{tradition.name}</span>
                      <button
                        className="text-button"
                        onClick={() => onChange(removeTradition(s, tradition.id))}
                      >
                        Rimuovi
                      </button>
                    </article>
                  ))}
                </div>
              ))}
            </section>
          )}
          <details className="civ-help">
            <summary>
              <BookOpen size={18} />
              Come funzionano le tradizioni
              <ChevronDown size={17} />
            </summary>
            <p>
              Con Sempre, una frase diventa un incarico che si ripete quando turno, bisogni e regole
              lo consentono. Con Notte viene eseguito nelle ore buie. Ogni città può avere due
              vocazioni.
            </p>
          </details>
        </>
      )}
      {mode === 'laws' && (
        <>
          <div className="institution-count">
            <ScrollText size={18} aria-hidden="true" />
            <strong>
              {s.laws.length}/{s.tier >= 5 ? 6 : s.tier >= 4 ? 3 : 0} leggi
            </strong>
            <span>
              {s.government === 'republic'
                ? 'Repubblica'
                : s.government === 'monarchy'
                  ? 'Monarchia'
                  : 'Tribù'}
            </span>
          </div>
          <div className="institution-list">
            {s.laws.map((law) => (
              <article key={law.id}>
                <div>
                  <h3>{law.name}</h3>
                  <small>
                    {law.prohibitive ? 'Divieto' : 'Dovere e incentivo'}
                    {numbered && ` · ${law.age} stagioni`}
                  </small>
                  <div className="token-sentence">{sentence(law.tokens)}</div>
                  {law.description && <p>{law.description}</p>}
                </div>
                <button
                  className="text-button text-danger civ-remove"
                  onClick={() => onChange(removeLaw(s, law.id))}
                >
                  Abroga
                </button>
              </article>
            ))}
            {s.laws.length === 0 && (
              <div className="civ-empty">
                <ScrollText size={25} aria-hidden="true" />
                <div>
                  <strong>Il codice è ancora vuoto</strong>
                  <p>
                    Una legge stabilisce un dovere o un divieto e la conseguenza per chi lo
                    infrange.
                  </p>
                </div>
              </div>
            )}
          </div>
          {prompts([
            {
              label: 'Stabilire il tributo',
              tokens: ['S_09', 'V_04', 'O_11', 'O_07', 'C_03', 'S_06'],
            },
            {
              label: 'Vietare la violenza interna',
              tokens: ['S_02', 'V_03', 'S_01', 'M_01', 'C_03', 'O_06'],
            },
            {
              label: 'Liberare attraverso il lavoro',
              tokens: ['S_06', 'V_08', 'O_02', 'C_02', 'C_03', 'M_05'],
            },
          ])}
          <details className="civ-help">
            <summary>
              <ScrollText size={18} />
              Comporre una legge
              <ChevronDown size={17} />
            </summary>
            <p>
              La frase occupa sei spazi: soggetto, azione, oggetto, misura o condizione, Altrimenti
              e conseguenza. Pericolo nel quarto spazio vieta l’azione; negli altri casi stabilisci
              un dovere da rispettare ogni stagione.
            </p>
            <p>
              La Pietra Sacra ha priorità sul codice dello Stato. Punire ciò che un dogma santifica
              alimenta lo scisma; difenderlo rafforza il potere religioso.
            </p>
          </details>
        </>
      )}
      {mode === 'world' && (
        <>
          <div className="faction-list">
            {visibleFactions.map((faction) => {
              const city = s.cities.find((entry) => entry.id === faction.cityId)!;
              const understanding = getIntelligibility(s, faction.words);
              return (
                <article key={faction.id} className={faction.hostile ? 'civ-faction-hostile' : ''}>
                  <div className="faction-symbol">
                    <Globe2 size={24} aria-hidden="true" />
                  </div>
                  <div className="civ-faction-copy">
                    <div className="civ-faction-heading">
                      <h3>{faction.name}</h3>
                      <span className={`civ-status ${faction.hostile ? 'civ-status-warning' : ''}`}>
                        {faction.hostile ? 'Ostile' : faction.subjugated ? 'Annessa' : 'In pace'}
                      </span>
                    </div>
                    <span className="civ-understanding">
                      Comprensione{' '}
                      {numbered
                        ? `${formatVisibleNumber(understanding)}%`
                        : understanding < 30
                          ? 'assente'
                          : understanding < 80
                            ? 'parziale'
                            : 'condivisa'}
                    </span>
                    <div className="meter">
                      <span style={{ width: `${Math.max(0, Math.min(100, understanding))}%` }} />
                    </div>
                    <p className="faction-speech">
                      {understanding < 30
                        ? '◇ ϟ ⋔ ⊙ ⋈ ⌁'
                        : understanding < 80
                          ? '«Il nostro luogo, i vostri doni. Insieme.»'
                          : '«Comprendiamo la vostra lingua.»'}
                    </p>
                    <button
                      className="text-button civ-inline-action"
                      onClick={() => {
                        onCompose([], cityTarget(city));
                        onClose();
                      }}
                    >
                      Indica sulla mappa
                      <ArrowRight size={16} />
                    </button>
                  </div>
                </article>
              );
            })}
            {visibleFactions.length === 0 && (
              <div className="civ-empty">
                <Globe2 size={26} aria-hidden="true" />
                <div>
                  <strong>Altre voci oltre l’orizzonte</strong>
                  <p>
                    Esplora la valle per incontrare altri popoli. Qui ritroverai le comunità che hai
                    scoperto.
                  </p>
                </div>
              </div>
            )}
          </div>
          {prompts(
            [
              { label: 'Preparare uno scambio', tokens: ['S_01', 'V_11', 'O_03', 'S_05'] },
              { label: 'Inviare maestri di Scrittura', tokens: ['S_04', 'V_04', 'O_09', 'S_09'] },
              { label: 'Muovere una conquista', tokens: ['S_08', 'V_13', 'S_09', 'S_05'] },
            ],
            target ?? undefined,
          )}
          <details className="civ-help">
            <summary>
              <Globe2 size={18} />
              Lingua e incontri
              <ChevronDown size={17} />
            </summary>
            <p>
              Le parole condivise aiutano i popoli a comprendersi. Scambi e incontri avvicinano le
              lingue; una conquista conserva invece la lingua e i dogmi della città annessa.
            </p>
          </details>
        </>
      )}
      {mode === 'settlement' && (
        <>
          {selected ? (
            <>
              <div className="city-cohorts">
                {(['workers', 'warriors', 'sages', 'slaves'] as const).map((cohort, index) => (
                  <div key={cohort}>
                    <Glyph id={['S_01', 'S_03', 'S_04', 'S_06'][index]} size={24} />
                    <strong>{describePeople(selected.cohorts[cohort], numbered, cohort)}</strong>
                  </div>
                ))}
              </div>
              {prompts(
                [
                  { label: 'Coltivare per la città', tokens: ['C_02', 'S_09', 'V_09', 'O_04'] },
                  { label: 'Lavorare i metalli', tokens: ['C_02', 'S_09', 'V_12', 'O_07'] },
                  { label: 'Organizzare il commercio', tokens: ['C_02', 'S_09', 'V_11', 'O_12'] },
                  { label: 'Custodire la Scrittura', tokens: ['C_02', 'S_09', 'V_05', 'O_09'] },
                  { label: 'Costruire nuovi alloggi', tokens: ['S_09', 'V_08', 'O_02', 'O_01'] },
                  { label: 'Armare i battaglioni', tokens: ['S_09', 'V_12', 'O_07', 'S_08'] },
                ],
                cityTarget(selected),
              )}
              <section className="civ-section">
                <div className="civ-section-heading">
                  <h3>Scorte dell’insediamento</h3>
                  <small>Risorse già consegnate</small>
                </div>
                {inventory(selected.capital ? s.resources : selected.resources)}
              </section>
              <details className="civ-disclosure">
                <summary>
                  <Building2 size={18} />
                  <span>Edifici e manutenzione</span>
                  <ChevronDown size={17} />
                </summary>
                <div className="settlement-buildings">
                  {s.buildings
                    .filter((building) => building.cityId === selected.id && building.hp > 0)
                    .map((building) => (
                      <div
                        key={building.id}
                        className={!building.active ? 'civ-building-warning' : ''}
                      >
                        <Building2 size={17} />
                        <span>{BUILDING_SPECS[building.kind].label}</span>
                        <small>
                          {building.completed === false
                            ? 'In costruzione'
                            : building.active
                              ? numbered
                                ? `${Math.round((building.lastEfficiency ?? 1) * 100)}% efficienza`
                                : 'Attivo'
                              : 'Manutenzione da rifornire'}
                        </small>
                      </div>
                    ))}
                </div>
              </details>
              <section className="city-vocations">
                <h3>
                  Vocazioni scolpite<small>{selected.vocations.length}/2</small>
                </h3>
                {selected.vocations.length === 0 && (
                  <p>
                    Nessuna vocazione: prepara una frase con Sempre per specializzare questa città.
                  </p>
                )}
                {selected.vocations.map((vocation) => (
                  <div className="token-sentence" key={vocation.id}>
                    {sentence(vocation.tokens)}
                  </div>
                ))}
              </section>
            </>
          ) : (
            <>
              <div className="civ-empty">
                <Users size={25} aria-hidden="true" />
                <div>
                  <strong>Un villaggio che può diventare città</strong>
                  <p>
                    Con centocinquanta abitanti e la parola Città potrai governare insediamenti e
                    gruppi sociali.
                  </p>
                </div>
              </div>
              <section className="civ-section">
                <div className="civ-section-heading">
                  <h3>Le scorte del campo</h3>
                  <small>Risorse già consegnate</small>
                </div>
                {inventory(s.resources)}
              </section>
            </>
          )}
        </>
      )}
      {mode === 'victory' && (
        <>
          {s.tier < 5 && (
            <p className="civ-stage-note">
              Questi percorsi si compiono nell’Età del Ferro. Le scelte di oggi preparano il futuro.
            </p>
          )}
          <div className="victory-paths">
            <article>
              <span className="civ-path-icon">
                <Flag size={24} aria-hidden="true" />
              </span>
              <div>
                <div className="civ-path-heading">
                  <h3>Pax Universalis</h3>
                  {s.victory === 'imperial' && (
                    <span className="civ-status">
                      <Check size={16} />
                      Compiuta
                    </span>
                  )}
                </div>
                <p>Unire le città e mantenere la pace interna.</p>
                <div className="meter">
                  <span
                    style={{
                      width: `${Math.min(100, (s.victoryProgress.imperialSeasons / 16) * 100)}%`,
                    }}
                  />
                </div>
                <strong className="civ-progress-label">
                  {s.victoryProgress.imperialSeasons}/16 stagioni consecutive
                </strong>
                <small>
                  {controlledCities}/{totalCities} città controllate · {s.laws.length}/5 leggi
                </small>
                <details className="civ-requirements">
                  <summary>
                    Condizioni del percorso
                    <ChevronDown size={15} />
                  </summary>
                  <p>
                    Controlla tutte le città, direttamente o tramite popoli sottomessi. Servono un
                    Palazzo attivo e almeno cinque leggi. Mantieni la tensione di rivolta sotto
                    trenta, nell’impero e in ogni tua città, per sedici stagioni consecutive.
                  </p>
                </details>
              </div>
            </article>
            <article>
              <span className="civ-path-icon">
                <BookOpen size={24} aria-hidden="true" />
              </span>
              <div>
                <div className="civ-path-heading">
                  <h3>Biblioteca Universale</h3>
                  {s.victory === 'cultural' && (
                    <span className="civ-status">
                      <Check size={16} />
                      Compiuta
                    </span>
                  )}
                </div>
                <p>Custodire ogni parola e comprendersi tra popoli.</p>
                <div className="meter">
                  <span style={{ width: `${Math.min(100, (fullWords / 45) * 100)}%` }} />
                </div>
                <strong className="civ-progress-label">
                  {fullWords}/45 parole a memoria piena
                </strong>
                <details className="civ-requirements">
                  <summary>
                    Condizioni del percorso
                    <ChevronDown size={15} />
                  </summary>
                  <p>
                    Conserva tutte le quarantacinque parole a memoria piena. L’Archivio del campo o
                    della capitale deve essere attivo e lavorare a piena efficienza. Raggiungi
                    almeno l’ottanta per cento di comprensione reciproca con ogni popolo.
                  </p>
                </details>
              </div>
            </article>
            <article>
              <span className="civ-path-icon">
                <Sparkles size={24} aria-hidden="true" />
              </span>
              <div>
                <div className="civ-path-heading">
                  <h3>Il Grande Risveglio</h3>
                  {s.victory === 'philosophical' && (
                    <span className="civ-status">
                      <Check size={16} />
                      Compiuta
                    </span>
                  )}
                </div>
                <p>Superare i dogmi e scegliere una comunità libera.</p>
                <div className="civ-path-milestones">
                  <span className={s.philosophy ? 'is-met' : ''}>
                    {s.philosophy ? <Check size={14} /> : <Sparkles size={14} />}
                    {s.philosophy ? 'Filosofia praticata' : 'Filosofia da scoprire'}
                  </span>
                  <span className={s.emancipated ? 'is-met' : ''}>
                    {s.emancipated ? <Check size={14} /> : <Users size={14} />}
                    {s.emancipated ? 'Schiavitù abolita' : 'Libertà da conquistare'}
                  </span>
                  <span>
                    {s.dogmas.length === 0
                      ? 'Nessun dogma attivo'
                      : `${s.dogmas.length} dogmi attivi`}
                  </span>
                </div>
                <details className="civ-requirements">
                  <summary>
                    Condizioni del percorso
                    <ChevronDown size={15} />
                  </summary>
                  <p>
                    Riforma tutti i dogmi attraverso la filosofia, fino a non averne più di attivi.
                    Abolisci la schiavitù e libera ogni persona e gruppo sociale ancora in
                    schiavitù. Mantieni almeno novanta punti Coesione.
                  </p>
                </details>
              </div>
            </article>
          </div>
          <div className="institution-count">
            <Users size={18} aria-hidden="true" />
            <strong>{describePeople(playerPopulation(s), numbered, 'population')}</strong>
            <span>Capitolo {s.tier + 1}/6</span>
          </div>
        </>
      )}
      {mode === 'recipes' && (
        <>
          <div className="civ-catalog-controls">
            <label className="civ-search">
              <Search size={19} aria-hidden="true" />
              <input
                aria-label="Cerca una costruzione"
                placeholder="Cerca una costruzione…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <div className="civ-category-tabs" role="group" aria-label="Tipi di costruzione">
              {(Object.keys(buildingGroups) as BuildingGroup[]).map((group) => (
                <button
                  key={group}
                  aria-pressed={buildingGroup === group}
                  onClick={() => setBuildingGroup(group)}
                >
                  {buildingGroups[group].label}
                </button>
              ))}
            </div>
          </div>
          {knownBuildings.length === 0 && (
            <div className="civ-empty">
              <Building2 size={26} aria-hidden="true" />
              <div>
                <strong>Il campo è ancora da costruire</strong>
                <p>Le esperienze e le nuove parole riveleranno come trasformare questo luogo.</p>
              </div>
            </div>
          )}
          {knownBuildings.length > 0 && matchingBuildings.length === 0 && (
            <p className="civ-empty-search">
              Nessuna costruzione corrisponde. Prova un’altra ricerca o scegli Tutte.
            </p>
          )}
          <div className="building-codex">
            {matchingBuildings.map((kind) => {
              const building = BUILDING_SPECS[kind];
              const tokens = ['S_01', ...building.recipe];
              return (
                <article key={kind}>
                  <div className="civ-building-top">
                    <div className="building-codex-name">
                      <span className="civ-building-symbol">
                        <Building2 size={21} aria-hidden="true" />
                      </span>
                      <h3>{building.label}</h3>
                    </div>
                    <button
                      className="civ-primary-action"
                      onClick={() => prepare(tokens)}
                      aria-label={`Prepara ${building.label}`}
                    >
                      Prepara
                      <ArrowRight size={16} />
                    </button>
                  </div>
                  <p>{buildingPurpose(kind)}</p>
                  <details className="civ-building-details">
                    <summary>
                      Materiali e gestione
                      <ChevronDown size={16} />
                    </summary>
                    <div className="civ-costs">
                      {Object.entries(building.cost).map(([resource, amount]) => (
                        <span key={resource}>
                          <Glyph
                            id={RESOURCE_SPECS[resource as Resource].wordId ?? 'O_02'}
                            size={16}
                          />
                          {describeResourceAmount(resource as Resource, amount, numbered)}
                        </span>
                      ))}
                    </div>
                    <p className="civ-worker-description">
                      {building.workers === 0
                        ? 'Funziona senza addetti.'
                        : describePeople(building.workers, numbered, 'workers') +
                          ' per il pieno rendimento.'}
                    </p>
                    {numbered && (
                      <p>
                        {kind === 'campfire' && s.playMode === 'guided'
                          ? 'Nucleo caldo entro sei metri, protezione esterna fino a quindici. Permette di tramandare le parole.'
                          : building.description}
                      </p>
                    )}
                    <div className="token-sentence">{sentence(tokens)}</div>
                  </details>
                </article>
              );
            })}
          </div>
          <p className="civ-stage-note">
            Preparare la frase non spende Voce né materiali. Scegli poi il bersaglio e controlla
            l’ordine prima di pronunciarlo.
          </p>
        </>
      )}
    </div>
  );
}
