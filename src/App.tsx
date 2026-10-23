import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  ChevronRight,
  CircleHelp,
  Clock3,
  Compass,
  Download,
  Flame,
  Heart,
  History,
  Home,
  Leaf,
  LockKeyhole,
  MapPin,
  MessageCircle,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Save,
  Settings2,
  Shield,
  Sparkles,
  Sun,
  TreePine,
  Undo2,
  Upload,
  Users,
  Volume2,
  VolumeX,
  Wind,
  X,
  Zap,
} from 'lucide-react';
import { WorldMap } from './components/WorldMap';
import { entityTargetPresentation } from './components/targetPresentation';
import { BrandMark, Glyph } from './components/Glyph';
import { Modal } from './components/Modal';
import {
  CivilizationPanel,
  describeQuantity,
  type CivilizationMode,
} from './components/CivilizationPanel';
import { playerPopulation } from './game/imperial';
import { hasBuilding, isPlayerBuilding } from './game/runtime';
import {
  canTransmitWord,
  CUSTODIAN_RISK_LABELS,
  getCustodianStatuses,
  type CustodianStatus,
} from './game/custodianStatus';
import {
  ACTION_NAMES,
  BUILDING_NAMES,
  ERA_NAMES,
  INNATE_WORDS,
  WORD_ORDER,
  WORDS,
} from './game/content';
import {
  cognitiveSlots,
  compileSentence,
  createGame,
  dismissCampfire,
  getDogmaVectors,
  getObjective,
  getSeason,
  hasWord,
  inscribeDogma,
  issueCommand,
  parseGame,
  previewDogma,
  removeDogma,
  solveSpark,
  teachWord,
  tick,
} from './game/engine';
import type { GameState, Spark, Target, WordKind } from './game/types';

const SAVE_KEY = 'lingus.save.v2';
type Panel =
  | 'welcome'
  | 'guide'
  | 'lexicon'
  | 'settings'
  | 'campfire'
  | 'dogma'
  | 'restart'
  | 'milestone'
  | 'spark'
  | CivilizationMode
  | null;
const KIND_NAMES: Record<WordKind, string> = {
  S: 'Soggetto',
  V: 'Azione',
  O: 'Materia',
  M: 'Concetto',
  C: 'Condizione',
};

function loadInitialGame(): GameState {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const parsed = parseGame(raw);
      if (parsed) return parsed;
    }
  } catch {
    /* A fresh game remains available when browser storage is unavailable. */
  }
  return createGame(6842);
}

function timeLabel(time: number) {
  return `${Math.floor(time / 60)
    .toString()
    .padStart(2, '0')}:${Math.floor(time % 60)
    .toString()
    .padStart(2, '0')}`;
}

