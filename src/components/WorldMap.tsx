import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Crosshair, Minus, Plus, Move, MapPin, MousePointer2, PackageOpen, X } from 'lucide-react';
import type { GameState, WorldTarget } from '../game/types';
import { getCalendar } from '../game/calendar';
import {
  createTerrain,
  drawWorld,
  entityNames,
  isVisibleAt,
  hasConcept,
  MAP_HEIGHT,
  MAP_WIDTH,
  WORLD_SIZE,
  SPRITE_SCALE,
} from './mapDrawing';
import { getGroundPiles } from './mapResourceLayout';
import { getCustodianStatuses } from '../game/custodianStatus';
import { getLifeStage } from '../game/demography';
import {
  createMapMotionSession,
  createAnimationClock,
  continuousAnimationTime,
  readUnitDisplay,
} from './mapMotion';
import { entityTargetPresentation, targetPresentation } from './targetPresentation';
import { CITY_ART_BOUNDS } from './mapStrategicArt';
import { getBattalionDisplayPoint } from './regionalLayout';
import { deriveSiegePresentation } from './mapSiegeArt';
import { visibleUnitName } from './unitReadability';
import { anchoredPinchView, type MapPinchAnchor } from './mapGestures';
import { getCampStockSlots } from './campInventory';
import { CAMP_STOCK_ART_BOUNDS } from './mapCampStockArt';
import './WorldMap.css';

interface WorldMapProps {
  state: GameState;
  selectedTarget: WorldTarget | null;
  onSelect: (target: WorldTarget) => void;
  onSelectGroupAnchor?: (target: WorldTarget) => void;
  commandReady?: boolean;
  selectingGroup?: boolean;
  onSpark?: (sparkId: string) => void;
  onInspectStocks?: () => void;
  groupAnchor?: WorldTarget | null;
  isGroupActive?: boolean;
  orderFeedback?: {
    from: { x: number; y: number }[];
    to: { x: number; y: number };
    time: number;
  } | null;
  focusRequest?: { x: number; y: number; nonce: number };
}

type View = { zoom: number; centerX: number; centerY: number };
type Size = { width: number; height: number; dpr: number };
const WORLD_X = MAP_WIDTH / WORLD_SIZE,
  WORLD_Y = MAP_HEIGHT / WORLD_SIZE;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function viewBounds(state: GameState) {
  if (state.tier >= 4) return { minX: 0, minY: 0, maxX: WORLD_SIZE, maxY: WORLD_SIZE };
  const sectors = (state.sectors ?? []).filter((s) => s.explored);
  const points = [
    ...sectors.map((s) => ({ x: s.x * 100 + 50, y: s.y * 100 + 50 })),
    ...(state.explored ?? []),
    state.home ?? { x: 250, y: 250 },
  ];
  const xs = points.map((p) => Math.floor(clamp(p.x, 0, 499.999) / 100));
  const ys = points.map((p) => Math.floor(clamp(p.y, 0, 499.999) / 100));
  return {
    minX: Math.min(...xs) * 100,
    minY: Math.min(...ys) * 100,
    maxX: (Math.max(...xs) + 1) * 100,
    maxY: (Math.max(...ys) + 1) * 100,
  };
}

function targetLabel(state: GameState, target: WorldTarget | null) {
  if (!target) return null;
  const numbered = hasConcept(state, 'O_08');
  if (target.type === 'unit') {
    const unit = state.units.find((u) => u.id === target.id);
    return unit ? visibleUnitName(state, unit) : 'Una persona';
  }
  if (target.type === 'city') {
    const city = state.cities.find((c) => c.id === target.id);
    if (!city) return 'Un insediamento';
    const population = Object.values(city.cohorts).reduce((n, v) => n + v, 0);
    return `${city.name} · ${numbered ? `${population} abitanti` : population >= 150 ? 'una città popolosa' : 'un piccolo insediamento'}`;
  }
  if (target.type === 'battalion')
    return state.battalions.find((b) => b.id === target.id)?.name ?? 'Un esercito';
  if (target.type === 'caravan') {
    const caravan = state.caravans.find((c) => c.id === target.id);
    return caravan?.kind === 'colonists'
      ? 'Coloni in viaggio'
      : caravan?.kind === 'delegate'
        ? 'Saggi in viaggio'
        : caravan?.kind === 'tax'
          ? 'Convoglio tributario'
          : 'Carovana commerciale';
  }
  if (target.type === 'entity') {
    const entity = state.entities.find((e) => e.id === target.id);
    if (!entity) return null;
    return entityTargetPresentation(state, entity)?.label ?? null;
  }
  if (target.type === 'building') {
    const building = state.buildings.find((b) => b.id === target.id);
    if (!building) return 'Insediamento';
    const name = entityNames[building.kind] ?? 'Insediamento';
    if (building.kind === 'campfire') {
      return building.active
        ? `${name} · Acceso (riscalda e protegge la tribù)`
        : `${name} · Spento (richiede ${numbered ? 'un’unità di legno' : 'legno'} per riaccenderlo)`;
    }
    return building.active ? name : `${name} · Inattivo`;
  }
  if (
    target.type === 'point' &&
    state.home &&
    Math.hypot(target.x - state.home.x, target.y - state.home.y) <= 10
  ) {
    return 'Giaciglio della tribù · Luogo del riposo notturno';
  }
  return isVisibleAt(state, target.x, target.y)
    ? 'Un luogo da raggiungere'
    : 'Terra ancora inesplorata';
}

