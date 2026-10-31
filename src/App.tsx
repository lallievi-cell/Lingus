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
  Pencil,
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
import { CampInventoryPanel } from './components/CampInventoryPanel';
import { describeStockQuantity } from './components/campInventory';
import { TribeMemberCard } from './components/TribeMemberCard';
import {
  lastCustodianLabel,
  lifeStageLabel,
  physicalWarnings,
  sexLabel,
  unitLifeHint,
  visibleUnitName,
} from './components/unitReadability';
import { entityTargetPresentation } from './components/targetPresentation';
import { BrandMark, Glyph } from './components/Glyph';
import { Modal } from './components/Modal';
import {
  MapPicker,
  freshMapSeed,
  mapSeedValid,
  parseMapSeed,
  type MapChoice,
} from './components/MapPicker';
import { GrowthReadiness, IndividualGrowthReadiness } from './components/GrowthReadiness';
import { GuidedCouncil } from './components/GuidedCouncil';
import { getCalendar, hasOpeningBalance, seasonStart } from './game/calendar';
import { TeachingPanel } from './components/TeachingPanel';
import { MobileActionDock } from './components/MobileActionDock';
import { MobileWordPalette } from './components/MobileWordPalette';
import { useMobileViewport } from './components/useMobileViewport';
import { ContextualWordShelf } from './components/ContextualWordShelf';
import { ContextualDiscoveryNotice } from './components/ContextualDiscoveryNotice';
import { contextualDiscoveryKey, newContextualDiscoveries } from './game/contextualDiscovery';
import { SurvivalAdvisor } from './components/SurvivalAdvisor';
import { TaskOutcomes } from './components/TaskOutcomes';
import { getSurvivalAdvice } from './game/survivalAdvice';
import { appendTaskOutcomes, observeTaskOutcomes, type TaskOutcome } from './game/taskOutcomes';
import {
  allAdultsAnchor,
  isAllAdultsAnchor,
  recallTribe,
  selectableTribeAdults,
  tribeRecallDestination,
} from './game/tribeControl';
import { canRecallSpark } from './game/knowledgeRecovery';
import { canPrepareBriefLesson } from './game/teaching';
import { ForeignPressure } from './components/ForeignPressure';
import { resolveForeignUltimatum } from './game/foreignPolicy';
import { OpeningGuide } from './components/OpeningGuide';
import { OrderPreview } from './components/OrderPreview';
import { SeasonReadiness } from './components/SeasonReadiness';
import { BuildingWorkStatus, UnitWorkStatus } from './components/WorkStatus';
import {
  matchesTribeFilter,
  matchesTribeTask,
  type TribeFilter,
  type TribeTask,
} from './game/workDiagnostics';
import {
  acknowledgedTribeEventIds,
  forgottenWordHint,
  TribeEvents,
} from './components/TribeEvents';
import './components/Onboarding.css';
import './components/QualityOfLife.css';
import './components/SyntaxAssistant.css';
import {
  CivilizationPanel,
  describeQuantity,
  type CivilizationMode,
} from './components/CivilizationPanel';
import { playerPopulation } from './game/imperial';
import { orderAcknowledged } from './game/commandAcknowledgement';
import { hasBuilding, isPlayerBuilding } from './game/runtime';
import {
  canTransmitWord,
  CUSTODIAN_RISK_LABELS,
  getCustodianStatuses,
  type CustodianStatus,
} from './game/custodianStatus';
import { BUILDING_NAMES, ERA_NAMES, INNATE_WORDS, WORD_ORDER, WORDS } from './game/content';
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
  prepareCampfireCouncil,
  prepareBriefLesson,
  recallSpark,
  removeDogma,
  solveSpark,
  tick,
} from './game/engine';
import type { GameState, Spark, Target, WordKind } from './game/types';
import {
  getSyntaxSuggestions,
  phraseRecallIssue,
  rememberRecentPhrase,
  STARTER_PHRASES,
} from './game/syntaxAssistant';
import { useGameAudio } from './components/useGameAudio';

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
  | 'word-help'
  | 'readiness'
  | 'stocks'
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
  return createGame(freshMapSeed(), 'guided', 'random');
}

function loadEventPause(defaultValue: boolean) {
  try {
    const value = localStorage.getItem('lingus.pause-events');
    return value === null ? defaultValue : value === 'true';
  } catch {
    return defaultValue;
  }
}

function timeLabel(time: number) {
  return `${Math.floor(time / 60)
    .toString()
    .padStart(2, '0')}:${Math.floor(time % 60)
    .toString()
    .padStart(2, '0')}`;
}