function App() {
  const [game, setGame] = useState<GameState>(loadInitialGame);
  const [panel, setPanel] = useState<Panel>(() => (game.started ? null : 'welcome'));
  const [sentence, setSentence] = useState<string[]>([]);
  const [executorId, setExecutorId] = useState<string | undefined>();
  const [groupAnchor, setGroupAnchor] = useState<Target>({ type: 'point', ...game.home });
  const [selectingGroup, setSelectingGroup] = useState(false);
  const [target, setTarget] = useState<Target | null>(null);
  const [tab, setTab] = useState<'tribe' | 'chronicle'>('tribe');
  const [filter, setFilter] = useState<WordKind | 'all'>('all');
  const [mobileSection, setMobileSection] = useState<'map' | 'tribe' | 'discovery'>('map');
  const [sparkId, setSparkId] = useState<string | null>(null);
  const [puzzle, setPuzzle] = useState<string[]>([]);
  const [puzzleFeedback, setPuzzleFeedback] = useState<{
    chosen: string[];
    correct: boolean[];
  } | null>(null);
  const [dogmaTarget, setDogmaTarget] = useState('C_01');
  const [dogmaVector, setDogmaVector] = useState('M_01');
  const [toast, setToast] = useState('');
  const [sound, setSound] = useState(false);
  const [lexiconSearch, setLexiconSearch] = useState('');
  const [hasSeenMilestone, setHasSeenMilestone] = useState(!!game.victory);
  const [recentPhrases, setRecentPhrases] = useState<string[][]>(() => [
    ['S_01', 'V_02'],
    ['S_01', 'V_04', 'O_03'],
  ]);
  const [orderFeedback, setOrderFeedback] = useState<{
    from: { x: number; y: number }[];
    to: { x: number; y: number };
    time: number;
  } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const audioContext = useRef<AudioContext | null>(null);
  const gameRef = useRef(game);
  gameRef.current = game;
  const season = getSeason(game);
  const slots = cognitiveSlots(game);
  const numbered = hasWord(game, 'O_08');
  const individuality = hasWord(game, 'S_02');
  const quantity = (value: number) => describeQuantity(value, numbered);
  const voiceMax = hasWord(game, 'S_07') ? 5 : 3;
  const known = WORD_ORDER.filter((id) => hasWord(game, id));
  const objective = getObjective(game);
  const compilation = compileSentence(game, sentence, target ?? undefined);
  const ownedBuildings = game.buildings.filter((b) => isPlayerBuilding(game, b));
  const currentSpark = game.sparks.find((s) => s.id === sparkId);
  const nextSpark = game.sparks[0];
  const suggestedWordIds = useMemo(() => {
    const set = new Set<string>();
    if (!target) return set;
    if (target.type === 'entity') {
      const ent = game.entities.find((e) => e.id === target.id);
      if (!ent) return set;
      if (ent.kind === 'tree') {
        set.add('O_03');
        set.add('V_04');
        set.add('V_03');
      } else if (ent.kind === 'berries') {
        set.add('V_02');
        set.add('V_04');
      } else if (ent.kind === 'stone') {
        set.add('O_02');
        set.add('V_04');
      } else if (['deer', 'wolf', 'alpha', 'mammoth'].includes(ent.kind)) {
        set.add('V_03');
        set.add('O_04');
        set.add('M_01');
      } else if (ent.kind === 'corpse' || ent.resource === 'meat') {
        set.add('V_02');
        set.add('V_04');
        set.add('O_06');
      }
    } else if (target.type === 'point') {
      if (game.home && Math.hypot(target.x - game.home.x, target.y - game.home.y) <= 10) {
        set.add('O_01');
        set.add('V_01');
        set.add('V_05');
      } else {
        set.add('V_01');
      }
    } else if (target.type === 'building') {
      const b = game.buildings.find((item) => item.id === target.id);
      if (b?.kind === 'campfire') {
        set.add('O_05');
        set.add('V_04');
        set.add('O_03');
      }
    }
    return set;
  }, [target, game.entities, game.buildings, game.home]);
  const selectedUnit = target?.type === 'unit' ? game.units.find((u) => u.id === target.id) : null;
  const selectedEntity =
    target?.type === 'entity' ? game.entities.find((e) => e.id === target.id) : null;
  const selectedBuilding =
    target?.type === 'building' ? game.buildings.find((b) => b.id === target.id) : null;
  const targetName = selectedUnit
    ? hasWord(game, 'S_02')
      ? selectedUnit.name
      : 'Un compagno'
    : selectedEntity
      ? (entityTargetPresentation(game, selectedEntity)?.label ?? 'Risorsa')
      : selectedBuilding
        ? BUILDING_NAMES[selectedBuilding.kind]
        : target?.type === 'city'
          ? game.cities.find((c) => c.id === target.id)?.name
          : target
            ? 'Punto sulla mappa'
            : null;
  const livingUnits = game.units.filter(
    (u) => u.hp > 0 && (u.factionId === undefined || u.factionId === 'player'),
  );
  const custodianStatuses = getCustodianStatuses(game);
  const custodianByUnit = new Map(custodianStatuses.map((status) => [status.unitId, status]));
  const custodianByWord = new Map(
    custodianStatuses.flatMap((status) => status.wordIds.map((id) => [id, status] as const)),
  );
  const endangeredCustodian = !game.urbanized
    ? custodianStatuses.find((status) => status.risk !== 'safe')
    : undefined;
  const selectedCustodian = selectedUnit ? custodianByUnit.get(selectedUnit.id) : undefined;
  const transmissionHint = (status: CustodianStatus) => {
    if (!hasWord(game, 'O_05')) return 'Proteggi questa memoria finché potrai tramandarla.';
    if (!hasBuilding(game, 'campfire')) return 'Serve un falò acceso e attivo per tramandare.';
    if (game.attention < 10) return 'La tribù deve ritrovare attenzione attorno al falò.';
    if (!status.wordIds.some((id) => canTransmitWord(game, id)))
      return 'Nessun compagno è pronto ad apprendere queste parole.';
    return 'Un nuovo custode può tenere viva questa memoria.';
  };
  const peopleCount = playerPopulation(game);
  const avgHunger = livingUnits.length
    ? livingUnits.reduce((n, u) => n + u.hunger, 0) / livingUnits.length
    : 0;
  const sacredTargets = known.filter((id) => getDogmaVectors(id).some((v) => hasWord(game, v)));
  const activeDogmaTarget = sacredTargets.includes(dogmaTarget)
    ? dogmaTarget
    : (sacredTargets[0] ?? '');
  const sacredVectors = getDogmaVectors(activeDogmaTarget).filter((id) => hasWord(game, id));
  const activeDogmaVector = sacredVectors.includes(dogmaVector)
    ? dogmaVector
    : (sacredVectors[0] ?? '');
  const dogmaPreview = previewDogma(activeDogmaTarget, activeDogmaVector);

  const notify = useCallback((message: string) => setToast(message), []);
  const closePanel = useCallback(() => {
    setPanel(null);
    setPuzzle([]);
  }, []);

  useEffect(() => {
    if (panel !== 'spark' || !puzzleFeedback) return;
    const timeout = window.setTimeout(closePanel, 2400);
    return () => window.clearTimeout(timeout);
  }, [panel, puzzleFeedback, closePanel]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 4500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (panel) return;
    let previous = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      const elapsed = Math.min(2, (now - previous) / 1000);
      previous = now;
      setGame((current) => tick(current, elapsed));
    }, 250);
    return () => window.clearInterval(timer);
  }, [panel]);

  useEffect(() => {
    const persist = () => {
      if (!gameRef.current.started) return;
      try {
        localStorage.setItem(SAVE_KEY, JSON.stringify(gameRef.current));
      } catch {
        /* Manual export remains available. */
      }
    };
    const timer = window.setInterval(persist, 5000);
    window.addEventListener('beforeunload', persist);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('beforeunload', persist);
    };
  }, []);

  useEffect(() => {
    if (game.gameOver && panel && panel !== 'restart' && panel !== 'settings') {
      setPanel(null);
      return;
    }
    if (game.campfirePending && !panel && !game.gameOver) setPanel('campfire');
    if (game.victory && !hasSeenMilestone && !panel) {
      setHasSeenMilestone(true);
      setPanel('milestone');
    }
  }, [game.campfirePending, game.victory, game.gameOver, hasSeenMilestone, panel]);

  useEffect(() => {
    const keydown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).matches('input,textarea,select') || panel) return;
      if (e.code === 'Enter' || e.code === 'NumpadEnter') {
        if (sentence.length >= 2 && !game.paused && !panel && !game.gameOver) {
          e.preventDefault();
          pronounce();
        }
      }
      if (e.code === 'Backspace' || e.code === 'Delete') {
        if (sentence.length > 0) {
          e.preventDefault();
          setSentence((s) => s.slice(0, -1));
        }
      }
      if (e.code === 'Space') {
        e.preventDefault();
        setGame((g) => ({ ...g, paused: !g.paused }));
      }
      if (e.code === 'Escape') {
        setSentence([]);
        setTarget(null);
      }
      if (['Digit1', 'Digit2', 'Digit3'].includes(e.code)) {
        const speed = [1, 2, 4][Number(e.code.slice(-1)) - 1] as 1 | 2 | 4;
        setGame((g) => ({ ...g, speed }));
      }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [panel, sentence, game, target, executorId, groupAnchor]);

  useEffect(() => {
    if (!sound || !game.started || game.paused || panel || game.gameOver) {
      void audioContext.current?.suspend();
      return;
    }
    const context = audioContext.current;
    if (!context) return;
    void context.resume();
    const chirp = () => {
      const now = context.currentTime;
      const oscillator = context.createOscillator(),
        gain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(season.isNight ? 660 : 1450, now);
      oscillator.frequency.exponentialRampToValueAtTime(season.isNight ? 440 : 2350, now + 0.12);
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.018, now + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(now + 0.4);
      oscillator.onended = () => {
        oscillator.disconnect();
        gain.disconnect();
      };
    };
    chirp();
    const timer = window.setInterval(chirp, season.isNight ? 4200 : 6300);
    return () => window.clearInterval(timer);
  }, [sound, game.started, game.paused, game.gameOver, panel, season.isNight]);

  function addWord(id: string) {
    if (sentence.length >= slots) {
      notify('Il pensiero ha bisogno di spazio. Rimuovi una parola o scoprine di nuove.');
      return;
    }
    setSentence((current) => [...current, id]);
  }

  function dropWord(e: DragEvent, at?: number) {
    e.preventDefault();
    const id = e.dataTransfer.getData('application/lingus-word');
    if (!hasWord(game, id)) return;
    if (at !== undefined && at < sentence.length)
      setSentence((s) => s.map((word, index) => (index === at ? id : word)));
    else addWord(id);
  }

  function handleSetGroupAnchor(anchor: Target) {
    setGroupAnchor(anchor);
    setSelectingGroup(false);
    notify('Gruppo centrato: raggio 15 m.');
  }

  function applyRecentPhrase(words: string[]) {
    const available = words.filter((id) => hasWord(game, id));
    if (available.length > 0) {
      setSentence(available);
      notify(`Frase richiamata: ${available.map((id) => WORDS[id]?.label).join(' · ')}`);
    }
  }

  function pronounce() {
    const result = compileSentence(game, sentence, target ?? undefined);
    if (!result.valid) {
      notify(result.message);
      return;
    }
    if (result.requiresTarget && !target) {
      notify('Scegli un bersaglio sulla mappa, poi pronuncia la frase.');
      return;
    }
    if (game.voice < 1) {
      notify('La voce ha bisogno di riposo. Si rigenera ogni 10 secondi.');
      return;
    }
    const next = issueCommand(game, sentence, target ?? undefined, executorId, groupAnchor);
    const success = next.stats.commands > game.stats.commands;
    setGame(next);
    if (success) {
      setRecentPhrases((prev) => {
        const key = sentence.join(',');
        const filtered = prev.filter((p) => p.join(',') !== key);
        return [[...sentence], ...filtered].slice(0, 4);
      });
      if (target) {
        const liveTarget =
          target.type === 'entity'
            ? (game.entities.find((e) => e.id === target.id) ?? target)
            : target;
        let sources: { x: number; y: number }[] = [];
        if (sentence.includes('S_01')) {
          sources = game.units
            .filter((u) => u.hp > 0 && Math.hypot(u.x - groupAnchor.x, u.y - groupAnchor.y) <= 15)
            .map((u) => ({ x: u.x, y: u.y }));
        } else if (executorId) {
          const u = game.units.find((unit) => unit.id === executorId);
          if (u) sources = [{ x: u.x, y: u.y }];
        }
        if (sources.length > 0) {
          const now = game.paused ? game.time : performance.now() / 1000;
          setOrderFeedback({ from: sources, to: { x: liveTarget.x, y: liveTarget.y }, time: now });
        }
      }
    }
    notify(
      success
        ? 'La tribù ha ascoltato.'
        : (next.logs[0]?.text ?? 'La frase non può essere eseguita.'),
    );
  }

  function openSpark(spark: Spark) {
    setSparkId(spark.id);
    setPuzzle([]);
    setPuzzleFeedback(null);
    setPanel('spark');
  }

  function attemptDiscovery() {
    if (!currentSpark) return;
    const result = solveSpark(game, currentSpark.id, puzzle);
    const success = hasWord(result, currentSpark.wordId);
    setGame(result);
    if (success) closePanel();
    else {
      const remaining = [...currentSpark.recipe];
      const correct = puzzle.map((id) => {
        const at = remaining.indexOf(id);
        if (at < 0) return false;
        remaining.splice(at, 1);
        return true;
      });
      setPuzzleFeedback({ chosen: [...puzzle], correct });
    }
    if (success)
      notify(
        `Una nuova parola: ${WORDS[currentSpark.wordId].label}. Il mondo è un po’ più grande.`,
      );
    else notify('L’intuizione si è affievolita. Osserva ancora e riprova dopo 15 secondi.');
  }

  function saveGame() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(game));
      notify('Partita salvata su questo browser.');
    } catch {
      notify('Il browser non consente il salvataggio. Usa Esporta partita.');
    }
  }

  function exportGame() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(game, null, 2)], { type: 'application/json' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `lingus-${timeLabel(game.time).replace(':', '-')}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify('Salvataggio esportato.');
  }

  async function importGame(file?: File) {
    if (!file) return;
    try {
      if (file.size > 5_000_000) throw new Error('too large');
      const parsed = parseGame(await file.text());
      if (!parsed) throw new Error('invalid');
      setGame({ ...parsed, paused: true });
      setSentence([]);
      setTarget(null);
      setPanel(null);
      setHasSeenMilestone(!!parsed.victory);
      setGroupAnchor({ type: 'point', ...parsed.home });
      setExecutorId(undefined);
      notify('Partita importata in pausa.');
    } catch {
      notify('File non valido: scegli un salvataggio JSON di Lingus.');
    }
    if (fileInput.current) fileInput.current.value = '';
  }

  function restart() {
    const fresh = { ...createGame(Math.floor(Math.random() * 1_000_000)), started: true };
    setGame(fresh);
    setSentence([]);
    setTarget(null);
    setHasSeenMilestone(false);
    setGroupAnchor({ type: 'point', ...fresh.home });
    setExecutorId(undefined);
    closePanel();
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(fresh));
    } catch {
      /* Export available. */
    }
  }

  const renderWord = (id: string, inPuzzle = false) => {
    const word = WORDS[id],
      memory = game.words[id];
    const suggested = !inPuzzle && suggestedWordIds.has(id);
    return (
      <button
        key={id}
        className={`word-tile word-${word.kind} ${memory && memory.retention < 25 ? 'word-fragile' : ''} ${suggested ? 'word-suggested' : ''}`}
        aria-label={`${word.label}: ${word.description}${suggested ? ' (consigliata per il bersaglio)' : ''}`}
        title={`${word.description}${suggested ? ' · Consigliata per il bersaglio attuale' : ''}`}
        draggable={!inPuzzle}
        onDragStart={(e) => e.dataTransfer.setData('application/lingus-word', id)}
        onClick={() =>
          inPuzzle
            ? setPuzzle((p) => (p.length < (currentSpark?.recipe.length ?? 3) ? [...p, id] : p))
            : addWord(id)
        }
      >
        <span className="word-glyph">
          <Glyph id={id} size={25} />
        </span>
        <span className="word-label">{word.label}</span>
        <span className="word-kind">{KIND_NAMES[word.kind]}</span>
        {memory && !INNATE_WORDS.includes(id) && (
          <span className="retention-line">
            <span style={{ width: `${memory.retention}%` }} />
          </span>
        )}
      </button>
    );
  };

  return (
    <div className={`app ${season.isNight && game.started ? 'night-mode' : ''}`}>
      <header className="topbar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setPanel('guide');
          }}
          aria-label="Lingus, apri la guida"
        >
          <BrandMark />
          <span>
            <strong>LINGUS</strong>
            <small>LE PAROLE COSTRUISCONO IL MONDO</small>
          </span>
        </a>
        <div className="era-heading">
          <span className="eyebrow">
            CAPITOLO {['I', 'II', 'III', 'IV', 'V', 'VI'][game.tier]} <i />{' '}
            {game.tier < 3 ? 'PALEOLITICO' : game.tier === 3 ? 'NEOLITICO' : 'ETÀ DEI METALLI'}
          </span>
          <span>{ERA_NAMES[game.tier]}</span>
        </div>
        <div className="header-actions">
          <button className="text-button guide-button" onClick={() => setPanel('guide')}>
            <CircleHelp size={16} />
            <span>Come si gioca</span>
          </button>
          <span className="header-divider" />
          <button
            className="icon-button"
            aria-label={sound ? 'Disattiva suoni' : 'Attiva suoni'}
            aria-pressed={sound}
            onClick={() => {
              if (!audioContext.current) {
                try {
                  audioContext.current = new AudioContext();
                } catch {
                  notify('Audio non disponibile su questo browser.');
                  return;
                }
              }
              setSound((s) => !s);
            }}
          >
            {sound ? <Volume2 size={19} /> : <VolumeX size={19} />}
          </button>
          <button
            className="icon-button"
            aria-label="Impostazioni e salvataggi"
            onClick={() => setPanel('settings')}
          >
            <Settings2 size={19} />
          </button>
        </div>
      </header>

      <div className="world-strip">
        <div className="world-location">
          <span className="live-dot" />
          <span>LA VALLE DELLE PRIME VOCI</span>
          <span className="strip-divider">/</span>
          <span>{game.tier === 0 ? 'Terra senza nome' : 'Il nostro accampamento'}</span>
        </div>
        <div className="world-resources">
          {hasWord(game, 'M_02') && (
            <>
              <span title="Scorte alimentari">
                <AppleIcon />
                {quantity(game.resources.food + game.resources.meat + game.resources.cooked)}
                <small>Cibo</small>
              </span>
              <span title="Legno disponibile">
                <TreePine size={15} />
                {quantity(game.resources.wood)}
                <small>Legno</small>
              </span>
              <span title="Pietra disponibile">
                <Glyph id="O_02" size={15} />
                {quantity(game.resources.stone)}
                <small>Pietra</small>
              </span>
            </>
          )}
          {hasWord(game, 'C_01') && (
            <span className="season-chip">
              {season.isNight ? <Glyph id="C_01" size={15} /> : <Sun size={15} />}
              {hasWord(game, 'M_02')
                ? `${season.name} · Anno ${season.year}`
                : season.isNight
                  ? 'È notte'
                  : 'È giorno'}
            </span>
          )}
          <span className="prototype-label">EDIZIONE DELLE SEI ERE · 0.2</span>
        </div>
      </div>

      <nav className="mobile-nav-bar" aria-label="Sezioni di gioco">
        <button
          type="button"
          className={`mobile-nav-btn ${mobileSection === 'map' ? 'active' : ''}`}
          onClick={() => setMobileSection('map')}
        >
          <Compass size={15} />
          <span>Mappa</span>
        </button>
        <button
          type="button"
          className={`mobile-nav-btn ${mobileSection === 'tribe' ? 'active' : ''}`}
          onClick={() => setMobileSection('tribe')}
        >
          <Users size={15} />
          <span>Tribù ({peopleCount})</span>
        </button>
        <button
          type="button"
          className={`mobile-nav-btn ${mobileSection === 'discovery' ? 'active' : ''}`}
          onClick={() => setMobileSection('discovery')}
        >
          <Sparkles size={15} />
          <span>Pensiero</span>
          {nextSpark && <span className="mobile-spark-dot" />}
        </button>
      </nav>

      <main className="game-layout">
        <aside className={`tribe-panel ${mobileSection === 'tribe' ? 'mobile-visible' : ''}`}>
          <div className="side-tabs" role="tablist" aria-label="Pannello della tribù">
            <button
              role="tab"
              aria-selected={tab === 'tribe'}
              className={tab === 'tribe' ? 'active' : ''}
              onClick={() => setTab('tribe')}
            >
              La tribù <span>{peopleCount}</span>
            </button>
            <button
              role="tab"
              aria-selected={tab === 'chronicle'}
              className={tab === 'chronicle' ? 'active' : ''}
              onClick={() => setTab('chronicle')}
            >
              Cronaca
            </button>
          </div>
          {tab === 'tribe' ? (
            <>
              <div className="tribe-heading">
                <span className="eyebrow">UNA STORIA ANCORA DA DIRE</span>
                <h2>
                  Le prime voci<span>.</span>
                </h2>
                <p>
                  {livingUnits.length === 7 ? 'Sette vite.' : `${peopleCount} vite.`} Un destino
                  comune.
                </p>
              </div>
              <div className="tribe-summary">
                <span>
                  <Users size={17} />
                  <b>{peopleCount}</b> anime
                </span>
                <span className={avgHunger > 70 ? 'text-danger' : ''}>
                  <span className={`status-dot ${avgHunger > 70 ? 'amber' : ''}`} />
                  {avgHunger > 75 ? 'Affamata' : avgHunger > 45 ? 'In cerca di cibo' : 'Al sicuro'}
                </span>
              </div>
              {hasWord(game, 'O_06') && (
                <div className="cohesion-block">
                  <div>
                    <span>Coesione</span>
                    <strong>
                      {numbered
                        ? `${Math.round(game.cohesion)}%`
                        : game.cohesion > 70
                          ? 'Salda'
                          : game.cohesion > 30
                            ? 'Fragile'
                            : 'In crisi'}
                    </strong>
                  </div>
                  <div className="meter">
                    <span style={{ width: `${game.cohesion}%` }} />
                  </div>
                </div>
              )}
              {game.urbanized && (
                <button className="urban-summary-card" onClick={() => setPanel('settlement')}>
                  <Glyph id="S_09" size={30} />
                  <strong>
                    {game.cities.filter((c) => c.factionId === 'player').length} città
                  </strong>
                  <span>{quantity(peopleCount)} abitanti in quattro coorti</span>
                  <span>
                    Osserva la capitale <ChevronRight size={13} />
                  </span>
                </button>
              )}
              {endangeredCustodian && (
                <div
                  className={`custodian-notice ${endangeredCustodian.risk}`}
                  aria-label="Ultimi custodi a rischio"
                >
                  <div className="custodian-notice-heading">
                    <MessageCircle size={16} />
                    <strong>Una memoria da proteggere</strong>
                  </div>
                  <p>
                    {endangeredCustodian.displayName} è l’ultima voce di{' '}
                    {endangeredCustodian.wordIds
                      .slice(0, 3)
                      .map((id) => `«${WORDS[id].label}»`)
                      .join(', ')}
                    {endangeredCustodian.wordIds.length > 3 ? ' e di altre parole' : ''}.
                  </p>
                  <span className="custodian-reasons">
                    {endangeredCustodian.reasons
                      .map((reason) => CUSTODIAN_RISK_LABELS[reason])
                      .join(' · ')}
                  </span>
                  <p className="custodian-help">
                    {hasWord(game, 'O_06')
                      ? 'Se il custode muore, queste parole scompaiono. '
                      : 'Queste parole vivono in una sola memoria. '}
                    {transmissionHint(endangeredCustodian)}
                  </p>
                  {hasWord(game, 'O_05') && (
                    <button
                      className="custodian-transmit"
                      disabled={
                        !endangeredCustodian.wordIds.some((id) => canTransmitWord(game, id))
                      }
                      onClick={() => setPanel('campfire')}
                    >
                      <Flame size={13} /> Tramanda al falò <ChevronRight size={12} />
                    </button>
                  )}
                </div>
              )}
              <div className="unit-list" aria-label="Membri della tribù">
                {!game.urbanized &&
                  livingUnits.map((unit, index) => {
                    const spark = game.sparks.find((s) => s.unitId === unit.id);
                    return (
                      <button
                        className={`unit-card ${target?.id === unit.id ? 'selected' : ''}`}
                        key={unit.id}
                        onClick={() => {
                          if (spark) openSpark(spark);
                          else {
                            setExecutorId(unit.id);
                            setTarget({ type: 'unit', id: unit.id, x: unit.x, y: unit.y });
                          }
                        }}
                        aria-label={
                          spark
                            ? `Scintilla di ${individuality ? unit.name : 'un compagno'}`
                            : individuality
                              ? `Seleziona ${unit.name}`
                              : 'Seleziona un compagno'
                        }
                      >
                        <span className={`unit-portrait portrait-${index % 7}`}>
                          <span className="portrait-head" />
                          <span className="portrait-body" />
                          {unit.age >= 14 && <span className="elder-hair" />}
                        </span>
                        <span className="unit-info">
                          <strong>
                            {individuality ? unit.name : 'Un compagno'}
                            {individuality && unit.age >= 14 && <small>ANZIANO</small>}
                            {individuality && unit.age < 4 && <small>GIOVANE</small>}
                          </strong>
                          <span>
                            {!individuality && unit.isolation && unit.isolation >= 3
                              ? `Isolato (${Math.floor(unit.isolation)}s/30s)`
                              : (ACTION_NAMES[unit.action] ?? unit.action)}
                          </span>
                        </span>
                        {custodianByUnit.has(unit.id) && (
                          <MessageCircle
                            size={14}
                            className={`custodian-indicator ${custodianByUnit.get(unit.id)!.risk}`}
                            aria-label="Ultimo custode"
                          >
                            <title>
                              Ultimo custode:{' '}
                              {custodianByUnit
                                .get(unit.id)!
                                .wordIds.map((id) => WORDS[id].label)
                                .join(', ')}
                            </title>
                          </MessageCircle>
                        )}
                        {spark ? (
                          <Sparkles size={16} className="spark-indicator" />
                        ) : (
                          <span
                            className="unit-health"
                            title={`Salute ${quantity(unit.hp)}`}
                            style={{ '--health': `${unit.hp}%` } as React.CSSProperties}
                          />
                        )}
                      </button>
                    );
                  })}
              </div>
              {selectedUnit && hasWord(game, 'S_02') && (
                <div className="individual-card">
                  <div>
                    <span className="eyebrow">
                      {selectedUnit.name.toUpperCase()} ·{' '}
                      {numbered
                        ? `${Math.floor(selectedUnit.age)} STAGIONI`
                        : selectedUnit.age >= 14
                          ? 'ANZIANO'
                          : selectedUnit.age < 4
                            ? 'GIOVANE'
                            : 'ADULTO'}
                    </span>
                    <button
                      className="icon-button small"
                      aria-label="Deseleziona individuo"
                      onClick={() => setTarget(null)}
                    >
                      <X size={13} />
                    </button>
                  </div>
                  <p>
                    <Heart size={13} /> {quantity(selectedUnit.hp)} salute <AppleIcon />{' '}
                    {quantity(selectedUnit.hunger)} fame
                  </p>
                  <p>
                    Forza {quantity(selectedUnit.strength)} <span>·</span> Intelligenza{' '}
                    {quantity(selectedUnit.intelligence)}
                  </p>
                  {selectedCustodian && (
                    <div className={`individual-custody ${selectedCustodian.risk}`}>
                      <strong>
                        <MessageCircle size={13} /> Ultimo custode
                      </strong>
                      <p>
                        {selectedCustodian.wordIds.map((id) => `«${WORDS[id].label}»`).join(' · ')}
                      </p>
                      {selectedCustodian.reasons.length > 0 && (
                        <span className="custodian-reasons">
                          {selectedCustodian.reasons
                            .map((reason) => CUSTODIAN_RISK_LABELS[reason])
                            .join(' · ')}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}
              {ownedBuildings.length > 0 && (
                <div className="village-card">
                  <span className="eyebrow">IL NOSTRO LUOGO</span>
                  <div className="building-list">
                    {ownedBuildings.map((b) => (
                      <button
                        key={b.id}
                        title={b.active ? 'Attivo' : 'Inattivo: manca manutenzione'}
                        onClick={() => setTarget({ type: 'building', id: b.id, x: b.x, y: b.y })}
                      >
                        <Glyph
                          id={
                            b.kind === 'campfire' ? 'O_05' : b.kind === 'menhir' ? 'M_03' : 'V_08'
                          }
                          size={16}
                        />
                        <span>{BUILDING_NAMES[b.kind]}</span>
                        <span className={`status-dot ${!b.active ? 'amber' : ''}`} />
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="tribe-footnote">
                <Wind size={21} />
                <p>
                  Prima delle città,
                  <br />
                  prima dei nomi. <em>Insieme.</em>
                </p>
              </div>
            </>
          ) : (
            <div className="chronicle-panel">
              <span className="eyebrow">TRACCE NELLA MEMORIA</span>
              <h2>La nostra storia</h2>
              <div className="event-list">
                {game.logs.map((log) => (
                  <article className={`event-entry event-${log.tone}`} key={log.id}>
                    <span className="event-marker" />
                    <small>{timeLabel(log.time)}</small>
                    <p>{log.text}</p>
                  </article>
                ))}
              </div>
            </div>
          )}
        </aside>

        <section
          className={`map-section ${mobileSection === 'map' ? 'mobile-visible' : ''}`}
          aria-label="Mappa e ordini"
        >
          {nextSpark && (
            <button
              type="button"
              className="mobile-spark-pill"
              onClick={() => openSpark(nextSpark)}
              aria-label="Nuova intuizione disponibile"
            >
              <Sparkles size={14} className="spark-spin" />
              <span>
                Scintilla:{' '}
                {individuality
                  ? (game.units.find((u) => u.id === nextSpark.unitId)?.name ?? 'un compagno')
                  : 'un compagno'}
              </span>
              <span className="spark-timer-badge">
                {Math.max(0, Math.ceil(nextSpark.expiresAt - game.time))}s
              </span>
            </button>
          )}
          <div className="map-header">
            <div>
              <span className="eyebrow">UN MONDO DA COMPRENDERE</span>
              <h1>Ogni cosa attende un nome.</h1>
            </div>
            <div className="map-header-mark">
              <Leaf size={16} /> Terra fertile
            </div>
          </div>
          <div className="map-frame">
            <WorldMap
              state={game}
              selectedTarget={target}
              groupAnchor={groupAnchor}
              isGroupActive={sentence.includes('S_01')}
              orderFeedback={orderFeedback}
              onSelectGroupAnchor={handleSetGroupAnchor}
              onSelect={(picked) => {
                if (selectingGroup) {
                  handleSetGroupAnchor(picked);
                } else {
                  setTarget(picked);
                  if (
                    (picked.type === 'unit' &&
                      game.units.some((u) => u.id === picked.id && u.factionId === 'player')) ||
                    (picked.type === 'battalion' &&
                      game.battalions.some(
                        (b) => b.id === picked.id && b.factionId === 'player',
                      )) ||
                    (picked.type === 'city' &&
                      game.cities.some((c) => c.id === picked.id && c.factionId === 'player'))
                  )
                    setExecutorId(picked.id);
                }
              }}
              commandReady={compilation.valid && sentence.length >= 2}
              onSpark={(id) => {
                const spark = game.sparks.find((s) => s.id === id);
                if (spark) openSpark(spark);
              }}
            />
            {game.paused && game.started && !panel && (
              <div className="paused-badge">
                <Pause size={13} /> Il tempo riposa
              </div>
            )}
            {hasWord(game, 'C_01') && (
              <div className="day-cycle">
                <div className="cycle-track">
                  <span style={{ left: `${season.progress * 100}%` }}>
                    {season.isNight ? <Glyph id="C_01" size={13} /> : <Sun size={13} />}
                  </span>
                </div>
                <span>
                  {numbered
                    ? `${Math.ceil(season.remaining)}s ${season.isNight ? 'all’alba' : 'alla notte'}`
                    : season.isNight
                      ? 'L’alba si avvicina'
                      : 'La luce scorre'}
                </span>
              </div>
            )}
          </div>
          <div className="map-toolbar">
            <span>
              <span className="status-dot" />
              {targetName ? (
                <>
                  <MapPin size={13} />
                  <strong>{targetName}</strong>
                  <button
                    className="icon-button small"
                    onClick={() => setTarget(null)}
                    aria-label="Deseleziona bersaglio"
                  >
                    <X size={13} />
                  </button>
                </>
              ) : (
                'Osserva la valle. Scegli dove lasciare una traccia.'
              )}
            </span>
            <div className="time-controls">
              <button
                className="icon-button"
                onClick={() => setGame((g) => ({ ...g, paused: !g.paused }))}
                aria-label={game.paused ? 'Riprendi il tempo' : 'Metti in pausa'}
                disabled={!game.started}
              >
                {game.paused ? (
                  <Play size={15} fill="currentColor" />
                ) : (
                  <Pause size={15} fill="currentColor" />
                )}
              </button>
              <div className="speed-controls">
                {([1, 2, 4] as const).map((speed) => (
                  <button
                    key={speed}
                    aria-label={`Velocità ${speed}x`}
                    aria-pressed={game.speed === speed}
                    className={game.speed === speed ? 'active' : ''}
                    onClick={() => setGame((g) => ({ ...g, speed }))}
                  >
                    {speed}×
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        <aside
          className={`discovery-panel ${mobileSection === 'discovery' ? 'mobile-visible' : ''}`}
        >
          <div className="discovery-title">
            <Sparkles size={16} />
            <span className="eyebrow">L’ORIZZONTE DEL PENSIERO</span>
          </div>
          {nextSpark ? (
            <button className="spark-card" onClick={() => openSpark(nextSpark)}>
              <span className="spark-orbit">
                <Sparkles size={30} />
              </span>
              <span className="eyebrow">QUALCOSA STA CAMBIANDO</span>
              <h2>Una scintilla.</h2>
              <p>
                {individuality
                  ? (game.units.find((u) => u.id === nextSpark.unitId)?.name ?? 'Un compagno')
                  : 'Un compagno'}{' '}
                ha vissuto qualcosa che non sa ancora dire.
              </p>
              <span className="spark-cta">
                Segui l’intuizione <ArrowUpRight size={16} />
              </span>
              <span className="spark-timer">
                Svanisce tra{' '}
                {numbered
                  ? `${Math.max(0, Math.ceil(nextSpark.expiresAt - game.time))}s`
                  : 'poco tempo'}
              </span>
            </button>
          ) : (
            <div className="quiet-card">
              <div className="quiet-illustration">
                <span />
                <Sparkles size={30} />
                <span />
              </div>
              <h2>
                Prima il vissuto.
                <br />
                Poi la parola.
              </h2>
              <p>
                Le idee non si ricercano.
                <br />
                Nascono da ciò che accade.
              </p>
              <span className="tiny-divider" />
            </div>
          )}
          <div className="objective-card">
            <span className="eyebrow">IL PROSSIMO PASSO</span>
            <div className="objective-heading">
              <span className="step-number">0{Math.min(9, game.tier + 1)}</span>
              <h3>{objective.title}</h3>
            </div>
            <p>{objective.description}</p>
            <div className="objective-progress">
              <span
                style={{
                  width: `${Math.min(100, objective.progress * (objective.progress <= 1 ? 100 : 1))}%`,
                }}
              />
            </div>
            <div className="objective-count">
              <span>Il sapere cresce con l’esperienza</span>
              <b>
                {objective.current}/{objective.total}
              </b>
            </div>
          </div>
          <button className="lexicon-overview" onClick={() => setPanel('lexicon')}>
            <span className="book-stamp">
              <BookOpen size={23} />
            </span>
            <span>
              <strong>Il lessico della tribù</strong>
              <small>
                {known.length} parole · {slots} spazi di pensiero
              </small>
            </span>
            <ChevronRight size={16} />
          </button>
          {hasWord(game, 'O_05') && (
            <button className="side-action" onClick={() => setPanel('campfire')}>
              <Flame size={17} />
              <span>
                Attorno al falò<small>Tramanda ciò che sai</small>
              </span>
              <ChevronRight size={15} />
            </button>
          )}
          {hasWord(game, 'M_03') && (
            <button className="side-action" onClick={() => setPanel('dogma')}>
              <Shield size={17} />
              <span>
                La Pietra Sacra
                <small>
                  {game.dogmas.length}/
                  {ownedBuildings.some((b) => b.kind === 'temple' && b.hp > 0 && b.active) ? 6 : 3}{' '}
                  dogmi scolpiti
                </small>
              </span>
              <ChevronRight size={15} />
            </button>
          )}
          <nav className="civilization-nav" aria-label="Istituzioni della civiltà">
            <button className="side-action" onClick={() => setPanel('recipes')}>
              <Glyph id="V_08" size={17} />
              <span>
                Le frasi della materia<small>Ricette e costruzioni</small>
              </span>
              <ChevronRight size={15} />
            </button>
            {hasWord(game, 'C_02') && (
              <button className="side-action" onClick={() => setPanel('traditions')}>
                <Glyph id="C_02" size={17} />
                <span>
                  Tradizioni e mestieri<small>{game.traditions.length} frasi permanenti</small>
                </span>
                <ChevronRight size={15} />
              </button>
            )}
            {hasWord(game, 'C_03') && (
              <button className="side-action" onClick={() => setPanel('laws')}>
                <Glyph id="O_14" size={17} />
                <span>
                  Il codice dello Stato<small>{game.laws.length} leggi attive</small>
                </span>
                <ChevronRight size={15} />
              </button>
            )}
            {hasWord(game, 'S_05') && (
              <button className="side-action" onClick={() => setPanel('world')}>
                <Glyph id="S_05" size={17} />
                <span>
                  Gli altri popoli<small>Lingue e relazioni</small>
                </span>
                <ChevronRight size={15} />
              </button>
            )}
            {game.tier >= 4 && (
              <button className="side-action" onClick={() => setPanel('victory')}>
                <Glyph id="V_13" size={17} />
                <span>
                  Il destino della civiltà<small>Tre condizioni di vittoria</small>
                </span>
                <ChevronRight size={15} />
              </button>
            )}
            {target?.type === 'city' && (
              <button className="side-action" onClick={() => setPanel('settlement')}>
                <Glyph id="S_09" size={17} />
                <span>Osserva {targetName}</span>
                <ChevronRight size={15} />
              </button>
            )}
          </nav>
          <div className="thought">
            <span>“</span>
            <p>
              I limiti del mio linguaggio
              <br />
              sono i limiti del mio mondo.
            </p>
            <small>UNA CIVILTÀ IN DIVENIRE</small>
          </div>
        </aside>
      </main>

      <section
        className={`language-workbench ${mobileSection !== 'map' ? 'mobile-hidden' : ''}`}
        aria-label="Costruttore di frasi"
      >
        <div className="composer-topline">
          <div>
            <span className="eyebrow">LA TUA VOCE</span>
            <h2>Dai forma a un pensiero.</h2>
          </div>
          <div
            className="voice-meter"
            title="Un ordine costa una voce. Una voce si rigenera ogni 10 secondi."
          >
            <span>VOCE</span>
            {Array.from({ length: voiceMax }, (_, v) => v).map((v) => (
              <span key={v} className={`voice-pip ${game.voice >= v + 1 ? 'filled' : ''}`}>
                <Wind size={13} />
              </span>
            ))}
            <small>
              {Math.floor(game.voice)}/{voiceMax}
            </small>
          </div>
        </div>
        <div className="workbench-tools-row">
          <div className="executor-selection">
            <button className="text-button" onClick={() => setSelectingGroup((v) => !v)}>
              <Users size={13} />
              {selectingGroup ? 'Indica sulla mappa il centro del gruppo' : 'Scegli il gruppo'}{' '}
              <span>raggio 15 m</span>
            </button>
            <button
              className="text-button camp-button"
              onClick={() => handleSetGroupAnchor({ type: 'point', ...game.home })}
              title="Ripristina il gruppo attorno al giaciglio primordiale"
            >
              <Home size={12} />
              <span>Al campo</span>
            </button>
            <span className="group-hint desktop-only-hints">
              (oppure doppio click o tasto destro sulla mappa)
            </span>
            {sentence.includes('S_02') && (
              <span>
                Io: {game.units.find((u) => u.id === executorId)?.name ?? 'scegli un individuo'}
              </span>
            )}
            {selectingGroup && (
              <button className="text-button" onClick={() => setSelectingGroup(false)}>
                Annulla
              </button>
            )}
          </div>
          {recentPhrases.length > 0 && (
            <div className="echo-shelf" aria-label="Frasi recenti">
              <span className="echo-label">
                <History size={12} />
                Echi:
              </span>
              {recentPhrases.map((phrase, idx) => {
                const isKnown = phrase.every((id) => hasWord(game, id));
                if (!isKnown) return null;
                const isActive =
                  phrase.length === sentence.length && phrase.every((id, i) => sentence[i] === id);
                return (
                  <button
                    key={idx}
                    type="button"
                    className={`echo-chip ${isActive ? 'active' : ''}`}
                    onClick={() => applyRecentPhrase(phrase)}
                    title="Richiama questa frase negli spazi"
                  >
                    <span className="echo-chip-dot" />
                    {phrase.map((id) => WORDS[id]?.label).join(' · ')}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div className="composer-row">
          <div
            className="sentence-slots"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => dropWord(e)}
          >
            {Array.from({ length: slots }, (_, i) => (
              <div className="slot-group" key={i}>
                {i > 0 && <Plus size={13} className="slot-plus" />}
                <button
                  className={`sentence-slot ${sentence[i] ? `filled word-${WORDS[sentence[i]]?.kind}` : ''}`}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.stopPropagation();
                    dropWord(e, i);
                  }}
                  onClick={() =>
                    sentence[i] && setSentence((s) => s.filter((_, index) => index !== i))
                  }
                  aria-label={
                    sentence[i]
                      ? `Rimuovi ${WORDS[sentence[i]].label}`
                      : `Spazio ${i + 1}: ${i === 0 ? 'chi?' : i === 1 ? 'cosa fa?' : 'con cosa?'}`
                  }
                >
                  {sentence[i] ? (
                    <>
                      <Glyph id={sentence[i]} size={23} />
                      <strong>{WORDS[sentence[i]].label}</strong>
                      <X size={11} className="slot-remove" />
                    </>
                  ) : (
                    <>
                      <span className="slot-index">0{i + 1}</span>
                      <span>
                        {i === 0 ? 'Chi?' : i === 1 ? 'Cosa fa?' : i === 2 ? 'Con cosa?' : 'Come?'}
                      </span>
                    </>
                  )}
                </button>
              </div>
            ))}
            {game.tier < 4 && (
              <div className="future-slot" title="Scopri nuove parole per espandere il pensiero">
                <LockKeyhole size={16} />
                <span>
                  Il pensiero
                  <br />
                  può crescere.
                </span>
              </div>
            )}
          </div>
          <div className="composer-actions">
            <button
              className="icon-button undo-button"
              aria-label="Rimuovi ultima parola"
              title="Rimuovi ultima parola (Backspace)"
              disabled={!sentence.length}
              onClick={() => setSentence((s) => s.slice(0, -1))}
            >
              <Undo2 size={18} />
            </button>
            <button
              className="pronounce-button"
              onClick={pronounce}
              disabled={!game.started || sentence.length < 2 || !!game.gameOver}
              title="Pronuncia (Invio)"
            >
              <span>Pronuncia</span>
              <ArrowRight size={18} />
            </button>
          </div>
        </div>
        <div className="sentence-feedback" aria-live="polite">
          <span className={`feedback-dot ${compilation.valid ? 'valid' : ''}`} />
          <span>
            {sentence.length === 0
              ? 'Scegli o trascina le parole. Componi una frase, indica un bersaglio e pronunciala.'
              : compilation.message}
          </span>
          <div className="keyboard-hints desktop-only-hints">
            <span>
              <kbd>INVIO</kbd> pronuncia
            </span>
            <span>
              <kbd>BACKSPACE</kbd> cancella
            </span>
            <span>
              <kbd>SPAZIO</kbd> pausa
            </span>
          </div>
        </div>
        <div className="lexicon-bar">
          <div className="lexicon-label">
            <BookOpen size={16} />
            <span>LE PAROLE CHE CONOSCI</span>
            <b>{known.length}</b>
          </div>
          <div className="word-filters" role="group" aria-label="Filtra le parole">
            {(['all', 'S', 'V', 'O', 'M', 'C'] as const)
              .filter((f) => f === 'all' || known.some((id) => WORDS[id].kind === f))
              .map((f) => (
                <button
                  key={f}
                  className={filter === f ? 'active' : ''}
                  onClick={() => setFilter(f)}
                >
                  {f === 'all' ? 'Tutte' : KIND_NAMES[f]}
                </button>
              ))}
          </div>
          <button className="text-button" onClick={() => setPanel('lexicon')}>
            Esplora il lessico <ArrowUpRight size={13} />
          </button>
        </div>
        <div className="word-shelf">
          {known
            .filter((id) => filter === 'all' || WORDS[id].kind === filter)
            .map((id) => renderWord(id))}
          <div className="unknown-words">
            <span>· · ·</span>
            <p>
              Le altre parole sono là fuori.
              <br />
              Aspettano di essere vissute.
            </p>
          </div>
        </div>
      </section>
      <footer className="page-footer">
        <span>
          <BrandMark size={13} /> OGNI CIVILTÀ COMINCIA CON UNA PAROLA.
        </span>
        <span>
          LINGUAGGIO · MEMORIA · CIVILTÀ<span className="footer-dot">·</span>Salvataggio automatico
          locale
        </span>
      </footer>

      {toast && (
        <div className="toast" role="status">
          <Sparkles size={16} />
          {toast}
          <button
            className="icon-button small"
            aria-label="Nascondi notifica"
            onClick={() => setToast('')}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {panel === 'welcome' && (
        <Modal title="Benvenuto in Lingus" className="welcome-modal">
          <div className="welcome-emblem">
            <BrandMark size={74} />
          </div>
          <span className="eyebrow">LA STORIA COMINCIA PRIMA DELLA STORIA</span>
          <h2>
            Il mondo inizia
            <br />
            con quattro parole<span>.</span>
          </h2>
          <p>
            Una piccola tribù abita una valle senza nome.
            <br />
            Non conosce il domani. Non sa custodire il fuoco.
            <br />
            Ma può imparare a dirlo.
          </p>
          <div className="welcome-words">
            {INNATE_WORDS.map((id) => (
              <span key={id}>
                <Glyph id={id} size={20} />
                {WORDS[id].label}
              </span>
            ))}
          </div>
          <button
            className="primary-button"
            onClick={() => {
              setGame((g) => ({ ...g, started: true, paused: false }));
              closePanel();
            }}
          >
            Dai inizio alla storia <ArrowRight size={18} />
          </button>
          <button className="text-button welcome-help" onClick={() => setPanel('guide')}>
            Prima, insegnami a giocare <CircleHelp size={15} />
          </button>
          <small className="welcome-note">
            Sei ere · 45 parole · 20 edifici · Partita salvata nel browser
          </small>
        </Modal>
      )}

      {panel === 'guide' && (
        <Modal
          title="Come si gioca"
          onClose={game.started ? closePanel : () => setPanel('welcome')}
          className="guide-modal"
        >
          <span className="eyebrow">NON GUIDI LE MANI. GUIDI IL PENSIERO.</span>
          <h2>Impara a dire il mondo.</h2>
          <p className="modal-intro">
            Un gioco di sopravvivenza in cui il linguaggio è la tua unica interfaccia con la tribù.
          </p>
          <div className="guide-steps">
            <article>
              <b>01</b>
              <div>
                <h3>Componi una frase</h3>
                <p>
                  Clicca le parole in basso, oppure trascinale negli spazi. Inizia con{' '}
                  <strong>Gruppo + Colpire</strong>, seleziona un albero sulla mappa e premi{' '}
                  <strong>Pronuncia</strong>. Le mani scopriranno il legno.
                </p>
              </div>
            </article>
            <article>
              <b>02</b>
              <div>
                <h3>Vivi, osserva, comprendi</h3>
                <p>
                  Un’esperienza può accendere una <strong>Scintilla</strong>. Cliccala e combina
                  parole già note per dare un nome all’intuizione. Leggi l’indizio: non esistono
                  punti ricerca.
                </p>
              </div>
            </article>
            <article>
              <b>03</b>
              <div>
                <h3>Sopravvivi al domani</h3>
                <p>
                  Le persone si nutrono per istinto. Puoi aiutarle con{' '}
                  <strong>Gruppo + Mangiare</strong> e un cespuglio. Muoviti, caccia e osserva la
                  notte. Le nuove parole svelano parti dell’interfaccia.
                </p>
              </div>
            </article>
            <article>
              <b>04</b>
              <div>
                <h3>Difendi la memoria</h3>
                <p>
                  Quando avrai il <strong>Fuoco</strong>, insegna le parole al falò: senza custodi,
                  il sapere scompare. I <strong>dogmi</strong> restituiscono coesione, ma vincolano
                  le azioni e diventano più difficili da abolire.
                </p>
              </div>
            </article>
          </div>
          <div className="guide-note">
            <Clock3 size={18} />
            <p>
              Una stagione dura 90 secondi: 60 di luce e 30 di notte. Usa <kbd>SPAZIO</kbd> per
              fermare il tempo e i tasti <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> per la velocità.
              Ogni ordine consuma una delle tre voci, che si rigenerano ogni 10 secondi.
            </p>
          </div>
          <button
            className="primary-button"
            onClick={() => {
              setGame((g) => ({ ...g, started: true, paused: false }));
              closePanel();
            }}
          >
            Ho quattro parole. Cominciamo. <ArrowRight size={17} />
          </button>
        </Modal>
      )}

      {panel === 'spark' && (
        <Modal title="La Scintilla Cognitiva" onClose={closePanel} className="spark-modal">
          <div className="modal-symbol">
            <Sparkles size={35} />
          </div>
          <span className="eyebrow">SCINTILLA COGNITIVA · IL TEMPO È FERMO</span>
          <h2>Qualcosa cerca un nome.</h2>
          {currentSpark ? (
            <>
              <p className="spark-context">{currentSpark.eventLabel}</p>
              <blockquote>{currentSpark.hint}</blockquote>
              <p className="puzzle-label">Quali parole note spiegano questa esperienza?</p>
              <div className="puzzle-slots">
                {Array.from({ length: currentSpark.recipe.length }, (_, i) => (
                  <button
                    key={i}
                    className={`puzzle-slot ${puzzle[i] ? 'filled' : ''}`}
                    onClick={() => setPuzzle((p) => p.filter((_, index) => index !== i))}
                    aria-label={
                      puzzle[i]
                        ? `Rimuovi ${WORDS[puzzle[i]].label} dall’intuizione`
                        : `Concetto ${i + 1}`
                    }
                  >
                    {puzzle[i] ? (
                      <>
                        <Glyph id={puzzle[i]} />
                        <span>{WORDS[puzzle[i]].label}</span>
                        <X size={11} />
                      </>
                    ) : (
                      <Plus size={20} />
                    )}
                  </button>
                ))}
              </div>
              <div className="puzzle-words">{known.map((id) => renderWord(id, true))}</div>
              <div className="puzzle-warning">
                <Zap size={14} />
                Un errore consuma l’intuizione. Ascolta l’indizio.
              </div>
              <button
                className="primary-button"
                onClick={attemptDiscovery}
                disabled={puzzle.length !== currentSpark.recipe.length}
              >
                Dai un nome all’intuizione <Sparkles size={17} />
              </button>
            </>
          ) : (
            <>
              <p>
                L’intuizione è svanita. La tensione diminuisce di 35; occorrono quindici secondi
                prima di riprovare.
              </p>
              {puzzleFeedback && (
                <>
                  <p>I concetti giusti conservano una luce dorata.</p>
                  <div className="puzzle-slots" aria-label="Esito dei concetti scelti">
                    {puzzleFeedback.chosen.map((id, i) => (
                      <span
                        key={i}
                        className={`puzzle-slot ${puzzleFeedback.correct[i] ? 'is-correct' : 'is-incorrect'}`}
                      >
                        <Glyph id={id} />
                        <span>{WORDS[id].label}</span>
                        <small>
                          {puzzleFeedback.correct[i] ? 'Concetto corretto' : 'Da ripensare'}
                        </small>
                      </span>
                    ))}
                  </div>
                </>
              )}
              <button className="primary-button" onClick={closePanel}>
                Torna alla valle <ArrowRight size={17} />
              </button>
            </>
          )}
        </Modal>
      )}

      {panel === 'lexicon' && (
        <Modal title="Il lessico della tribù" onClose={closePanel} className="lexicon-modal">
          <span className="eyebrow">IL MONDO CHE SAPPIAMO DIRE</span>
          <h2>
            Il lessico della tribù<span>.</span>
          </h2>
          <div className="lexicon-modal-meta">
            <span>{known.length} / 45 parole vive</span>
            <span>{slots} spazi di pensiero</span>
            <span>Capitolo {game.tier + 1} / 6</span>
          </div>
          <label className="search-field">
            <BookOpen size={17} />
            <input
              aria-label="Cerca nel lessico"
              placeholder="Cerca una parola o un’esperienza…"
              value={lexiconSearch}
              onChange={(e) => setLexiconSearch(e.target.value)}
            />
          </label>
          <div className="dictionary-list">
            {WORD_ORDER.filter((id) =>
              `${WORDS[id].label} ${WORDS[id].description} ${WORDS[id].event}`
                .toLowerCase()
                .includes(lexiconSearch.toLowerCase()),
            ).map((id) => {
              const word = WORDS[id],
                memory = game.words[id],
                unlocked = hasWord(game, id);
              return (
                <article key={id} className={`dictionary-entry ${unlocked ? '' : 'unlearned'}`}>
                  <div className={`dictionary-glyph word-${word.kind}`}>
                    {unlocked ? <Glyph id={id} size={24} /> : <LockKeyhole size={20} />}
                  </div>
                  <div>
                    <div className="dictionary-word">
                      <h3>{unlocked ? word.label : 'Un’idea da scoprire'}</h3>
                      <span>
                        {KIND_NAMES[word.kind]} · {word.tier === 0 ? 'Innato' : `Tier ${word.tier}`}
                      </span>
                    </div>
                    <p>{unlocked ? word.description : word.event}</p>
                    {unlocked && memory && (
                      <div className="dictionary-memory">
                        <span className="meter">
                          <span style={{ width: `${memory.retention}%` }} />
                        </span>
                        <span>
                          {numbered
                            ? `${Math.round(memory.retention)}% memoria`
                            : memory.retention > 70
                              ? 'Memoria salda'
                              : memory.retention >= 30
                                ? 'Memoria fragile'
                                : 'Memoria in pericolo'}
                        </span>
                        <span>
                          {numbered
                            ? memory.custodians.length
                            : memory.custodians.length > 3
                              ? 'Molti'
                              : 'Pochi'}{' '}
                          custodi
                        </span>
                      </div>
                    )}
                    {!unlocked && <small>{word.hint}</small>}
                    {unlocked &&
                      hasWord(game, 'O_09') &&
                      hasWord(game, 'V_06') &&
                      !INNATE_WORDS.includes(id) && (
                        <button
                          className="text-button"
                          onClick={() => {
                            setSentence(['S_01', 'V_06', 'O_02', 'O_09']);
                            setTarget({ type: 'point', id: `word:${id}`, ...game.home });
                            closePanel();
                          }}
                        >
                          Prepara una stele per questa parola <ArrowRight size={12} />
                        </button>
                      )}
                  </div>
                </article>
              );
            })}
          </div>
          <div className="guide-note">
            <Leaf size={17} />
            <p>
              Il lessico comprende quarantacinque parole, dall’Istinto all’Età del Ferro. Le regole
              definitive e le decisioni sui parametri mancanti sono nel registro di conformità.
            </p>
          </div>
        </Modal>
      )}

      {panel === 'campfire' && (
        <Modal
          title="Attorno al falò"
          onClose={game.campfirePending ? undefined : closePanel}
          className="campfire-modal"
        >
          <div className="modal-symbol">
            <Flame size={37} />
          </div>
          <span className="eyebrow">CIÒ CHE NON TRAMANDI PUÒ SCOMPARIRE</span>
          <h2>Attorno al falò.</h2>
          <p className="modal-intro">
            Gli anziani raccontano. I giovani ascoltano.
            <br />
            Scegli le parole che la tribù porterà nel domani.
          </p>
          <div className="attention-counter">
            <span>ATTENZIONE DISPONIBILE</span>
            <strong>
              {quantity(game.attention)}
              <small> attenzione</small>
            </strong>
          </div>
          <div className="teaching-list">
            {known
              .filter((id) => !INNATE_WORDS.includes(id))
              .sort(
                (a, b) =>
                  Number(custodianByWord.has(b)) - Number(custodianByWord.has(a)) ||
                  game.words[a].retention - game.words[b].retention,
              )
              .map((id) => (
                <div
                  className={`teaching-row ${custodianByWord.has(id) ? 'last-custodian-word' : ''}`}
                  key={id}
                  aria-label={`Parola da tramandare: ${WORDS[id].label}`}
                >
                  <Glyph id={id} size={23} />
                  <div>
                    <strong>{WORDS[id].label}</strong>
                    {custodianByWord.has(id) && (
                      <span className={`teaching-custodian ${custodianByWord.get(id)!.risk}`}>
                        <MessageCircle size={10} /> Ultimo custode:{' '}
                        {custodianByWord.get(id)!.displayName}
                      </span>
                    )}
                    <span>
                      {numbered
                        ? game.words[id].custodians.length
                        : game.words[id].custodians.length > 3
                          ? 'Molti'
                          : 'Pochi'}{' '}
                      custodi · Memoria{' '}
                      {numbered
                        ? `${Math.round(game.words[id].retention)}%`
                        : game.words[id].retention > 70
                          ? 'Salda'
                          : game.words[id].retention >= 30
                            ? 'Fragile'
                            : 'In pericolo'}
                    </span>
                    <span className="meter">
                      <span style={{ width: `${game.words[id].retention}%` }} />
                    </span>
                  </div>
                  <button
                    className="teach-button"
                    onClick={() => setGame((g) => teachWord(g, id))}
                    disabled={!canTransmitWord(game, id)}
                  >
                    Tramanda{' '}
                    <small>
                      10 <Flame size={11} />
                    </small>
                  </button>
                </div>
              ))}
          </div>
          <p className="campfire-explanation">
            Ogni insegnamento spende 10 attenzione e forma un custode. Il recupero base è di 10
            memoria e può aumentare con i dogmi. La legna nel fuoco e gli anziani generano
            attenzione al cambio di stagione.
          </p>
          <button
            className="primary-button"
            onClick={() => {
              setGame((g) => dismissCampfire(g));
              closePanel();
            }}
          >
            Custodiamo queste parole <ArrowRight size={17} />
          </button>
        </Modal>
      )}

      {panel === 'dogma' && (
        <Modal title="La Pietra Sacra" onClose={closePanel} className="dogma-modal">
          <div className="modal-symbol">
            <Shield size={33} />
          </div>
          <span className="eyebrow">UNA PAURA PUÒ DIVENTARE UNA LEGGE</span>
          <h2>La Pietra Sacra.</h2>
          <p className="modal-intro">
            Un dogma legato a un trauma recente restituisce 40 coesione. Ma la tribù obbedirà alla
            sua regola, anche quando tu vorrai fare altrimenti.
          </p>
          {!ownedBuildings.some((b) => b.kind === 'menhir' && b.hp > 0) && (
            <div className="guide-note">
              <Glyph id="O_02" />
              <p>
                Serve una Pietra Sacra: <strong>Gruppo + Scheggiare + Pietra + Sacro</strong>.
                Costo: 20 pietra.
              </p>
            </div>
          )}
          <div className="dogma-builder">
            <label>
              Un concetto
              <select value={activeDogmaTarget} onChange={(e) => setDogmaTarget(e.target.value)}>
                {sacredTargets.map((id) => (
                  <option key={id} value={id}>
                    {WORDS[id].label}
                  </option>
                ))}
              </select>
            </label>
            <span>è sacro, quindi</span>
            <label>
              Una regola
              <select value={activeDogmaVector} onChange={(e) => setDogmaVector(e.target.value)}>
                {sacredVectors.map((id) => (
                  <option key={id} value={id}>
                    {id === 'M_01'
                      ? 'È vietato'
                      : id === 'V_05'
                        ? 'Va protetto'
                        : id === 'V_02' || id === 'O_05'
                          ? 'Va offerto in sacrificio'
                          : id === 'C_02'
                            ? 'Va venerato sempre'
                            : id === 'M_04'
                              ? 'È proprietà privata'
                              : id === 'S_01'
                                ? 'È collettivo'
                                : id === 'O_01'
                                  ? 'È protetto nella tana'
                                  : id === 'O_06'
                                    ? 'Trasforma la morte in martirio'
                                    : id.startsWith('S_')
                                      ? `È riservato a ${WORDS[id].label}`
                                      : WORDS[id].label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="dogma-preview">
            <h3>{dogmaPreview.name}</h3>
            <p>{dogmaPreview.description}</p>
          </div>
          <button
            className="primary-button"
            disabled={
              !activeDogmaTarget ||
              !activeDogmaVector ||
              !ownedBuildings.some((b) => b.kind === 'menhir' && b.hp > 0 && b.active) ||
              game.dogmas.length >=
                (ownedBuildings.some((b) => b.kind === 'temple' && b.hp > 0 && b.active) ? 6 : 3)
            }
            onClick={() => {
              const next = inscribeDogma(game, activeDogmaTarget, activeDogmaVector);
              setGame(next);
              notify(
                next.dogmas.length > game.dogmas.length
                  ? 'Il dogma è inciso. La coesione si rafforza, la libertà si restringe.'
                  : (next.logs[0]?.text ?? 'Questo dogma è già inciso.'),
              );
            }}
          >
            Scolpisci il dogma <HammerIcon />
          </button>
          <div className="dogma-list">
            {game.dogmas.map((d) => (
              <article key={d.id}>
                <div>
                  <h3>{d.name}</h3>
                  <span>
                    {numbered
                      ? `${d.age} stagioni · Peso culturale ${d.weight.toFixed(1)}`
                      : `Radicamento ${d.weight >= 30 ? 'profondo' : d.weight >= 15 ? 'forte' : 'recente'}`}
                  </span>
                  <p>{d.description}</p>
                </div>
                <button
                  className="text-button text-danger"
                  title={
                    numbered
                      ? `Abolire costa ${Math.ceil(d.weight)} coesione`
                      : 'Abolire indebolisce la coesione: più il dogma è radicato, maggiore è il costo.'
                  }
                  onClick={() => setGame((g) => removeDogma(g, d.id))}
                >
                  Abolisci{' '}
                  <small>
                    {numbered ? `−${Math.ceil(d.weight)} coesione` : 'Indebolisce la coesione'}
                  </small>
                </button>
              </article>
            ))}
          </div>
        </Modal>
      )}

      {panel === 'settings' && (
        <Modal title="Impostazioni e salvataggi" onClose={closePanel} className="settings-modal">
          <span className="eyebrow">IL TEMPO È NELLE TUE MANI</span>
          <h2>Custodisci la storia.</h2>
          <p className="modal-intro">
            La partita viene salvata ogni cinque secondi su questo browser. Esporta una copia per
            portarla con te.
          </p>
          <div className="settings-actions">
            <button onClick={saveGame}>
              <Save size={19} />
              <span>
                <strong>Salva adesso</strong>
                <small>Memoria locale del browser</small>
              </span>
              <ChevronRight size={17} />
            </button>
            <button onClick={exportGame}>
              <Download size={19} />
              <span>
                <strong>Esporta partita</strong>
                <small>Scarica un salvataggio JSON</small>
              </span>
              <ChevronRight size={17} />
            </button>
            <button onClick={() => fileInput.current?.click()}>
              <Upload size={19} />
              <span>
                <strong>Importa partita</strong>
                <small>Riprendi un salvataggio precedente</small>
              </span>
              <ChevronRight size={17} />
            </button>
            <button className="restart-action" onClick={() => setPanel('restart')}>
              <RotateCcw size={19} />
              <span>
                <strong>Una nuova storia</strong>
                <small>Ricomincia con una nuova tribù</small>
              </span>
              <ChevronRight size={17} />
            </button>
          </div>
          <div className="save-stats">
            <span>
              {game.stats.commands}
              <small>ordini pronunciati</small>
            </span>
            <span>
              {game.stats.discoveries}
              <small>parole scoperte</small>
            </span>
            <span>
              {game.stats.seasonsSurvived}
              <small>stagioni vissute</small>
            </span>
          </div>
        </Modal>
      )}

      {panel === 'restart' && (
        <Modal
          title="Cominciare una nuova storia"
          onClose={() => setPanel('settings')}
          className="confirm-modal"
        >
          <div className="modal-symbol">
            <RotateCcw size={29} />
          </div>
          <h2>Un nuovo inizio?</h2>
          <p>
            La partita attuale verrà sostituita. Puoi esportarla prima di iniziare una nuova storia.
          </p>
          <button className="primary-button" onClick={restart}>
            Inizia una nuova storia <ArrowRight size={17} />
          </button>
          <button
            className="text-button"
            onClick={() => {
              exportGame();
              setPanel('settings');
            }}
          >
            Prima esporta la mia partita <Download size={15} />
          </button>
        </Modal>
      )}

      {panel === 'milestone' && (
        <Modal
          title="Una civiltà ha lasciato il suo segno"
          onClose={closePanel}
          className="milestone-modal"
        >
          <div className="modal-symbol">
            <Sun size={40} />
          </div>
          <span className="eyebrow">IL LINGUAGGIO HA CAMBIATO IL MONDO</span>
          <h2>
            {game.victory === 'imperial'
              ? 'Pax Universalis.'
              : game.victory === 'cultural'
                ? 'La Biblioteca Universale.'
                : 'Il Grande Risveglio.'}
          </h2>
          <p>{game.logs.find((l) => l.tone === 'discovery')?.text}</p>
          <button className="primary-button" onClick={() => setPanel('victory')}>
            Osserva la tua civiltà <ArrowRight size={17} />
          </button>
        </Modal>
      )}
      {panel &&
        ['traditions', 'laws', 'world', 'victory', 'settlement', 'recipes'].includes(panel) && (
          <Modal
            title="La civiltà delle parole"
            onClose={closePanel}
            className="civilization-modal"
          >
            <CivilizationPanel
              state={game}
              mode={panel as CivilizationMode}
              target={target}
              onChange={setGame}
              onClose={closePanel}
              onCompose={(tokens, destination) => {
                if (tokens.length > slots) {
                  notify('Questa frase richiede una capacità di pensiero maggiore.');
                  return;
                }
                setSentence(tokens);
                if (destination) setTarget(destination);
              }}
            />
          </Modal>
        )}

      {game.gameOver && panel !== 'restart' && panel !== 'settings' && (
        <Modal title="La storia della tribù è finita" className="gameover-modal">
          <div className="modal-symbol">
            <Wind size={40} />
          </div>
          <span className="eyebrow">ANCHE IL SILENZIO RACCONTA</span>
          <h2>Le voci si sono spente.</h2>
          <p>{game.gameOver}</p>
          <div className="save-stats">
            <span>
              {known.length}
              <small>parole ricordate</small>
            </span>
            <span>
              {game.stats.seasonsSurvived}
              <small>stagioni vissute</small>
            </span>
          </div>
          <button className="primary-button" onClick={restart}>
            Dai voce a un’altra storia <ArrowRight size={17} />
          </button>
          <button className="text-button" onClick={exportGame}>
            Esporta questa storia <Download size={15} />
          </button>
        </Modal>
      )}
      <input
        type="file"
        accept="application/json,.json"
        ref={fileInput}
        hidden
        onChange={(e) => void importGame(e.target.files?.[0])}
      />
    </div>
  );
}

function AppleIcon() {
  return <Glyph id="V_02" size={15} />;
}
function HammerIcon() {
  return <Glyph id="V_06" size={17} />;
}

export default App;