/** Recheck moving targets against live coordinates before exposing a choice. */
function liveMapChoice(state: GameState, target: WorldTarget): WorldTarget | null {
  if (target.type === 'point') return isVisibleAt(state, target.x, target.y) ? target : null;
  const source =
    target.type === 'unit'
      ? state.units.find((u) => u.id === target.id && u.hp > 0)
      : target.type === 'entity'
        ? state.entities.find(
            (e) =>
              e.id === target.id &&
              (e.amount > 0 || ['tree', 'stone'].includes(e.kind)) &&
              (e.kind !== 'ore' || hasConcept(state, 'O_07')),
          )
        : target.type === 'building'
          ? state.buildings.find((b) => b.id === target.id && b.hp > 0)
          : target.type === 'city'
            ? state.cities.find((c) => c.id === target.id && c.factionId !== 'ruins')
            : target.type === 'battalion'
              ? state.battalions.find((b) => b.id === target.id && b.hp > 0)
              : state.caravans.find((c) => c.id === target.id && c.hp > 0 && !c.arrived);
  return source && isVisibleAt(state, source.x, source.y)
    ? { ...target, x: source.x, y: source.y }
    : null;
}

export function WorldMap({
  state,
  selectedTarget,
  onSelect,
  onSelectGroupAnchor,
  commandReady = false,
  selectingGroup = false,
  onSpark,
  onInspectStocks,
  groupAnchor = null,
  isGroupActive = false,
  orderFeedback = null,
  focusRequest,
}: WorldMapProps) {
  const containerRef = useRef<HTMLDivElement>(null),
    canvasRef = useRef<HTMLCanvasElement>(null),
    minimapRef = useRef<HTMLCanvasElement>(null);
  const motionSessionRef = useRef(createMapMotionSession());
  const animationClockRef = useRef(createAnimationClock());
  const reducedMotionRef = useRef(false);
  const stateRef = useRef(state),
    anchorRef = useRef(groupAnchor),
    selectedRef = useRef(selectedTarget),
    hoveredRef = useRef<WorldTarget | null>(null),
    readyRef = useRef(commandReady),
    groupActiveRef = useRef(isGroupActive),
    orderFeedbackRef = useRef(orderFeedback);
  const [ping, setPing] = useState<{ x: number; y: number; time: number } | null>(null);
  const [targetChoices, setTargetChoices] = useState<WorldTarget[]>([]);
  const choiceRef = useRef<HTMLDivElement>(null);
  const choiceActivationRef = useRef<string | null>(null);
  const currentChoices = targetChoices
    .map((item) => liveMapChoice(state, item))
    .filter((item): item is WorldTarget => item !== null);
  const choiceIdentity = currentChoices
    .map((item) => `${item.type}:${item.id ?? 'ground'}`)
    .join('|');
  const pingRef = useRef(ping);
  pingRef.current = ping;
  groupActiveRef.current = isGroupActive;
  orderFeedbackRef.current = orderFeedback;
  const initialView: View = {
    zoom: state.tier >= 4 ? 1 : 4.5,
    centerX: state.home?.x ?? 250,
    centerY: state.home?.y ?? 250,
  };
  const viewRef = useRef<View>(initialView),
    previousTier = useRef(state.tier);
  const [size, setSize] = useState<Size>({ width: 1000, height: 600, dpr: 1 });
  const [view, setView] = useState<View>(initialView),
    [hovered, setHovered] = useState<WorldTarget | null>(null),
    [dragging, setDragging] = useState(false);
  const pointerRef = useRef<{
    x: number;
    y: number;
    centerX: number;
    centerY: number;
    moved: boolean;
  } | null>(null);
  const activePointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchStartRef = useRef<MapPinchAnchor | null>(null);
  const pointerTypeRef = useRef('mouse');
  // Exploration changes every tick; terrain depends only on stable map identity,
  // geography and season. Never use the evolving state.seed to repaint it.
  const geography = state.sectors
    .map((sector) => `${sector.x},${sector.y}:${sector.biome}`)
    .join('|');
  const mapMode = state.mapGeneration?.mode;
  const mapSeed = state.mapGeneration?.seed;
  const terrain = useMemo(
    () => createTerrain(mapMode === 'random' ? mapSeed! : 6842, state.seasonIndex, state),
    [mapMode, mapSeed, geography, state.seasonIndex, state.home.x, state.home.y],
  );
  useEffect(() => {
    if (focusRequest)
      setView((previous) => ({
        ...previous,
        centerX: clamp(focusRequest.x, 0, 500),
        centerY: clamp(focusRequest.y, 0, 500),
      }));
  }, [focusRequest]);
  const renderSizeRef = useRef(size);
  stateRef.current = state;
  anchorRef.current = groupAnchor;
  selectedRef.current = selectedTarget;
  readyRef.current = commandReady;
  renderSizeRef.current = size;
  viewRef.current = view;

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => {
      reducedMotionRef.current = preference.matches;
    };
    update();
    preference.addEventListener('change', update);
    return () => preference.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (state.tier >= 4 && previousTier.current < 4)
      setView({ zoom: 1, centerX: 250, centerY: 250 });
    previousTier.current = state.tier;
  }, [state.tier]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const resize = () => {
      const bounds = element.getBoundingClientRect();
      setSize({
        width: Math.max(1, bounds.width),
        height: Math.max(1, bounds.height),
        dpr: Math.min(2, window.devicePixelRatio || 1),
      });
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const getTransform = useCallback(() => {
    const s = renderSizeRef.current,
      v = viewRef.current,
      bounds = viewBounds(stateRef.current);
    const fit = stateRef.current.tier >= 4 ? Math.min : Math.max;
    const scale = fit(s.width / MAP_WIDTH, s.height / MAP_HEIGHT) * v.zoom;
    const halfWidth = s.width / scale / WORLD_X / 2,
      halfHeight = s.height / scale / WORLD_Y / 2;
    const bounded = (value: number, min: number, max: number, half: number) =>
      max - min <= half * 2 ? (min + max) / 2 : clamp(value, min + half, max - half);
    const centerX = bounded(v.centerX, bounds.minX, bounds.maxX, halfWidth),
      centerY = bounded(v.centerY, bounds.minY, bounds.maxY, halfHeight);
    return {
      scale,
      x: s.width / 2 - centerX * WORLD_X * scale,
      y: s.height / 2 - centerY * WORLD_Y * scale,
      centerX,
      centerY,
    };
  }, []);

  const toWorld = useCallback(
    (clientX: number, clientY: number) => {
      const bounds = canvasRef.current!.getBoundingClientRect(),
        t = getTransform();
      return {
        x: clamp((clientX - bounds.left - t.x) / t.scale / WORLD_X, 0, WORLD_SIZE),
        y: clamp((clientY - bounds.top - t.y) / t.scale / WORLD_Y, 0, WORLD_SIZE),
      };
    },
    [getTransform],
  );

  const hitTest = useCallback(
    (clientX: number, clientY: number, collect?: WorldTarget[]): WorldTarget => {
      const p = toWorld(clientX, clientY),
        current = stateRef.current,
        t = getTransform();
      const calendar = getCalendar(current);
      const candidates: { target: WorldTarget; distance: number; padded: boolean }[] = [];
      const add = (
        type: WorldTarget['type'],
        id: string,
        x: number,
        y: number,
        radius: number,
        verticalOffset = 0,
        display?: { x: number; y: number },
      ) => {
        if (!isVisibleAt(current, x, y)) return;
        const dx = (p.x - (display?.x ?? x)) * WORLD_X * t.scale,
          dy = ((p.y - (display?.y ?? y)) * WORLD_Y + verticalOffset * SPRITE_SCALE) * t.scale;
        const d = Math.hypot(dx, dy);
        if (d < radius) candidates.push({ target: { type, id, x, y }, distance: d, padded: false });
      };
      // Artwork sizes are local sprite pixels. Scale the selectable silhouette with
      // the drawing, while retaining a small touch target when zoomed out.
      const addArt = (
        type: WorldTarget['type'],
        id: string,
        x: number,
        y: number,
        rx: number,
        ry: number,
        verticalOffset: number,
        minimum = 16,
        horizontalOffset = 0,
        display?: { x: number; y: number },
      ) => {
        if (!isVisibleAt(current, x, y)) return;
        const spritePixels = SPRITE_SCALE * t.scale;
        display ??=
          (type === 'unit' || type === 'entity') && !current.paused
            ? readUnitDisplay(motionSessionRef.current, id)
            : undefined;
        const dx = (p.x - (display?.x ?? x)) * WORLD_X * t.scale - horizontalOffset * spritePixels,
          dy = (p.y - (display?.y ?? y)) * WORLD_Y * t.scale + verticalOffset * spritePixels;
        const actualX = rx * spritePixels + 2,
          actualY = ry * spritePixels + 2;
        const paddedX = Math.max(minimum, actualX),
          paddedY = Math.max(minimum, actualY);
        if (Math.hypot(dx / paddedX, dy / paddedY) > 1) return;
        candidates.push({
          target: { type, id, x, y },
          distance: Math.hypot(dx, dy),
          padded: Math.hypot(dx / actualX, dy / actualY) > 1,
        });
      };
      current.units
        .filter(
          (u) =>
            u.hp > 0 &&
            (!current.urbanized ||
              (u.factionId !== undefined && u.factionId !== 'player') ||
              u.isKing ||
              ['delegating', 'frontline', 'frontline-returning'].includes(u.action)),
        )
        .forEach((u) => {
          const stage = getLifeStage(u);
          const scale =
            stage === 'child' ? 0.7 : stage === 'elder' ? 0.94 : stage === 'newborn' ? 0.82 : 1;
          if (/sleep|dorm/i.test(u.action)) {
            addArt('unit', u.id, u.x, u.y, 14 * scale, 8 * scale, 2 * scale, 11);
          } else if (stage === 'newborn') {
            addArt('unit', u.id, u.x, u.y, 7 * scale, 11 * scale, 8 * scale, 11);
          } else {
            addArt('unit', u.id, u.x, u.y, 9 * scale, 20 * scale, 14 * scale, 11);
          }
          if (u.hp < 45 || u.hunger >= 80 || u.temp <= 20)
            addArt('unit', u.id, u.x, u.y, 5, 5, 32, 9, 8);
          if (u.isolation && u.isolation > 3 && u.isolation < 30)
            addArt('unit', u.id, u.x, u.y, 5, 5, 32, 9, -7);
        });
      for (const status of getCustodianStatuses(current)) {
        const unit = current.units.find((u) => u.id === status.unitId);
        if (!unit || current.urbanized) continue;
        addArt('unit', unit.id, unit.x, unit.y, 8, 7, 38, 9, -15);
      }
      for (const pile of getGroundPiles(current)) {
        addArt('entity', pile.entity.id, pile.entity.x, pile.entity.y, 25, 15, 1, 18, 0, pile);
      }
      current.entities.forEach((e) => {
        if (e.kind === 'ground') return;
        if (e.kind === 'ore' && !hasConcept(current, 'O_07')) return;
        if (
          e.kind === 'wolf' &&
          !calendar.isNight &&
          !e.attacked &&
          !current.units.some((u) => u.hp > 0 && Math.hypot(u.x - e.x, u.y - e.y) < 20)
        )
          return;
        if (e.amount <= 0 && !['tree', 'stone'].includes(e.kind)) return;
        if (e.kind === 'tree') {
          addArt('entity', e.id, e.x, e.y, 10, e.amount > 0 ? 19 : 10, e.amount > 0 ? 15 : 5);
          if (e.amount > 0) addArt('entity', e.id, e.x, e.y, 33, 29, 48);
        } else if (e.kind === 'mammoth') {
          addArt('entity', e.id, e.x, e.y, 50, 35, 27, 20);
        } else if (['deer', 'wolf', 'alpha'].includes(e.kind)) {
          const scale = e.kind === 'alpha' ? 1.25 : 1;
          addArt('entity', e.id, e.x, e.y, 39 * scale, 27 * scale, 21 * scale, 20);
        } else if (e.kind === 'seedling') {
          addArt('entity', e.id, e.x, e.y, 11, 13, 8);
        } else if (e.kind === 'corpse') {
          addArt('entity', e.id, e.x, e.y, 15, 9, 3);
        } else {
          addArt('entity', e.id, e.x, e.y, e.kind === 'berries' ? 31 : 39, 24, 16, 20);
        }
      });
      if (!current.urbanized)
        current.buildings
          .filter((b) => b.hp > 0)
          .forEach((b) => {
            const flat = ['farm', 'pen', 'palisade', 'walls', 'storage', 'grave'].includes(b.kind);
            const tall = ['temple', 'palace', 'archive', 'foundry'].includes(b.kind);
            const narrow = ['menhir', 'stele'].includes(b.kind);
            if (b.kind === 'campfire') {
              addArt('building', b.id, b.x, b.y, 25, b.active ? 29 : 13, b.active ? 16 : 3, 22);
            } else {
              addArt(
                'building',
                b.id,
                b.x,
                b.y,
                narrow ? 22 : flat ? 49 : 41,
                tall ? 51 : flat ? 28 : 37,
                tall ? 43 : flat ? 15 : 29,
                22,
              );
            }
          });
      current.cities
        .filter((c) => c.factionId !== 'ruins')
        .forEach((c) => {
          if (current.tier >= 4) {
            addArt(
              'city',
              c.id,
              c.x,
              c.y,
              (CITY_ART_BOUNDS.right - CITY_ART_BOUNDS.left) / 2 / SPRITE_SCALE,
              (CITY_ART_BOUNDS.bottom - CITY_ART_BOUNDS.top) / 2 / SPRITE_SCALE,
              -(CITY_ART_BOUNDS.bottom + CITY_ART_BOUNDS.top) / 2 / SPRITE_SCALE,
              20,
            );
            // Labels and the occupation meter belong to the same settlement target.
            addArt(
              'city',
              c.id,
              c.x,
              c.y,
              Math.max(
                20,
                ((c.name.length * Math.max(9, Math.min(16, 10 * t.scale))) / t.scale) * 0.27,
              ) / SPRITE_SCALE,
              9 / SPRITE_SCALE,
              -30 / SPRITE_SCALE,
              14,
            );
            if (
              current.battalions.some(
                (army) => deriveSiegePresentation(current, army)?.cityId === c.id,
              )
            )
              addArt(
                'city',
                c.id,
                c.x,
                c.y,
                44 / SPRITE_SCALE,
                16 / SPRITE_SCALE,
                -56 / SPRITE_SCALE,
                14,
              );
          } else add('city', c.id, c.x, c.y, 27, 10);
        });
      current.battalions
        .filter((b) => b.hp > 0)
        // Strategic icons use full map scale rather than the individual sprite scale.
        .forEach((b) => {
          const display = getBattalionDisplayPoint(current, b);
          addArt(
            'battalion',
            b.id,
            b.x,
            b.y,
            17 / SPRITE_SCALE,
            13 / SPRITE_SCALE,
            10 / SPRITE_SCALE,
            22,
            0,
            display,
          );
          if (b.catapult)
            addArt(
              'battalion',
              b.id,
              b.x,
              b.y,
              7 / SPRITE_SCALE,
              8 / SPRITE_SCALE,
              4 / SPRITE_SCALE,
              12,
              11 / SPRITE_SCALE,
              display,
            );
        });
      current.caravans
        .filter((c) => c.hp > 0 && !c.arrived)
        .forEach((c) =>
          addArt(
            'caravan',
            c.id,
            c.x,
            c.y,
            11 / SPRITE_SCALE,
            8 / SPRITE_SCALE,
            5 / SPRITE_SCALE,
            21,
          ),
        );
      candidates.sort((a, b) => Number(a.padded) - Number(b.padded) || a.distance - b.distance);
      if (collect) {
        const precise = candidates.some((c) => !c.padded);
        for (const candidate of candidates) {
          if (precise && candidate.padded) continue;
          if (
            !collect.some((t) => t.type === candidate.target.type && t.id === candidate.target.id)
          )
            collect.push(candidate.target);
        }
      }
      return (
        candidates[0]?.target ?? {
          type: 'point',
          x: Math.round(p.x * 10) / 10,
          y: Math.round(p.y * 10) / 10,
        }
      );
    },
    [getTransform, toWorld],
  );

  // Stored goods are an inventory view, not another gatherable world target.
  // Actual people and resources keep priority; issuing orders still selects the ground.
  const hitStoredGoods = (clientX: number, clientY: number) => {
    const point = toWorld(clientX, clientY),
      scale = getTransform().scale;
    return getCampStockSlots(stateRef.current).some((slot) => {
      if (!isVisibleAt(stateRef.current, slot.x, slot.y)) return false;
      const art = CAMP_STOCK_ART_BOUNDS[slot.group];
      const dx = (point.x - slot.x) * WORLD_X * scale,
        dy = ((point.y - slot.y) * WORLD_Y + art.verticalOffset * SPRITE_SCALE) * scale;
      return (
        Math.hypot(
          dx / Math.max(18, art.rx * SPRITE_SCALE * scale),
          dy / Math.max(16, art.ry * SPRITE_SCALE * scale),
        ) <= 1
      );
    });
  };

  useEffect(() => {
    if (!targetChoices.length) return;
    choiceRef.current?.querySelector<HTMLButtonElement>('button[data-target-choice]')?.focus();
    const dismiss = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      setTargetChoices([]);
      canvasRef.current?.focus({ preventScroll: true });
    };
    const outside = (event: PointerEvent) => {
      if (!choiceRef.current?.contains(event.target as Node)) setTargetChoices([]);
    };
    window.addEventListener('keydown', dismiss, true);
    window.addEventListener('pointerdown', outside);
    return () => {
      window.removeEventListener('keydown', dismiss, true);
      window.removeEventListener('pointerdown', outside);
    };
  }, [targetChoices.length, choiceIdentity]);

  const handleGroupSelect = useCallback(
    (clientX: number, clientY: number) => {
      if (!onSelectGroupAnchor) return;
      setTargetChoices([]);
      const target = hitTest(clientX, clientY);
      onSelectGroupAnchor(target);
      const now = stateRef.current.paused ? stateRef.current.time : performance.now() / 1000;
      setPing({ x: target.x, y: target.y, time: now });
    },
    [hitTest, onSelectGroupAnchor],
  );

  const zoom = useCallback((delta: number) => {
    setView((previous) => {
      const bounds = viewBounds(stateRef.current),
        span = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);
      const minZoom = stateRef.current.tier >= 4 ? 0.9 : Math.max(1, 400 / span);
      return {
        ...previous,
        zoom: clamp(Math.round((previous.zoom + delta) * 100) / 100, minZoom, 16),
      };
    });
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      zoom(event.deltaY < 0 ? 0.3 : -0.3);
    };
    canvas.addEventListener('wheel', wheel, { passive: false });
    return () => canvas.removeEventListener('wheel', wheel);
  }, [zoom]);

  useEffect(() => {
    const canvas = canvasRef.current,
      mini = minimapRef.current;
    if (!canvas || !mini) return;
    const ctx = canvas.getContext('2d', { alpha: false }),
      miniCtx = mini.getContext('2d');
    if (!ctx || !miniCtx) return;
    let animation = 0,
      lastDraw = 0;
    const draw = (timestamp: number) => {
      animation = requestAnimationFrame(draw);
      if (timestamp - lastDraw < 1000 / 30) return;
      lastDraw = timestamp;
      const { width, height, dpr } = renderSizeRef.current;
      const pixelWidth = Math.round(width * dpr),
        pixelHeight = Math.round(height * dpr);
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#e4e3ce';
      ctx.fillRect(0, 0, width, height);
      const t = getTransform();
      ctx.translate(t.x, t.y);
      ctx.scale(t.scale, t.scale);
      const current = stateRef.current;
      drawWorld(
        ctx,
        current,
        terrain,
        continuousAnimationTime(
          animationClockRef.current,
          current.time,
          timestamp,
          current.paused,
          current.speed,
        ),
        selectedRef.current,
        hoveredRef.current,
        readyRef.current,
        anchorRef.current,
        groupActiveRef.current,
        pingRef.current,
        orderFeedbackRef.current,
        {
          minX: -t.x / t.scale / WORLD_X,
          minY: -t.y / t.scale / WORLD_Y,
          maxX: (width - t.x) / t.scale / WORLD_X,
          maxY: (height - t.y) / t.scale / WORLD_Y,
        },
        motionSessionRef.current,
        { reducedMotion: reducedMotionRef.current, pixelRatio: dpr },
      );
      const mw = 134,
        mh = 88;
      if (mini.width !== mw * dpr) {
        mini.width = mw * dpr;
        mini.height = mh * dpr;
      }
      miniCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      miniCtx.clearRect(0, 0, mw, mh);
      miniCtx.drawImage(terrain, 0, 0, mw, mh);
      for (let sy = 0; sy < 5; sy++)
        for (let sx = 0; sx < 5; sx++) {
          if (!isVisibleAt(current, sx * 100 + 50, sy * 100 + 50)) {
            miniCtx.fillStyle = '#dfe0cdec';
            miniCtx.fillRect((sx * mw) / 5, (sy * mh) / 5, mw / 5 + 0.5, mh / 5 + 0.5);
          }
        }
      miniCtx.strokeStyle = '#89957444';
      miniCtx.lineWidth = 0.5;
      if (current.tier >= 4)
        for (let i = 1; i < 5; i++) {
          miniCtx.beginPath();
          miniCtx.moveTo((i * mw) / 5, 0);
          miniCtx.lineTo((i * mw) / 5, mh);
          miniCtx.moveTo(0, (i * mh) / 5);
          miniCtx.lineTo(mw, (i * mh) / 5);
          miniCtx.stroke();
        }
      if (!current.urbanized && current.home) {
        miniCtx.fillStyle = '#b5974f';
        miniCtx.beginPath();
        miniCtx.arc(
          (current.home.x / WORLD_SIZE) * mw,
          (current.home.y / WORLD_SIZE) * mh,
          2.2,
          0,
          Math.PI * 2,
        );
        miniCtx.fill();
        miniCtx.strokeStyle = '#5a7343';
        miniCtx.lineWidth = 0.6;
        miniCtx.stroke();
      }
      current.units
        .filter(
          (u) =>
            u.hp > 0 &&
            isVisibleAt(current, u.x, u.y) &&
            (!current.urbanized ||
              (u.factionId !== undefined && u.factionId !== 'player') ||
              u.isKing ||
              ['delegating', 'frontline', 'frontline-returning'].includes(u.action)),
        )
        .forEach((u) => {
          miniCtx.fillStyle = u.factionId && u.factionId !== 'player' ? '#a2694e' : '#61764a';
          miniCtx.beginPath();
          miniCtx.arc((u.x / WORLD_SIZE) * mw, (u.y / WORLD_SIZE) * mh, 1.5, 0, Math.PI * 2);
          miniCtx.fill();
        });
      current.cities
        .filter((c) => isVisibleAt(current, c.x, c.y))
        .forEach((c) => {
          miniCtx.fillStyle = c.factionId === 'player' ? '#536c45' : '#a47a58';
          miniCtx.fillRect((c.x / WORLD_SIZE) * mw - 2, (c.y / WORLD_SIZE) * mh - 2, 4, 4);
        });
      current.battalions
        .filter((b) => b.hp > 0 && isVisibleAt(current, b.x, b.y))
        .forEach((b) => {
          miniCtx.fillStyle = b.factionId === 'player' ? '#52694a' : '#a46f52';
          miniCtx.beginPath();
          miniCtx.arc((b.x / WORLD_SIZE) * mw, (b.y / WORLD_SIZE) * mh, 1.6, 0, Math.PI * 2);
          miniCtx.fill();
        });
      miniCtx.strokeStyle = '#fffbe5dd';
      miniCtx.lineWidth = 1;
      miniCtx.strokeRect(
        (-t.x / t.scale / MAP_WIDTH) * mw + 0.5,
        (-t.y / t.scale / MAP_HEIGHT) * mh + 0.5,
        (width / t.scale / MAP_WIDTH) * mw - 1,
        (height / t.scale / MAP_HEIGHT) * mh - 1,
      );
    };
    animation = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animation);
  }, [terrain, getTransform]);

  const focusCamp = () =>
    setView({
      zoom: stateRef.current.tier >= 4 ? 2 : 4.5,
      centerX: stateRef.current.home?.x ?? 250,
      centerY: stateRef.current.home?.y ?? 250,
    });
  const focusedTarget = hovered && hovered.type !== 'point' ? hovered : selectedTarget;
  const label = targetLabel(state, focusedTarget ?? null);
  const details = targetPresentation(state, focusedTarget ?? null);
  const mapSpan = Math.round(
    53 /
      ((state.tier >= 4 ? Math.min : Math.max)(size.width / MAP_WIDTH, size.height / MAP_HEIGHT) *
        view.zoom) /
      WORLD_X,
  );

  return (
    <div
      ref={containerRef}
      className={`lingus-world ${size.height < 200 ? 'is-short-map' : ''} ${dragging ? 'is-panning' : ''} ${commandReady ? 'is-targeting' : ''} ${details ? 'has-resource-focus' : ''}`}
    >
      <canvas
        ref={canvasRef}
        tabIndex={0}
        className="lingus-world__canvas"
        aria-label="Mappa della valle: seleziona risorse, abitanti e luoghi per dare un ordine alla tribù"
        role="img"
        onPointerDown={(event) => {
          choiceActivationRef.current = null;
          pointerTypeRef.current = event.pointerType;
          if (event.pointerType === 'mouse' && event.button !== 0) return;
          try {
            event.currentTarget.setPointerCapture(event.pointerId);
          } catch {
            /* capture failed */
          }
          if (event.pointerType !== 'mouse') {
            hoveredRef.current = null;
            setHovered(null);
          }
          activePointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

          if (activePointersRef.current.size === 2) {
            const [p1, p2] = Array.from(activePointersRef.current.values());
            const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
            const anchor = toWorld((p1.x + p2.x) / 2, (p1.y + p2.y) / 2);
            pinchStartRef.current = {
              distance: dist,
              zoom: viewRef.current.zoom,
              worldX: anchor.x,
              worldY: anchor.y,
            };
            pointerRef.current = null;
            setDragging(false);
            return;
          }

          if (activePointersRef.current.size === 1) {
            const t = getTransform();
            pointerRef.current = {
              x: event.clientX,
              y: event.clientY,
              centerX: t.centerX,
              centerY: t.centerY,
              moved: false,
            };
          }
        }}
        onPointerMove={(event) => {
          if (activePointersRef.current.has(event.pointerId))
            activePointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

          if (activePointersRef.current.size >= 2 && pinchStartRef.current) {
            const [p1, p2] = Array.from(activePointersRef.current.values());
            const currentDist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
            const bounds = viewBounds(stateRef.current),
              span = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);
            const minimumZoom = stateRef.current.tier >= 4 ? 0.9 : Math.max(1, 400 / span);
            const canvasBounds = event.currentTarget.getBoundingClientRect();
            const fit = stateRef.current.tier >= 4 ? Math.min : Math.max;
            const next = anchoredPinchView(
              pinchStartRef.current,
              {
                distance: currentDist,
                midpointX: (p1.x + p2.x) / 2 - canvasBounds.left,
                midpointY: (p1.y + p2.y) / 2 - canvasBounds.top,
              },
              {
                width: renderSizeRef.current.width,
                height: renderSizeRef.current.height,
                baseScale: fit(
                  renderSizeRef.current.width / MAP_WIDTH,
                  renderSizeRef.current.height / MAP_HEIGHT,
                ),
                worldScaleX: WORLD_X,
                worldScaleY: WORLD_Y,
              },
              minimumZoom,
            );
            if (next) setView(next);
            return;
          }

          const pointer = pointerRef.current;
          if (pointer) {
            const dx = event.clientX - pointer.x,
              dy = event.clientY - pointer.y;
            if (Math.hypot(dx, dy) > 5) pointer.moved = true;
            if (pointer.moved) {
              const t = getTransform();
              setDragging(true);
              setView((previous) => ({
                ...previous,
                centerX: pointer.centerX - dx / t.scale / WORLD_X,
                centerY: pointer.centerY - dy / t.scale / WORLD_Y,
              }));
            }
          } else if (event.pointerType === 'mouse' && activePointersRef.current.size === 0) {
            const nextTarget = hitTest(event.clientX, event.clientY),
              next = nextTarget.type === 'point' ? null : nextTarget;
            hoveredRef.current = next;
            setHovered((previous) => (previous?.id === next?.id ? previous : next));
          }
        }}
        onPointerUp={(event) => {
          const wasPinching = !!pinchStartRef.current;
          activePointersRef.current.delete(event.pointerId);
          if (activePointersRef.current.size < 2) {
            pinchStartRef.current = null;
          }

          const pointer = pointerRef.current;
          pointerRef.current = null;
          setDragging(false);

          if (wasPinching || !pointer || pointer.moved) return;
          if (event.shiftKey) {
            handleGroupSelect(event.clientX, event.clientY);
            return;
          }
          const p = toWorld(event.clientX, event.clientY),
            t = getTransform();
          const spark = stateRef.current.sparks.find((s) => {
            const unit = stateRef.current.units.find((u) => u.id === s.unitId && u.hp > 0);
            return (
              unit &&
              Math.hypot(
                (p.x - unit.x) * WORLD_X * t.scale,
                ((p.y - unit.y) * WORLD_Y + 36 * SPRITE_SCALE) * t.scale,
              ) < 15
            );
          });
          if (spark && onSpark) {
            onSpark(spark.id);
            return;
          }
          const choices: WorldTarget[] = [];
          const picked = hitTest(event.clientX, event.clientY, choices);
          if (
            picked.type === 'point' &&
            !commandReady &&
            !selectingGroup &&
            onInspectStocks &&
            hitStoredGoods(event.clientX, event.clientY)
          ) {
            setTargetChoices([]);
            onInspectStocks();
            return;
          }
          if (choices.length > 1 && !selectingGroup) {
            setTargetChoices([...choices, { type: 'point', x: p.x, y: p.y }]);
            return;
          }
          setTargetChoices([]);
          onSelect(picked);
        }}
        onDoubleClick={(event) => {
          event.preventDefault();
          if (pointerTypeRef.current === 'mouse') handleGroupSelect(event.clientX, event.clientY);
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          if (pointerTypeRef.current === 'mouse') handleGroupSelect(event.clientX, event.clientY);
        }}
        onPointerCancel={(event) => {
          activePointersRef.current.delete(event.pointerId);
          if (activePointersRef.current.size < 2) {
            pinchStartRef.current = null;
          }
          pointerRef.current = null;
          setDragging(false);
        }}
        onPointerLeave={() => {
          hoveredRef.current = null;
          setHovered(null);
        }}
      />
      {targetChoices.length > 0 && (
        <div
          className="map-target-choices"
          ref={choiceRef}
          role="group"
          aria-label="Scegli tra gli elementi sovrapposti"
          onKeyDown={(event) => event.stopPropagation()}
        >
          <div className="map-target-choices-heading">
            <strong>Cosa vuoi selezionare?</strong>
            <button
              className="icon-button small"
              aria-label="Chiudi scelta bersaglio"
              onPointerDown={() => {
                choiceActivationRef.current = 'close';
              }}
              onClick={(event) => {
                if (event.detail !== 0 && choiceActivationRef.current !== 'close') return;
                choiceActivationRef.current = null;
                setTargetChoices([]);
                canvasRef.current?.focus({ preventScroll: true });
              }}
            >
              <X size={13} />
            </button>
          </div>
          <p>Più elementi in questo punto. Scegli il bersaglio; l’ordine partirà con Pronuncia.</p>
          <div className="map-target-choice-list">
            {currentChoices.map((item, index) => (
              <button
                data-target-choice
                key={`${item.type}-${item.id ?? index}`}
                onPointerDown={() => {
                  choiceActivationRef.current = `${item.type}:${item.id ?? index}`;
                }}
                onClick={(event) => {
                  // A touch-generated compatibility click may land on a choice
                  // which appeared under the finger at pointerup. It is not a
                  // second deliberate selection; keyboard activation still works.
                  if (
                    event.detail !== 0 &&
                    choiceActivationRef.current !== `${item.type}:${item.id ?? index}`
                  )
                    return;
                  choiceActivationRef.current = null;
                  const live = liveMapChoice(stateRef.current, item);
                  if (!live) return;
                  onSelect(live);
                  setTargetChoices([]);
                  canvasRef.current?.focus({ preventScroll: true });
                }}
              >
                <MapPin size={12} />
                <span>
                  {item.type === 'point' ? 'Punto sul terreno' : targetLabel(state, item)}
                  {item.type === 'unit'
                    ? ` · ${getLifeStage(state.units.find((u) => u.id === item.id)!) === 'elder' ? 'persona anziana' : state.units.find((u) => u.id === item.id)!.age < 4 ? 'giovane' : 'persona adulta'}`
                    : ''}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="lingus-world__location" aria-hidden="true">
        <MapPin size={13} strokeWidth={1.5} />
        <div>
          <span>{state.tier >= 4 ? 'LE TERRE DELLE MOLTE VOCI' : 'LA VALLE DELLE ORIGINI'}</span>
          <small>
            {state.tier >= 4 ? 'Una lingua, molti destini' : 'Un mondo che aspetta le tue parole'}
          </small>
        </div>
      </div>
      <div className="lingus-world__compass" aria-hidden="true">
        <span>N</span>
        <svg viewBox="0 0 50 58" fill="none">
          <circle cx="25" cy="31" r="17" stroke="currentColor" strokeWidth=".6" opacity=".4" />
          <path d="M25 7 30 31 25 52 20 31Z" fill="currentColor" opacity=".18" />
          <path d="m25 9 5 22-5-4-5 4Z" fill="currentColor" opacity=".8" />
          <path d="M6 31h38M25 12v38" stroke="currentColor" strokeWidth=".6" />
          <circle cx="25" cy="31" r="2" fill="currentColor" />
        </svg>
      </div>
      {onInspectStocks && (
        <button
          className="lingus-world__stocks"
          type="button"
          onClick={onInspectStocks}
          aria-label={state.urbanized ? 'Scorte della capitale' : 'Scorte del campo'}
          title="Consulta cibo, materiali e pelli già consegnati"
        >
          <PackageOpen size={17} />
          <span>Scorte</span>
        </button>
      )}
      <div className="lingus-world__control-stack">
        <button
          type="button"
          onClick={() => zoom(0.3)}
          aria-label="Ingrandisci la mappa"
          title="Ingrandisci"
        >
          <Plus size={17} strokeWidth={1.5} />
        </button>
        <span>
          {Math.round(view.zoom * 100)}
          <small>%</small>
        </span>
        <button
          type="button"
          onClick={() => zoom(-0.3)}
          aria-label="Riduci la mappa"
          title="Riduci"
        >
          <Minus size={17} strokeWidth={1.5} />
        </button>
        <i />
        <button
          type="button"
          onClick={focusCamp}
          aria-label="Torna all'accampamento"
          title="Torna all'accampamento"
        >
          <Crosshair size={17} strokeWidth={1.5} />
        </button>
      </div>
      {details && (
        <div
          className="lingus-world__target-card"
          role="status"
          aria-label="Dettagli del bersaglio"
          tabIndex={0}
          onKeyDown={(event) => {
            if (
              [' ', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'].includes(event.key)
            )
              event.stopPropagation();
          }}
          data-resource-stage={details.kind}
          data-mobile-placement={
            focusedTarget &&
            focusedTarget.y * WORLD_Y * getTransform().scale + getTransform().y < size.height / 2
              ? 'bottom'
              : 'top'
          }
        >
          <span className="lingus-world__target-stage">{details.stage}</span>
          <strong>{details.label}</strong>
          <p>{details.description}</p>
          {details.hint && <small>{details.hint}</small>}
        </div>
      )}
      <div className="lingus-world__footer">
        <div className={`lingus-world__hint ${label ? 'has-target' : ''}`}>
          {commandReady ? (
            <MousePointer2 size={14} />
          ) : label ? (
            <MapPin size={14} />
          ) : (
            <Move size={13} />
          )}
          <span>
            {label ??
              (commandReady
                ? 'Scegli il bersaglio del tuo ordine'
                : 'Trascina per esplorare · usa la rotella per ingrandire')}
          </span>
        </div>
        <div className="lingus-world__scale" aria-hidden="true">
          <span>0</span>
          <i />
          <span>{hasConcept(state, 'O_08') ? `${mapSpan} m` : 'Nelle vicinanze'}</span>
        </div>
      </div>
      <button
        className="lingus-world__minimap"
        type="button"
        aria-label="Centra la mappa sull'accampamento"
        onClick={focusCamp}
        title="Torna alla tribù"
      >
        <span>
          {state.tier >= 4 ? 'LA REGIONE' : 'LE TERRE ESPLORATE'} <span>↗</span>
        </span>
        <canvas ref={minimapRef} aria-hidden="true" />
      </button>
    </div>
  );
}
export default WorldMap;