function App() {
  const { mobile, keyboardOpen } = useMobileViewport();
  const [wordBankRequest, setWordBankRequest] = useState(0);
  const [wordBankCloseRequest, setWordBankCloseRequest] = useState(0);
  const [wordBankOpen, setWordBankOpen] = useState(false);
  const [wordBankMode, setWordBankMode] = useState<'closed' | 'compact' | 'catalog'>('closed');
  const [editingSlot, setEditingSlot] = useState<number | null>(null);
  const onWordBankOpenChange = useCallback((open: boolean) => {
    setWordBankOpen(open);
    if (!open) setEditingSlot(null);
  }, []);
  const [game, setGame] = useState<GameState>(loadInitialGame);
  const [mapSession, setMapSession] = useState(0);
  const [panel, setPanel] = useState<Panel>(() => (game.started ? null : 'welcome'));
  const [sentence, setSentence] = useState<string[]>([]);
  const [executorId, setExecutorId] = useState<string | undefined>();
  const [groupAnchor, setGroupAnchor] = useState<Target>({ type: 'point', ...game.home });
  const [selectingGroup, setSelectingGroup] = useState(false);
  const [target, setTarget] = useState<Target | null>(null);
  const [tab, setTab] = useState<'tribe' | 'chronicle'>('tribe');
  const [tribeFilter, setTribeFilter] = useState<TribeFilter>('all');
  const [tribeSort, setTribeSort] = useState<'original' | 'urgent'>('original');
  const [tribeTask, setTribeTask] = useState<TribeTask>('any');
  const [helpWordId, setHelpWordId] = useState<string | null>(null);
  const [councilInspection, setCouncilInspection] = useState(false);
  const [filter, setFilter] = useState<WordKind | 'all' | 'compatible'>('compatible');
  const [wordSearch, setWordSearch] = useState('');
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
  const [contextualNotices, setContextualNotices] = useState<string[]>([]);
  const contextualSnapshot = useRef({ game, session: mapSession });
  const [newMode, setNewMode] = useState<'guided' | 'classic'>(game.playMode ?? 'guided');
  const [newMap, setNewMap] = useState<MapChoice>(
    game.mapGeneration?.mode ?? (game.started ? 'random' : 'seed-zero'),
  );
  const [newSeed, setNewSeed] = useState(game.mapGeneration ? String(game.mapGeneration.seed) : '');
  const newMapValid = newMap === 'seed-zero' || mapSeedValid(newSeed);
  const [pauseOnEvents, setPauseOnEvents] = useState(() =>
    loadEventPause(game.playMode === 'guided'),
  );
  const [dismissedEvents, setDismissedEvents] = useState<Set<string>>(() => new Set());
  const [focusRequest, setFocusRequest] = useState<{ x: number; y: number; nonce: number }>();
  const eventSnapshot = useRef(new Set((game.tribeEvents ?? []).map((event) => event.id)));
  const sparkSnapshot = useRef(new Set(game.sparks.map((spark) => spark.id)));
  const [sound, setSound] = useState(false);
  const [lexiconSearch, setLexiconSearch] = useState('');
  const [hasSeenMilestone, setHasSeenMilestone] = useState(!!game.victory);
  const [recentPhrases, setRecentPhrases] = useState<string[][]>([]);
  const [taskOutcomes, setTaskOutcomes] = useState<TaskOutcome[]>([]);
  const outcomeSnapshot = useRef(game);
  const [orderFeedback, setOrderFeedback] = useState<{
    from: { x: number; y: number }[];
    to: { x: number; y: number };
    time: number;
  } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const sentenceSlotsRef = useRef<HTMLDivElement>(null);
  const previousSentenceLength = useRef(0);
  const personDetailsRef = useRef<HTMLDivElement>(null);
  const { unlockFromGesture } = useGameAudio(game, sound, {
    ambience: !panel,
    sessionKey: mapSession,
  });
  const gameRef = useRef(game);
  gameRef.current = game;
  const season = getSeason(game);
  const slots = cognitiveSlots(game);
  const numbered = hasWord(game, 'O_08');
  const individuality = hasWord(game, 'S_02');
  const quantity = (value: number) => describeQuantity(value, numbered);
  const stockQuantity = (value: number) => describeStockQuantity(value, numbered, true);
  const voiceMax = hasWord(game, 'S_07') ? 5 : 3;
  const known = WORD_ORDER.filter((id) => hasWord(game, id));
  const unreadEvents = (game.tribeEvents ?? []).filter((event) => !dismissedEvents.has(event.id));
  const objective = getObjective(game);
  const survivalAdvice = getSurvivalAdvice(game);
  const compilation = compileSentence(game, sentence, target ?? undefined);
  const bankSentence = mobile && editingSlot !== null ? sentence.slice(0, editingSlot) : sentence;
  const syntax = getSyntaxSuggestions(game, bankSentence);
  const compatibleWords = new Set(syntax.tokenIds);
  const shownPhrases = recentPhrases.length
    ? recentPhrases
    : STARTER_PHRASES.filter((phrase) => !phraseRecallIssue(game, phrase));
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
          : target?.type === 'battalion'
            ? (game.battalions.find((b) => b.id === target.id)?.name ?? 'Un battaglione')
            : target
              ? 'Punto sulla mappa'
              : null;
  const livingUnits = game.units.filter(
    (u) => u.hp > 0 && (u.factionId === undefined || u.factionId === 'player'),
  );
  const custodianStatuses = getCustodianStatuses(game);
  const custodianByUnit = new Map(custodianStatuses.map((status) => [status.unitId, status]));
  const endangeredCustodian = !game.urbanized
    ? custodianStatuses.find((status) => status.risk !== 'safe')
    : undefined;
  const selectedCustodian = selectedUnit ? custodianByUnit.get(selectedUnit.id) : undefined;
  const filteredUnits = livingUnits.filter(
    (unit) =>
      matchesTribeFilter(game, unit, tribeFilter, new Set(custodianByUnit.keys())) &&
      matchesTribeTask(unit, tribeTask),
  );
  if (tribeSort === 'urgent') {
    const priority = (unit: (typeof livingUnits)[number]) =>
      (unit.temp <= 20 ? 8 : 0) +
      (unit.hunger >= 95 ? 8 : unit.hunger >= 75 ? 3 : 0) +
      (unit.hp <= 30 ? 8 : 0) +
      (custodianByUnit.get(unit.id)?.risk === 'critical'
        ? 4
        : custodianByUnit.get(unit.id)?.risk === 'ageing'
          ? 1
          : 0);
    filteredUnits.sort((a, b) => priority(b) - priority(a));
  }
  const transmissionHint = (status: CustodianStatus) => {
    if (!hasWord(game, 'O_05')) return 'Proteggi questa memoria finché potrai tramandarla.';
    if (!hasBuilding(game, 'campfire')) return 'Per tramandare serve un falò acceso.';
    if (game.attention < 10)
      return canPrepareBriefLesson(game)
        ? 'Puoi preparare una lezione con il legno già nelle scorte.'
        : 'Apri il Falò per scegliere una parola e scoprire cosa serve per insegnarla.';
    if (!status.wordIds.some((id) => canTransmitWord(game, id)))
      return 'Non ci sono allievi disponibili per queste parole.';
    return 'Un nuovo custode può tenere viva questa memoria.';
  };
  const peopleCount = playerPopulation(game);
  const avgHunger = livingUnits.length
    ? livingUnits.reduce((n, u) => n + u.hunger, 0) / livingUnits.length
    : 0;
  const tribeInDanger = livingUnits.some(
    (unit) => unit.temp <= 20 || unit.hunger >= 95 || unit.hp <= 30,
  );
  const tribeCondition = livingUnits.some((unit) => unit.temp <= 20)
    ? 'Freddo intenso'
    : livingUnits.some((unit) => unit.hunger >= 95)
      ? 'Fame estrema'
      : livingUnits.some((unit) => unit.hp <= 30)
        ? 'Ferite gravi'
        : avgHunger > 75
          ? 'Affamata'
          : avgHunger > 45
            ? 'In cerca di cibo'
            : 'Al sicuro';
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
    const previous = contextualSnapshot.current;
    contextualSnapshot.current = { game, session: mapSession };
    if (previous.session !== mapSession || game.time < previous.game.time) {
      setContextualNotices([]);
      return;
    }
    const learned = newContextualDiscoveries(previous.game, game);
    setContextualNotices((current) => {
      const live = current.filter(
        (id) =>
          hasWord(game, id) &&
          game.time - (game.eventTimes[contextualDiscoveryKey(id)] ?? -Infinity) <= 18,
      );
      return learned.length
        ? [...new Set([...live, ...learned])]
        : live.length === current.length
          ? current
          : live;
    });
  }, [game, mapSession]);

  useEffect(() => {
    const previous = outcomeSnapshot.current;
    outcomeSnapshot.current = game;
    const incoming = observeTaskOutcomes(previous, game);
    if (incoming.length) setTaskOutcomes((current) => appendTaskOutcomes(current, incoming));
  }, [game]);

  useEffect(() => {
    if (editingSlot !== null && editingSlot >= sentence.length) setEditingSlot(null);
  }, [editingSlot, sentence.length]);

  useEffect(() => {
    const lengthChanged = previousSentenceLength.current !== sentence.length;
    previousSentenceLength.current = sentence.length;
    // Replacing a word keeps its position in view; only advancing/removing a
    // slot or explicitly choosing another one should move the phone strip.
    if (mobile && !lengthChanged && editingSlot === null) return;
    const strip = sentenceSlotsRef.current;
    if (!strip || strip.scrollWidth <= strip.clientWidth) return;
    const next = strip.children[editingSlot ?? Math.min(sentence.length, slots - 1)] as
      | HTMLElement
      | undefined;
    if (!next) return;
    const visible = strip.getBoundingClientRect(),
      slot = next.getBoundingClientRect();
    if (slot.right > visible.right) strip.scrollLeft += slot.right - visible.right;
    else if (slot.left < visible.left) strip.scrollLeft += slot.left - visible.left;
  }, [sentence, slots, mobile, editingSlot]);

  useEffect(() => {
    if (target?.type === 'unit') personDetailsRef.current?.scrollIntoView({ block: 'nearest' });
  }, [target?.type, target?.id, mobileSection]);

  useEffect(() => {
    const events = game.tribeEvents ?? [];
    const fresh = events.some((event) => !eventSnapshot.current.has(event.id));
    const idea = game.sparks.some((spark) => !sparkSnapshot.current.has(spark.id));
    eventSnapshot.current = new Set(events.map((event) => event.id));
    sparkSnapshot.current = new Set(game.sparks.map((spark) => spark.id));
    if (pauseOnEvents && game.started && (fresh || idea))
      setGame((current) => (current.paused ? current : { ...current, paused: true }));
  }, [game.tribeEvents, game.sparks, game.started, pauseOnEvents]);

  useEffect(() => {
    try {
      localStorage.setItem('lingus.pause-events', String(pauseOnEvents));
    } catch {
      /* Optional preference. */
    }
  }, [pauseOnEvents]);

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
    if (!game.campfirePending && councilInspection) setCouncilInspection(false);
    if (game.campfirePending && !panel && !game.gameOver && !councilInspection)
      setPanel('campfire');
    if (game.victory && !hasSeenMilestone && !panel) {
      setHasSeenMilestone(true);
      setPanel('milestone');
    }
  }, [
    game.campfirePending,
    game.victory,
    game.gameOver,
    hasSeenMilestone,
    panel,
    councilInspection,
  ]);

  useEffect(() => {
    const keydown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).matches('input,textarea,select') || panel) return;
      // A focused control keeps native Enter/Space activation. Recalling a
      // phrase or choosing a word must never also pronounce the old sentence.
      if (
        ['Enter', 'NumpadEnter', 'Space'].includes(e.code) &&
        (e.target as HTMLElement).closest('button,a,summary,[role="button"]')
      )
        return;
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

  function addWord(id: string, fromPalette = false) {
    if (mobile && editingSlot !== null && editingSlot < sentence.length) {
      const next = sentence.map((word, index) => (index === editingSlot ? id : word));
      setSentence(next);
      setEditingSlot(null);
      setWordSearch('');
      const completion = getSyntaxSuggestions(game, next);
      if (fromPalette && completion.isComplete && !completion.hasContinuations) closeWordBank();
      return;
    }
    if (sentence.length >= slots) {
      notify(
        'Non ci sono altri spazi nella frase. Modifica una parola o amplia il linguaggio della tribù.',
      );
      return;
    }
    const next = [...sentence, id];
    setSentence(next);
    setWordSearch('');
    const completion = getSyntaxSuggestions(game, next);
    if (fromPalette && completion.isComplete && !completion.hasContinuations) closeWordBank();
  }

  function closeWordBank() {
    setWordBankCloseRequest((request) => request + 1);
    setEditingSlot(null);
  }

  useEffect(() => {
    if (mobile && (panel || mobileSection !== 'map')) closeWordBank();
  }, [mobile, panel, mobileSection]);

  function editSentenceSlot(index: number) {
    if (!mobile) {
      if (sentence[index]) setSentence((current) => current.filter((_, at) => at !== index));
      return;
    }
    setEditingSlot(sentence[index] ? index : null);
    setWordSearch('');
    setFilter('compatible');
    setWordBankRequest((request) => request + 1);
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
    notify('Il gruppo comprende gli adulti entro 15 m dal punto scelto.');
  }

  function chooseAllAdults() {
    setGroupAnchor(allAdultsAnchor(game));
    setSelectingGroup(false);
    notify(
      'Selezionati tutti gli adulti disponibili, anche lontani dal campo. Bambini, visitatori e persone in missione sono esclusi.',
    );
  }

  function gatherAtCamp() {
    const destination = tribeRecallDestination(game);
    const next = recallTribe(game);
    const success = orderAcknowledged(game, next);
    setGame(next);
    if (success) {
      setRecentPhrases((phrases) => rememberRecentPhrase(phrases, ['S_01', 'V_01']));
      setGroupAnchor(allAdultsAnchor(game));
      setFocusRequest({ ...destination, nonce: Date.now() });
      setMobileSection('map');
    }
    notify(
      success
        ? 'Richiamo inviato: gli adulti si dirigono al riparo più protetto vicino al campo.'
        : next.logs[0]?.id !== game.logs[0]?.id
          ? (next.logs[0]?.text ?? 'Il richiamo non può essere eseguito.')
          : 'Non ci sono adulti disponibili per il richiamo.',
    );
  }

  function applyRecentPhrase(words: string[]) {
    const issue = phraseRecallIssue(game, words);
    if (issue) {
      notify(issue);
      return;
    }
    setSentence([...words]);
    const check = compileSentence(game, words, target ?? undefined);
    notify(
      `Frase richiamata: ${words.map((id) => WORDS[id].label).join(' · ')}.${check.valid ? ' Scegli o verifica il bersaglio, poi pronuncia.' : ` ${check.message}`}`,
    );
  }

  function focusTarget(picked: Target, inspect = false) {
    setTarget(picked);
    setSelectingGroup(false);
    if (
      picked.id &&
      ((picked.type === 'unit' &&
        game.units.some(
          (u) => u.id === picked.id && u.hp > 0 && (!u.factionId || u.factionId === 'player'),
        )) ||
        (picked.type === 'city' &&
          game.cities.some((c) => c.id === picked.id && c.factionId === 'player')) ||
        (picked.type === 'battalion' &&
          game.battalions.some((b) => b.id === picked.id && b.factionId === 'player')))
    )
      setExecutorId(picked.id);
    setFocusRequest({ x: picked.x, y: picked.y, nonce: Date.now() });
    setMobileSection(inspect ? 'tribe' : 'map');
    if (inspect) setTab('tribe');
  }

  function inspectPerson(id: string) {
    const unit = game.units.find((u) => u.id === id && u.hp > 0);
    if (unit) focusTarget({ type: 'unit', id, x: unit.x, y: unit.y }, true);
  }

  function preparePhrase(words: string[], destination?: Target) {
    const issue = phraseRecallIssue(game, words);
    if (issue) {
      notify(issue);
      return;
    }
    setSentence([...words]);
    setWordSearch('');
    setFilter('compatible');
    setPanel(null);
    setMobileSection('map');
    if (destination) focusTarget(destination);
    notify(
      'Frase pronta da controllare. Apri l’anteprima per vedere chi agirà e dove, poi premi Pronuncia.',
    );
  }

  function showWordHelp(id: string) {
    setHelpWordId(id);
    setPanel('word-help');
  }

  function pronounce() {
    if (game.campfirePending) {
      notify('Concludi il consiglio al falò prima di inviare un nuovo ordine.');
      return;
    }
    const result = compileSentence(game, sentence, target ?? undefined);
    if (!result.valid) {
      notify(result.message);
      return;
    }
    if (result.requiresTarget && !target) {
      notify('Scegli un bersaglio sulla mappa, poi pronuncia la frase.');
      return;
    }
    if (game.voice < 1 && !['law', 'dogma', 'tradition'].includes(result.kind ?? 'direct')) {
      notify('Non hai abbastanza Voce. Recuperi un punto ogni 10 secondi.');
      return;
    }
    const next = issueCommand(game, sentence, target ?? undefined, executorId, groupAnchor);
    const success = orderAcknowledged(game, next);
    setGame(next);
    if (success) {
      closeWordBank();
      setRecentPhrases((prev) => rememberRecentPhrase(prev, sentence));
      if (target) {
        const liveTarget =
          target.type === 'entity'
            ? (game.entities.find((e) => e.id === target.id) ?? target)
            : target;
        let sources: { x: number; y: number }[] = [];
        if (sentence.includes('S_01')) {
          sources = game.units
            .filter(
              (u) =>
                u.hp > 0 &&
                (isAllAdultsAnchor(groupAnchor)
                  ? selectableTribeAdults(game).some((person) => person.id === u.id)
                  : Math.hypot(u.x - groupAnchor.x, u.y - groupAnchor.y) <= 15),
            )
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
        : (next.logs[0]?.text ?? 'La tribù non può eseguire questo ordine.'),
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

  function rememberDiscovery() {
    if (!currentSpark || !canRecallSpark(game, currentSpark.id)) return;
    const next = recallSpark(game, currentSpark.id);
    setGame(next);
    if (hasWord(next, currentSpark.wordId)) {
      closePanel();
      notify(
        `La tribù ritrova «${WORDS[currentSpark.wordId].label}» nell’esperienza appena vissuta.`,
      );
    }
  }

  function saveGame() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(game));
      notify('Partita salvata in questo browser.');
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
      setMapSession((session) => session + 1);
      setFocusRequest(undefined);
      setSelectingGroup(false);
      setOrderFeedback(null);
      setSentence([]);
      setRecentPhrases([]);
      setTaskOutcomes([]);
      outcomeSnapshot.current = parsed;
      setWordSearch('');
      setFilter('compatible');
      setTarget(null);
      setPanel(null);
      setHasSeenMilestone(!!parsed.victory);
      setGroupAnchor({ type: 'point', ...parsed.home });
      setExecutorId(undefined);
      setTribeFilter('all');
      setTribeSort('original');
      setTribeTask('any');
      setHelpWordId(null);
      setCouncilInspection(false);
      setNewMode(parsed.playMode ?? 'classic');
      setNewMap(parsed.mapGeneration?.mode ?? 'random');
      setNewSeed(parsed.mapGeneration ? String(parsed.mapGeneration.seed) : '');
      setDismissedEvents(new Set());
      eventSnapshot.current = new Set((parsed.tribeEvents ?? []).map((event) => event.id));
      sparkSnapshot.current = new Set(parsed.sparks.map((spark) => spark.id));
      notify('Partita importata in pausa.');
    } catch {
      notify('Impossibile aprire il file. Scegli un salvataggio di Lingus in formato JSON.');
    }
    if (fileInput.current) fileInput.current.value = '';
  }

  function previewMap(map: MapChoice, seedText: string, mode = newMode, chooseNew = false) {
    if (panel !== 'welcome' || (map === 'random' && !mapSeedValid(seedText))) return;
    setGame((current) => {
      const seed =
        map === 'seed-zero'
          ? 6842
          : (parseMapSeed(seedText) ??
            (!chooseNew && current.mapGeneration?.mode === 'random'
              ? current.mapGeneration.seed
              : freshMapSeed(current.mapGeneration?.seed)));
      return createGame(seed, mode, map);
    });
  }

  function changeMap(map: MapChoice) {
    setNewMap(map);
    previewMap(map, newSeed);
  }

  function changeMapSeed(seed: string) {
    setNewSeed(seed);
    previewMap(newMap, seed, newMode, seed.trim() === '');
  }

  function chooseNewSeed() {
    const seed = String(freshMapSeed(parseMapSeed(newSeed) ?? game.mapGeneration?.seed));
    setNewSeed(seed);
    previewMap(newMap, seed);
  }

  function openRestart() {
    setNewMode(game.playMode ?? 'classic');
    setNewMap(game.mapGeneration?.mode ?? 'random');
    setNewSeed(String(freshMapSeed(game.mapGeneration?.seed)));
    setPanel('restart');
  }

  function restart() {
    if (!newMapValid) return;
    const seed =
      newMap === 'seed-zero'
        ? 6842
        : (parseMapSeed(newSeed) ?? freshMapSeed(game.mapGeneration?.seed));
    const fresh = { ...createGame(seed, newMode, newMap), started: true };
    setGame(fresh);
    setMapSession((session) => session + 1);
    setFocusRequest(undefined);
    setSelectingGroup(false);
    setOrderFeedback(null);
    setNewSeed(String(seed));
    setSentence([]);
    setRecentPhrases([]);
    setTaskOutcomes([]);
    outcomeSnapshot.current = fresh;
    setWordSearch('');
    setFilter('compatible');
    setTarget(null);
    setHasSeenMilestone(false);
    setGroupAnchor({ type: 'point', ...fresh.home });
    setExecutorId(undefined);
    setTribeFilter('all');
    setTribeSort('original');
    setTribeTask('any');
    setHelpWordId(null);
    setCouncilInspection(false);
    setPauseOnEvents(newMode === 'guided');
    setDismissedEvents(new Set());
    eventSnapshot.current = new Set();
    sparkSnapshot.current = new Set();
    closePanel();
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(fresh));
    } catch {
      /* Export available. */
    }
  }

  const renderWord = (id: string, inPuzzle = false, fromPalette = false) => {
    const word = WORDS[id],
      memory = game.words[id];
    const suggested = !inPuzzle && suggestedWordIds.has(id);
    const forgotten = !inPuzzle && memory?.retention === 0;
    const compatible = !inPuzzle && !forgotten && compatibleWords.has(id);
    return (
      <button
        key={id}
        className={`word-tile word-${word.kind} ${memory && memory.retention < 25 ? 'word-fragile' : ''} ${suggested ? 'word-suggested' : ''} ${forgotten ? 'word-forgotten' : ''} ${compatible ? 'word-compatible' : ''}`}
        aria-description={compatible ? 'Suggerita per il prossimo spazio della frase.' : undefined}
        aria-label={
          forgotten
            ? `${word.label}: parola perduta. ${forgottenWordHint(game, id)}`
            : `${word.label}: ${word.description}${suggested ? ' (consigliata per il bersaglio)' : ''}`
        }
        title={
          forgotten
            ? forgottenWordHint(game, id)
            : `${word.description}${suggested ? ' · Consigliata per il bersaglio attuale' : ''}`
        }
        disabled={forgotten}
        draggable={!inPuzzle && !forgotten}
        onDragStart={(e) => e.dataTransfer.setData('application/lingus-word', id)}
        onClick={() =>
          inPuzzle
            ? setPuzzle((p) => (p.length < (currentSpark?.recipe.length ?? 3) ? [...p, id] : p))
            : addWord(id, fromPalette)
        }
      >
        <span className="word-glyph">
          <Glyph id={id} size={25} />
        </span>
        <span className="word-label">{word.label}</span>
        <span className="word-kind">{forgotten ? 'Da riscoprire' : KIND_NAMES[word.kind]}</span>
        {memory && !INNATE_WORDS.includes(id) && (
          <span className="retention-line">
            <span style={{ width: `${memory.retention}%` }} />
          </span>
        )}
      </button>
    );
  };

  const nearbySelectionControls = () => (
    <>
      <button
        className="text-button"
        data-map-selection
        onClick={() => setSelectingGroup((value) => !value)}
      >
        <Users size={13} />
        {selectingGroup ? 'Indica il centro sulla mappa' : 'Scegli il gruppo'}
        <span>raggio 15 m</span>
      </button>
      <button
        className="text-button camp-button"
        onClick={() => handleSetGroupAnchor({ type: 'point', ...game.home })}
        title="Seleziona gli adulti entro quindici metri dal giaciglio, senza impartire ordini"
      >
        <Home size={12} /> Vicini al campo
      </button>
      {sentence.includes('S_02') && (
        <span>
          Io: {game.units.find((unit) => unit.id === executorId)?.name ?? 'scegli un individuo'}
        </span>
      )}
      {selectingGroup && (
        <button className="text-button" onClick={() => setSelectingGroup(false)}>
          Annulla
        </button>
      )}
    </>
  );

  return (
    <div
      className={`app tier-${game.tier} ${season.isNight && game.started ? 'night-mode' : ''} ${keyboardOpen ? 'is-mobile-keyboard' : ''} ${wordBankOpen ? `word-bank-open word-bank-${wordBankMode}` : ''}`}
    >
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
              if (!sound && !unlockFromGesture()) {
                notify('Audio non disponibile su questo browser.');
                return;
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
                {stockQuantity(game.resources.food + game.resources.meat + game.resources.cooked)}
                <small>Cibo</small>
              </span>
              <span title="Legno disponibile">
                <TreePine size={15} />
                {stockQuantity(game.resources.wood)}
                <small>Legno</small>
              </span>
              <span title="Pietra disponibile">
                <Glyph id="O_02" size={15} />
                {stockQuantity(game.resources.stone)}
                <small>Pietra</small>
              </span>
            </>
          )}
          {hasWord(game, 'C_01') && (
            <span className="season-chip">
              {season.isNight ? <Glyph id="C_01" size={15} /> : <Sun size={15} />}
              {hasWord(game, 'M_02')
                ? `${season.name}${numbered ? ` · Anno ${season.year}` : ''}`
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
                  {livingUnits.length === 7
                    ? 'Sette vite.'
                    : peopleCount === 1
                      ? 'Una vita.'
                      : `${peopleCount} vite.`}{' '}
                  Un destino comune.
                </p>
              </div>
              <div className="tribe-summary">
                <span>
                  <Users size={17} />
                  <b>{peopleCount}</b> {peopleCount === 1 ? 'anima' : 'anime'}
                </span>
                <span
                  className={tribeInDanger || avgHunger > 70 ? 'text-danger' : ''}
                  role="status"
                  aria-label="Condizioni della tribù"
                >
                  <span
                    className={`status-dot ${tribeInDanger || avgHunger > 70 ? 'amber' : ''}`}
                  />
                  {tribeCondition}
                </span>
                {tribeInDanger && (
                  <button
                    className="text-button tribe-urgent-shortcut"
                    aria-pressed={tribeFilter === 'urgent'}
                    onClick={() => {
                      setTribeFilter(tribeFilter === 'urgent' ? 'all' : 'urgent');
                      setTribeSort('urgent');
                    }}
                  >
                    {tribeFilter === 'urgent' ? 'Tutta la tribù' : 'Mostra urgenze'}
                  </button>
                )}
              </div>
              {game.urbanized && (
                <button className="urban-summary-card" onClick={() => setPanel('settlement')}>
                  <Glyph id="S_09" size={30} />
                  <strong>
                    {game.cities.filter((c) => c.factionId === 'player').length} città
                  </strong>
                  <span>{quantity(peopleCount)} abitanti divisi tra quattro gruppi sociali</span>
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
                  <details className="custodian-explanation">
                    <summary>Come proteggere questa memoria</summary>
                    <p className="custodian-help">
                      {hasWord(game, 'O_06')
                        ? 'Se il custode muore, queste parole scompaiono. '
                        : 'Queste parole vivono in una sola memoria. '}
                      {transmissionHint(endangeredCustodian)}
                    </p>
                  </details>
                  {hasWord(game, 'O_05') && (
                    <button
                      className="custodian-transmit"
                      disabled={!hasBuilding(game, 'campfire')}
                      onClick={() => setPanel('campfire')}
                    >
                      <Flame size={13} /> Tramanda al falò <ChevronRight size={12} />
                    </button>
                  )}
                </div>
              )}
              {!game.urbanized && (
                <details className="tribe-tools" aria-label="Gestione della tribù" key={mapSession}>
                  <summary>
                    Filtri e priorità
                    {tribeFilter !== 'all' || tribeTask !== 'any' ? ' · filtro attivo' : ''}
                  </summary>
                  <div className="tribe-filters" role="group" aria-label="Filtra la tribù">
                    {(
                      [
                        ['all', 'Tutti'],
                        ['urgent', 'In difficoltà'],
                        ['idle', 'Senza incarico'],
                        ['working', 'Al lavoro'],
                        ['recovering', 'In recupero'],
                        ['custodians', 'Ultimi custodi'],
                        ['young', 'Bambini'],
                      ] as const
                    ).map(([value, label]) => (
                      <button
                        key={value}
                        aria-pressed={tribeFilter === value}
                        onClick={() => setTribeFilter(value)}
                      >
                        {label}
                        {numbered
                          ? ` (${livingUnits.filter((u) => matchesTribeFilter(game, u, value, new Set(custodianByUnit.keys()))).length})`
                          : ''}
                      </button>
                    ))}
                  </div>
                  <label>
                    Attività
                    <select
                      aria-label="Filtra per attività"
                      value={tribeTask}
                      onChange={(event) => setTribeTask(event.target.value as TribeTask)}
                    >
                      <option value="any">Tutte le attività</option>
                      <option value="transport">Trasporto</option>
                      <option value="gathering">Raccolta e caccia</option>
                      <option value="craft">Artigianato e cucina</option>
                      <option value="guard">Sorveglianza</option>
                      <option value="building">Costruzione</option>
                      <option value="assigned">Incarichi agli edifici</option>
                    </select>
                  </label>
                  <label>
                    Ordine dell’elenco
                    <select
                      aria-label="Ordina la tribù"
                      value={tribeSort}
                      onChange={(event) =>
                        setTribeSort(event.target.value as 'original' | 'urgent')
                      }
                    >
                      <option value="original">Ordine abituale</option>
                      <option value="urgent">Prima le urgenze</option>
                    </select>
                  </label>
                </details>
              )}
              {selectedUnit && (
                <div className="individual-card person-details" ref={personDetailsRef}>
                  <div>
                    <span className="eyebrow">
                      {visibleUnitName(game, selectedUnit).toUpperCase()} ·{' '}
                      {numbered
                        ? `${Math.floor(selectedUnit.age)} STAGIONI`
                        : lifeStageLabel(selectedUnit).toUpperCase()}
                    </span>
                    <button
                      className="icon-button small"
                      aria-label="Deseleziona individuo"
                      onClick={() => setTarget(null)}
                    >
                      <X size={13} />
                    </button>
                  </div>
                  <p className="person-demographics">
                    {sexLabel(selectedUnit)} · {lifeStageLabel(selectedUnit)}
                    {individuality && selectedUnit.parentIds && (
                      <>
                        {' '}
                        · Genitori:{' '}
                        {selectedUnit.parentIds
                          .map(
                            (id) =>
                              game.units.find((unit) => unit.id === id)?.name ?? 'un compagno',
                          )
                          .join(' e ')}
                      </>
                    )}
                  </p>
                  <p className="person-life-hint">{unitLifeHint(selectedUnit)}</p>
                  <UnitWorkStatus state={game} unit={selectedUnit} onFocus={focusTarget} />
                  <button
                    className="text-button"
                    onClick={() =>
                      focusTarget({
                        type: 'unit',
                        id: selectedUnit.id,
                        x: selectedUnit.x,
                        y: selectedUnit.y,
                      })
                    }
                  >
                    <MapPin size={12} /> Inquadra sulla mappa
                  </button>
                  <IndividualGrowthReadiness state={game} unit={selectedUnit} />
                  {physicalWarnings(selectedUnit).length > 0 && (
                    <p className="person-danger">
                      {physicalWarnings(selectedUnit)
                        .map((warning) => warning.label)
                        .join(' · ')}
                    </p>
                  )}
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
                        <MessageCircle size={13} /> {lastCustodianLabel(selectedUnit)}
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
              <div className="unit-list" aria-label="Membri della tribù">
                {!game.urbanized &&
                  filteredUnits.map((unit) => {
                    const spark = game.sparks.find((s) => s.unitId === unit.id);
                    return (
                      <TribeMemberCard
                        key={unit.id}
                        state={game}
                        unit={unit}
                        index={livingUnits.indexOf(unit)}
                        selected={target?.id === unit.id}
                        custodian={custodianByUnit.get(unit.id)}
                        onActivate={() => {
                          if (spark) openSpark(spark);
                          else {
                            focusTarget({ type: 'unit', id: unit.id, x: unit.x, y: unit.y }, true);
                          }
                        }}
                      />
                    );
                  })}
                {!game.urbanized && !filteredUnits.length && (
                  <p className="empty-tribe-filter">
                    Nessun compagno in questa categoria.{' '}
                    <button
                      className="text-button"
                      onClick={() => {
                        setTribeFilter('all');
                        setTribeTask('any');
                      }}
                    >
                      Mostra tutti
                    </button>
                  </p>
                )}
              </div>
              <div className="community-outlook">
                <GrowthReadiness state={game} />
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
              </div>
              {selectedBuilding && (
                <div className="selected-work-details">
                  <BuildingWorkStatus
                    state={game}
                    building={selectedBuilding}
                    onFocus={focusTarget}
                    onCompose={preparePhrase}
                  />
                </div>
              )}
              {ownedBuildings.length > 0 && (
                <div className="village-card">
                  <span className="eyebrow">IL NOSTRO LUOGO</span>
                  <div className="building-list">
                    {ownedBuildings.map((b) => (
                      <button
                        key={b.id}
                        title={
                          b.completed === false
                            ? 'Costruzione in corso'
                            : b.hp <= 0
                              ? 'Distrutto'
                              : b.active
                                ? 'Seleziona per vedere chi ci lavora e cosa produce'
                                : 'Seleziona per scoprire cosa impedisce il lavoro'
                        }
                        onClick={() =>
                          focusTarget({ type: 'building', id: b.id, x: b.x, y: b.y }, true)
                        }
                      >
                        <Glyph
                          id={
                            b.kind === 'campfire' ? 'O_05' : b.kind === 'menhir' ? 'M_03' : 'V_08'
                          }
                          size={16}
                        />
                        <span>{BUILDING_NAMES[b.kind]}</span>
                        <span
                          className={`status-dot ${!b.active || b.completed === false || b.hp <= 0 ? 'amber' : ''}`}
                        />
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <SeasonReadiness
                state={game}
                onFocus={focusTarget}
                onCompose={preparePhrase}
                onRecipes={() => setPanel('recipes')}
              />
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
          <div className="map-notices" role="region" aria-label="Avvisi della valle" tabIndex={0}>
            {contextualNotices[0] && (
              <ContextualDiscoveryNotice
                wordId={contextualNotices[0]}
                rediscovered={
                  (game.bornWords?.[contextualNotices[0]] ?? game.time) <
                  game.eventTimes[contextualDiscoveryKey(contextualNotices[0])]
                }
                onInspect={(id) => {
                  setContextualNotices((current) => current.filter((word) => word !== id));
                  setLexiconSearch(WORDS[id].label);
                  setPanel('lexicon');
                }}
                onDismiss={() => setContextualNotices((current) => current.slice(1))}
              />
            )}
            {survivalAdvice ? (
              <SurvivalAdvisor
                state={game}
                advice={survivalAdvice}
                onRecall={gatherAtCamp}
                onTeach={() => setPanel('campfire')}
                onFocus={focusTarget}
                onCompose={(words, destination) => {
                  if (!destination) setTarget(null);
                  preparePhrase(words, destination);
                }}
              />
            ) : (
              <OpeningGuide
                state={game}
                onSpark={(id) => {
                  const spark = game.sparks.find((entry) => entry.id === id);
                  if (spark) openSpark(spark);
                }}
                onTeach={() => setPanel('campfire')}
                onHome={() => {
                  setFocusRequest({ ...game.home, nonce: Date.now() });
                  setTarget({ type: 'point', ...game.home });
                }}
              />
            )}
            {!survivalAdvice && (
              <TaskOutcomes
                state={game}
                outcomes={taskOutcomes}
                onCompose={(words, destination) => {
                  if (!destination) setTarget(null);
                  preparePhrase(words, destination);
                }}
                onFocus={focusTarget}
                onDismiss={(id) =>
                  setTaskOutcomes((items) => items.filter((item) => item.id !== id))
                }
              />
            )}
            <ForeignPressure
              state={game}
              onResolve={(id, choice) =>
                setGame((current) => resolveForeignUltimatum(current, id, choice))
              }
              onFocus={(point) => {
                setMobileSection('map');
                setFocusRequest({ x: point.x, y: point.y, nonce: Date.now() });
              }}
            />
            {game.campfirePending && councilInspection && (
              <div className="council-inspection" role="status">
                <Flame size={14} />
                <span>Consiglio in attesa · il tempo resta fermo.</span>
                <button
                  className="text-button"
                  onClick={() => {
                    setCouncilInspection(false);
                    setPanel('campfire');
                  }}
                >
                  Torna al consiglio
                </button>
              </div>
            )}
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
          </div>
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
              key={mapSession}
              state={game}
              onInspectStocks={() => setPanel('stocks')}
              focusRequest={focusRequest}
              selectedTarget={target}
              groupAnchor={groupAnchor}
              isGroupActive={sentence.includes('S_01')}
              orderFeedback={orderFeedback}
              onSelectGroupAnchor={handleSetGroupAnchor}
              onSelect={(picked) => {
                if (wordBankMode === 'catalog') closeWordBank();
                if (selectingGroup) {
                  handleSetGroupAnchor(picked);
                } else {
                  setTarget(picked);
                  if (
                    (picked.type === 'unit' &&
                      game.units.some(
                        (u) => u.id === picked.id && (!u.factionId || u.factionId === 'player'),
                      )) ||
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
              selectingGroup={selectingGroup}
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
                className="icon-button preparation-button"
                onClick={() => setPanel('readiness')}
                aria-label="Controlla la prossima stagione"
                title="Preparazione alla prossima stagione"
              >
                <Leaf size={15} />
                <span>Preparazione</span>
              </button>
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
          {selectedBuilding && (
            <div className="map-work-details">
              <BuildingWorkStatus
                state={game}
                building={selectedBuilding}
                onFocus={focusTarget}
                onCompose={preparePhrase}
              />
            </div>
          )}
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
                Le idee nascono dall’esperienza.
                <br />
                Lavora, esplora e segui le Scintille.
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
              <span>Le nuove parole nascono dall’esperienza</span>
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
        className={`language-workbench mobile-ergonomic ${mobileSection !== 'map' ? 'mobile-hidden' : ''}`}
        aria-label="Costruttore di frasi"
      >
        <div className="composer-topline">
          <div>
            <span className="eyebrow">LA TUA VOCE</span>
            <h2>Dai forma a un pensiero.</h2>
          </div>
          <div
            className="voice-meter"
            title="Ogni ordine diretto costa un punto Voce. Ne recuperi uno ogni 10 secondi."
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
            {!game.urbanized && (
              <button
                className={`text-button all-adults-button ${isAllAdultsAnchor(groupAnchor) ? 'active' : ''}`}
                aria-pressed={isAllAdultsAnchor(groupAnchor)}
                onClick={chooseAllAdults}
                title="Seleziona tutti gli adulti disponibili, anche lontani dal campo. La selezione è gratuita e non impartisce ordini."
              >
                <Users size={13} /> Tutti gli adulti
              </button>
            )}
            {!game.urbanized && (
              <button
                className="text-button recall-tribe-button"
                onClick={gatherAtCamp}
                disabled={
                  !game.started ||
                  !!game.gameOver ||
                  !!game.victory ||
                  game.campfirePending ||
                  game.voice < 1 ||
                  !selectableTribeAdults(game).length
                }
                title="Richiama gli adulti al riparo vicino al campo. Costa un punto Voce e sostituisce gli incarichi in corso. I carichi trasportati restano a terra."
              >
                <Home size={16} />
                <span className="recall-label">
                  Raduna al campo<small aria-hidden="true">1 Voce</small>
                </span>
              </button>
            )}
            <div className="secondary-selection-controls">
              {nearbySelectionControls()}
              <span className="group-hint desktop-only-hints">
                (oppure doppio click o tasto destro sulla mappa)
              </span>
            </div>
          </div>
          {shownPhrases.length > 0 && (
            <div
              className="echo-shelf desktop-echo-shelf"
              aria-label={recentPhrases.length ? 'Frasi recenti' : 'Frasi suggerite'}
            >
              <span className="echo-label">
                <History size={12} />
                {recentPhrases.length ? 'Echi:' : 'Spunti:'}
              </span>
              {shownPhrases.map((phrase) => {
                const unavailable = phraseRecallIssue(game, phrase);
                const isActive =
                  phrase.length === sentence.length && phrase.every((id, i) => sentence[i] === id);
                return (
                  <button
                    key={phrase.join('|')}
                    type="button"
                    className={`echo-chip ${isActive ? 'active' : ''}`}
                    onClick={() => applyRecentPhrase(phrase)}
                    disabled={!!unavailable}
                    title={
                      unavailable ??
                      'Ricompone la frase senza eseguirla. Controlla il bersaglio selezionato, poi premi Pronuncia.'
                    }
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
            ref={sentenceSlotsRef}
            role="group"
            aria-label="Spazi della frase"
            tabIndex={0}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => dropWord(e)}
          >
            {Array.from({ length: slots }, (_, i) => (
              <div className="slot-group" key={i}>
                {i > 0 && <Plus size={13} className="slot-plus" />}
                <button
                  className={`sentence-slot ${sentence[i] ? `filled word-${WORDS[sentence[i]]?.kind}` : ''} ${editingSlot === i ? 'editing' : ''}`}
                  data-active={
                    mobile &&
                    wordBankOpen &&
                    (editingSlot === i || (editingSlot === null && i === sentence.length))
                  }
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.stopPropagation();
                    dropWord(e, i);
                  }}
                  onClick={() => editSentenceSlot(i)}
                  disabled={mobile && i > sentence.length}
                  aria-pressed={mobile && sentence[i] ? editingSlot === i : undefined}
                  aria-label={
                    sentence[i]
                      ? `${mobile ? 'Modifica' : 'Rimuovi'} ${WORDS[sentence[i]].label}`
                      : `Spazio ${i + 1}: ${i === 0 ? 'chi?' : i === 1 ? 'cosa fa?' : 'con cosa?'}`
                  }
                >
                  {sentence[i] ? (
                    <>
                      <Glyph id={sentence[i]} size={23} />
                      <strong>{WORDS[sentence[i]].label}</strong>
                      {mobile ? (
                        <Pencil size={11} className="slot-edit" />
                      ) : (
                        <X size={11} className="slot-remove" />
                      )}
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
              disabled={
                !game.started || sentence.length < 2 || !!game.gameOver || game.campfirePending
              }
              title={
                game.campfirePending ? 'Concludi prima il consiglio al falò' : 'Pronuncia (Invio)'
              }
            >
              <span>Pronuncia</span>
              <ArrowRight size={18} />
            </button>
          </div>
        </div>
        <div
          className={`sentence-feedback ${sentence.length >= 2 && !compilation.valid ? 'has-issue' : ''}`}
          aria-live="polite"
        >
          <span className={`feedback-dot ${compilation.valid ? 'valid' : ''}`} />
          <span>
            {sentence.length === 0
              ? 'Scegli le parole, indica un bersaglio sulla mappa e premi Pronuncia.'
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
        <OrderPreview
          state={game}
          sentence={sentence}
          target={target ?? undefined}
          executorId={executorId}
          groupAnchor={groupAnchor}
        />
        <MobileActionDock
          targetLabel={targetName}
          onClearTarget={() => setTarget(null)}
          sessionKey={mapSession}
          openRequest={wordBankRequest}
          closeRequest={wordBankCloseRequest}
          onOpenChange={onWordBankOpenChange}
          onModeChange={setWordBankMode}
          compactChildren={({ expand, close }) => (
            <MobileWordPalette
              state={game}
              sentence={bankSentence}
              renderWord={(id) => renderWord(id, false, true)}
              onExpand={() => {
                setFilter('all');
                setWordSearch('');
                expand();
              }}
              onClose={close}
              editingLabel={
                editingSlot !== null
                  ? `Sostituisci ${WORDS[sentence[editingSlot]]?.label ?? 'la parola'}`
                  : undefined
              }
              onRemoveEditingWord={() => {
                if (editingSlot !== null)
                  setSentence((words) => words.filter((_, index) => index !== editingSlot));
                closeWordBank();
              }}
            />
          )}
          onRemoveEditingWord={() => {
            if (editingSlot !== null)
              setSentence((words) => words.filter((_, index) => index !== editingSlot));
            closeWordBank();
          }}
          editingLabel={
            editingSlot !== null
              ? `Sostituisci ${WORDS[sentence[editingSlot]]?.label ?? 'la parola'}`
              : undefined
          }
          compactStatus={
            <span
              className="mobile-voice"
              aria-label={`Voce disponibile: ${Math.floor(game.voice)} su ${voiceMax}`}
            >
              <Wind size={14} />
              <b>
                {Math.floor(game.voice)}/{voiceMax}
              </b>
            </span>
          }
        >
          <ContextualWordShelf
            mobileCatalog
            state={game}
            sentence={bankSentence}
            filter={filter}
            onFilterChange={setFilter}
            search={wordSearch}
            onSearchChange={setWordSearch}
            renderWord={renderWord}
            onOpenLexicon={() => setPanel('lexicon')}
          />
          <details className="mobile-order-tools">
            <summary>Persone e ordini</summary>
            <div className="mobile-selection-controls" aria-label="Selezione vicina sulla mappa">
              {nearbySelectionControls()}
            </div>
            {shownPhrases.length > 0 && (
              <div
                className="echo-shelf mobile-echo-shelf"
                aria-label={recentPhrases.length ? 'Frasi recenti' : 'Frasi suggerite'}
              >
                <span className="echo-label">
                  <History size={12} />
                  {recentPhrases.length ? 'Echi:' : 'Spunti:'}
                </span>
                {shownPhrases.map((phrase) => {
                  const unavailable = phraseRecallIssue(game, phrase);
                  const isActive =
                    phrase.length === sentence.length &&
                    phrase.every((id, i) => sentence[i] === id);
                  return (
                    <button
                      key={phrase.join('|')}
                      type="button"
                      className={`echo-chip ${isActive ? 'active' : ''}`}
                      onClick={() => applyRecentPhrase(phrase)}
                      disabled={!!unavailable}
                      title={
                        unavailable ??
                        'Ricompone la frase senza eseguirla. Controlla il bersaglio selezionato, poi premi Pronuncia.'
                      }
                    >
                      <span className="echo-chip-dot" />
                      {phrase.map((id) => WORDS[id]?.label).join(' · ')}
                    </button>
                  );
                })}
              </div>
            )}
          </details>
        </MobileActionDock>
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

      {unreadEvents.length > 0 && !panel && game.started && (
        <div className="life-notifications">
          <TribeEvents
            state={game}
            events={unreadEvents}
            onInspect={inspectPerson}
            onWord={showWordHelp}
            onFocus={(id) => {
              const unit = game.units.find((u) => u.id === id);
              if (!unit) return;
              setMobileSection('map');
              setTarget({
                type: unit.hp > 0 ? 'unit' : 'point',
                id: unit.hp > 0 ? unit.id : undefined,
                x: unit.x,
                y: unit.y,
              });
              setFocusRequest({ x: unit.x, y: unit.y, nonce: Date.now() });
            }}
          />
          <button
            className="text-button"
            onClick={() =>
              setDismissedEvents(
                (previous) => new Set([...previous, ...acknowledgedTribeEventIds(unreadEvents)]),
              )
            }
          >
            Ho letto <X size={13} />
          </button>
        </div>
      )}
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

      {panel === 'word-help' && helpWordId && WORDS[helpWordId] && (
        <Modal
          title={`Riscoprire ${WORDS[helpWordId].label}`}
          onClose={closePanel}
          className="word-help-modal"
        >
          <span className="eyebrow">UNA MEMORIA DA RITROVARE</span>
          <h2>{WORDS[helpWordId].label}</h2>
          <p className="modal-intro">{forgottenWordHint(game, helpWordId)}</p>
          <div className="recovery-experience">
            <strong>Ricrea l’esperienza</strong>
            <p>{WORDS[helpWordId].event}</p>
            <p>{WORDS[helpWordId].hint}</p>
          </div>
          <p>Quando ricompare la Scintilla, ricomponi questi concetti:</p>
          <div className="recovery-words">
            {WORDS[helpWordId].recipe.map((id, i) => (
              <span key={`${id}-${i}`}>
                {hasWord(game, id) ? WORDS[id].label : 'Un concetto da riscoprire'}
              </span>
            ))}
          </div>
          <p>
            Usa gli ordini per rivivere questa esperienza. Quando appare una Scintilla, aprila per
            ritrovare la parola.
          </p>
          <div className="qol-actions">
            <button
              className="text-button"
              onClick={() => {
                setLexiconSearch(WORDS[helpWordId].label);
                setPanel('lexicon');
              }}
            >
              Apri nel lessico
            </button>
            <button className="text-button" onClick={() => setPanel('recipes')}>
              Costruzioni conosciute
            </button>
          </div>
        </Modal>
      )}
      {panel === 'stocks' && (
        <Modal
          title={game.urbanized ? 'Scorte della capitale' : 'Scorte del campo'}
          onClose={closePanel}
          className="camp-inventory-modal"
        >
          <CampInventoryPanel
            state={game}
            onFocusCamp={() => {
              closePanel();
              setMobileSection('map');
              setFocusRequest({ ...game.home, nonce: Date.now() });
            }}
          />
        </Modal>
      )}
      {panel === 'readiness' && (
        <Modal
          title="Preparazione alla prossima stagione"
          onClose={closePanel}
          className="readiness-modal"
        >
          <h2>Prepariamo il domani.</h2>
          <SeasonReadiness
            expanded
            state={game}
            onFocus={(destination) => {
              closePanel();
              focusTarget(destination);
            }}
            onCompose={preparePhrase}
            onRecipes={() => setPanel('recipes')}
          />
        </Modal>
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
          <ModePicker
            value={newMode}
            onChange={(mode) => {
              setNewMode(mode);
              previewMap(newMap, newSeed, mode);
              setPauseOnEvents(mode === 'guided');
            }}
          />
          <MapPicker
            value={newMap}
            seed={newSeed}
            onChange={changeMap}
            onSeedChange={changeMapSeed}
            onNewSeed={chooseNewSeed}
          />
          <label className="event-pause-setting">
            <input
              type="checkbox"
              checked={pauseOnEvents}
              onChange={(event) => setPauseOnEvents(event.target.checked)}
            />
            <span>
              Pausa sulle Scintille e sugli eventi della tribù
              <small>
                Leggi con calma e riprendi il tempo quando sei pronto. Puoi cambiare questa scelta
                nelle impostazioni.
              </small>
            </span>
          </label>
          <button
            className="primary-button"
            disabled={!newMapValid}
            onClick={() => {
              if (!newMapValid) return;
              setGame((g) => ({ ...g, started: true, paused: false }));
              closePanel();
            }}
          >
            Dai inizio alla storia <ArrowRight size={18} />
          </button>
          <button className="text-button welcome-help" onClick={() => setPanel('guide')}>
            Come si gioca <CircleHelp size={15} />
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
          <span className="eyebrow">OGNI ORDINE COMINCIA CON UNA FRASE.</span>
          <h2>Impara a dire il mondo.</h2>
          <p className="modal-intro">
            Guida la tribù attraverso le parole che conosce. Nuove esperienze daranno voce a nuove
            possibilità.
          </p>
          <div className="guide-steps">
            <article>
              <b>01</b>
              <div>
                <h3>Componi una frase</h3>
                <p>
                  Scegli le parole in basso o trascinale negli spazi. Inizia con{' '}
                  <strong>Gruppo · Colpire</strong>, seleziona un albero sulla mappa e premi{' '}
                  <strong>Pronuncia</strong>. Il lavoro può far nascere la prima intuizione.
                </p>
              </div>
            </article>
            <article>
              <b>02</b>
              <div>
                <h3>Vivi, osserva, comprendi</h3>
                <p>
                  Un’esperienza può accendere una <strong>Scintilla</strong>. Aprila, leggi
                  l’indizio e combina le parole già note per dare un nome a ciò che è accaduto.
                </p>
              </div>
            </article>
            <article>
              <b>03</b>
              <div>
                <h3>Preparati alla notte</h3>
                <p>
                  Le persone si nutrono per istinto. Puoi aiutarle con{' '}
                  <strong>Gruppo · Mangiare</strong> e un cespuglio. Esplora, prepara le scorte e
                  cerca riparo al calare del buio. Le nuove parole renderanno visibili altri aspetti
                  del mondo.
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
              {hasOpeningBalance(game)
                ? 'Nel primo anno Guidato una stagione dura 150 secondi: 100 di luce e 50 di notte. Dal secondo anno dura 90 secondi: 60 di luce e 30 di notte.'
                : 'Una stagione dura 90 secondi: 60 di luce e 30 di notte.'}{' '}
              Usa <kbd>SPAZIO</kbd> per fermare il tempo e i tasti <kbd>1</kbd> <kbd>2</kbd>{' '}
              <kbd>3</kbd> per la velocità. All’inizio hai tre punti Voce. Ogni ordine diretto ne
              consuma uno; ne recuperi uno ogni 10 secondi.
            </p>
          </div>
          <button
            className="primary-button"
            disabled={!game.started && !newMapValid}
            onClick={() => {
              if (!game.started && !newMapValid) return;
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
              {canRecallSpark(game, currentSpark.id) && (
                <div className="recall-discovery">
                  <BookOpen size={20} />
                  <div>
                    <strong>Questa parola l’hai già compresa</strong>
                    <p>
                      La tribù ha rivissuto l’esperienza. Puoi ritrovare il concetto senza ripetere
                      il puzzle.
                    </p>
                    <button className="primary-button" onClick={rememberDiscovery}>
                      Ricorda la parola <Sparkles size={16} />
                    </button>
                  </div>
                </div>
              )}
              <details
                className={`discovery-puzzle ${canRecallSpark(game, currentSpark.id) ? 'optional-puzzle' : 'first-puzzle'}`}
                open={!canRecallSpark(game, currentSpark.id) || undefined}
                key={currentSpark.id}
              >
                <summary>Rifai il puzzle, se preferisci</summary>
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
                  Un errore indebolisce l’intuizione e richiede un’attesa prima di riprovare. Segui
                  l’indizio.
                </div>
                <button
                  className="primary-button"
                  onClick={attemptDiscovery}
                  disabled={puzzle.length !== currentSpark.recipe.length}
                >
                  Dai un nome all’intuizione <Sparkles size={17} />
                </button>
              </details>
            </>
          ) : (
            <>
              <p>L’intuizione si è indebolita. Puoi riprovare tra quindici secondi.</p>
              {puzzleFeedback && (
                <>
                  <p>I concetti corretti restano evidenziati in oro.</p>
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
                          {numbered && memory.custodians.length === 1 ? 'custode' : 'custodi'}
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
              Ogni parola nasce da un’esperienza. Condividila con nuovi custodi o affidala alla
              scrittura per conservarla nel tempo.
            </p>
          </div>
        </Modal>
      )}

      {panel === 'campfire' && (
        <Modal
          title="Attorno al falò"
          onClose={game.campfirePending ? undefined : closePanel}
          className={`campfire-modal ${hasOpeningBalance(game) ? 'opening-council' : ''}`}
          headerAction={
            game.campfirePending ? (
              <button
                className="text-button council-finish"
                onClick={() => {
                  setGame((current) => dismissCampfire(current));
                  closePanel();
                }}
              >
                Concludi consiglio
              </button>
            ) : undefined
          }
        >
          <div className="modal-symbol">
            <Flame size={37} />
          </div>
          <span className="eyebrow">
            {hasOpeningBalance(game)
              ? 'IL SAPERE TROVA NUOVE VOCI'
              : 'CIÒ CHE NON TRAMANDI PUÒ SCOMPARIRE'}
          </span>
          <h2>Attorno al falò.</h2>
          <p className="modal-intro">Scegli una parola e affidala a una nuova voce.</p>
          <div className="attention-counter">
            <span>ATTENZIONE DISPONIBILE</span>
            <strong>
              {quantity(game.attention)}
              <small> attenzione</small>
            </strong>
          </div>
          <GuidedCouncil
            state={game}
            onPrepare={() => setGame((current) => prepareCampfireCouncil(current))}
            onPrepareBrief={() => setGame((current) => prepareBriefLesson(current))}
          />
          <TribeEvents
            state={game}
            events={(game.tribeEvents ?? []).filter(
              (event) => event.time >= seasonStart(game, getCalendar(game).seasonIndex - 1),
            )}
            summary
            onFocus={(id) => {
              const unit = game.units.find((u) => u.id === id);
              if (unit) {
                setCouncilInspection(game.campfirePending);
                closePanel();
                focusTarget({
                  type: unit.hp > 0 ? 'unit' : 'point',
                  id: unit.hp > 0 ? unit.id : undefined,
                  x: unit.x,
                  y: unit.y,
                });
              }
            }}
            onInspect={(id) => {
              setCouncilInspection(game.campfirePending);
              closePanel();
              inspectPerson(id);
            }}
            onWord={showWordHelp}
          />
          <TeachingPanel
            state={game}
            onChange={setGame}
            onFocus={(destination) => {
              setCouncilInspection(game.campfirePending);
              closePanel();
              focusTarget(destination);
            }}
          />
          <p className="campfire-explanation">
            Ogni lezione costa 10 punti Attenzione e forma un nuovo custode. Il recupero base è di{' '}
            {game.playMode === 'guided' ? 20 : 10} punti di memoria e può aumentare con i dogmi. Al
            cambio di stagione,{' '}
            {hasOpeningBalance(game)
              ? 'il consiglio dispone di una base di Attenzione. Legno bruciato e anziani la aumentano; solo la fame grave la riduce.'
              : 'il legno bruciato e gli anziani generano Attenzione.'}{' '}
            {game.playMode === 'guided' &&
              'Durante il consiglio puoi ripassare una parola già nota a tutti gli allievi: costa 10 punti Attenzione e rafforza la memoria dei custodi.'}
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
          <span className="eyebrow">DALLA PAURA NASCE UNA REGOLA</span>
          <h2>La Pietra Sacra.</h2>
          <p className="modal-intro">
            Un dogma nato da un trauma recente restituisce 40 punti Coesione. La sua regola
            vincolerà la tribù finché non verrà abolita.
          </p>
          {!ownedBuildings.some((b) => b.kind === 'menhir' && b.hp > 0) && (
            <div className="guide-note">
              <Glyph id="O_02" />
              <p>
                Serve una Pietra Sacra: <strong>Gruppo · Scheggiare · Pietra · Sacro</strong>.
                Costo: 20 unità di pietra.
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
                                ? 'Appartiene a tutti'
                                : id === 'O_01'
                                  ? 'È protetto al giaciglio'
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
                      ? `${d.age} ${d.age === 1 ? 'stagione' : 'stagioni'} · Peso culturale ${d.weight.toFixed(1)}`
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
            La partita si salva automaticamente in questo browser ogni cinque secondi. Esportala per
            conservarne una copia o continuare su un altro dispositivo.
          </p>
          <p className="mode-label">
            Partita {game.playMode === 'guided' ? 'Guidata' : 'Classica'}. La modalità si sceglie
            all’inizio di una nuova storia.
            {game.playMode === 'guided' &&
              (hasOpeningBalance(game)
                ? ' Questa storia usa il primo anno disteso e il nuovo equilibrio del Falò.'
                : ' Questa storia conserva il ritmo precedente. Le nuove Guidate usano il primo anno disteso.')}
          </p>
          <p className="current-map-info" aria-label="Mappa attuale">
            {game.mapGeneration ? (
              <>
                {game.mapGeneration.mode === 'random' ? 'Mappa casuale' : 'Seed Zero'}
                {' · Seed '}
                <code>{game.mapGeneration.seed}</code>
              </>
            ) : (
              'Mappa di una versione precedente · seed originale non disponibile'
            )}
          </p>
          <label className="event-pause-setting">
            <input
              type="checkbox"
              checked={pauseOnEvents}
              onChange={(event) => setPauseOnEvents(event.target.checked)}
            />
            <span>
              Pausa automatica sugli eventi importanti
              <small>
                Ferma il tempo quando appare una Scintilla, nasce o muore un compagno, oppure si
                perde una parola. Riprendi quando sei pronto.
              </small>
            </span>
          </label>
          <div className="settings-actions">
            <button onClick={saveGame}>
              <Save size={19} />
              <span>
                <strong>Salva adesso</strong>
                <small>Conserva la partita su questo dispositivo</small>
              </span>
              <ChevronRight size={17} />
            </button>
            <button onClick={exportGame}>
              <Download size={19} />
              <span>
                <strong>Esporta partita</strong>
                <small>Scarica una copia della partita in formato JSON</small>
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
            <button className="restart-action" onClick={openRestart}>
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
          <ModePicker value={newMode} onChange={setNewMode} />
          <MapPicker
            value={newMap}
            seed={newSeed}
            onChange={changeMap}
            onSeedChange={changeMapSeed}
            onNewSeed={chooseNewSeed}
          />
          <button className="primary-button" onClick={restart} disabled={!newMapValid}>
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
              onCompose={preparePhrase}
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
          <button className="primary-button" onClick={openRestart}>
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
function ModePicker({
  value,
  onChange,
}: {
  value: 'guided' | 'classic';
  onChange: (mode: 'guided' | 'classic') => void;
}) {
  return (
    <div className="mode-picker" role="group" aria-label="Modalità di gioco">
      <button type="button" aria-pressed={value === 'guided'} onClick={() => onChange('guided')}>
        <strong>Guidata</strong>
        <small>
          Un primo anno più disteso, con stagioni da 150 secondi, prime materie comprese vivendo e
          più spazio per tramandare. Il primo inverno è senza tormente. Dal secondo anno le stagioni
          durano 90 secondi. Trasporti e utensili possono proseguire durante il giorno.
        </small>
      </button>
      <button type="button" aria-pressed={value === 'classic'} onClick={() => onChange('classic')}>
        <strong>Classica</strong>
        <small>
          Un inizio più impegnativo: scoperta di Qui dopo due notti, anziana iniziale di quattordici
          stagioni e rischio di tormenta già dal primo inverno. Gli ordini diretti coprono un solo
          trasporto o manufatto.
        </small>
      </button>
    </div>
  );
}
function HammerIcon() {
  return <Glyph id="V_06" size={17} />;
}

export default App;
