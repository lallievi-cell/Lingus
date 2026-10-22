import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Crosshair, Minus, Plus, Move, MapPin, MousePointer2 } from 'lucide-react';
import type { GameState, WorldTarget } from '../game/types';
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
import { entityTargetPresentation, targetPresentation } from './targetPresentation';
import './WorldMap.css';

interface WorldMapProps {
  state: GameState;
  selectedTarget: WorldTarget | null;
  onSelect: (target: WorldTarget) => void;
  commandReady?: boolean;
  onSpark?: (sparkId: string) => void;
  groupAnchor?: WorldTarget | null;
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
  if (target.type === 'unit')
    return hasConcept(state, 'S_02')
      ? (state.units.find((u) => u.id === target.id)?.name ?? 'Un compagno')
      : 'Un compagno';
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
        : `${name} · Spento (richiede 1 legna per riaccenderlo)`;
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

export function WorldMap({
  state,
  selectedTarget,
  onSelect,
  commandReady = false,
  onSpark,
  groupAnchor = null,
}: WorldMapProps) {
  const containerRef = useRef<HTMLDivElement>(null),
    canvasRef = useRef<HTMLCanvasElement>(null),
    minimapRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef(state),
    anchorRef = useRef(groupAnchor),
    selectedRef = useRef(selectedTarget),
    hoveredRef = useRef<WorldTarget | null>(null),
    readyRef = useRef(commandReady);
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
  const terrain = useMemo(() => createTerrain(6842, state.seasonIndex), [state.seasonIndex]);
  const renderSizeRef = useRef(size);
  stateRef.current = state;
  anchorRef.current = groupAnchor;
  selectedRef.current = selectedTarget;
  readyRef.current = commandReady;
  renderSizeRef.current = size;
  viewRef.current = view;

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
    (clientX: number, clientY: number): WorldTarget => {
      const p = toWorld(clientX, clientY),
        current = stateRef.current,
        t = getTransform();
      const candidates: { target: WorldTarget; distance: number }[] = [];
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
        if (d < radius) candidates.push({ target: { type, id, x, y }, distance: d });
      };
      current.units
        .filter(
          (u) =>
            u.hp > 0 &&
            (!current.urbanized ||
              u.isKing ||
              ['delegating', 'frontline', 'frontline-returning'].includes(u.action)),
        )
        .forEach((u) => add('unit', u.id, u.x, u.y, 13, 9));
      for (const status of getCustodianStatuses(current)) {
        const unit = current.units.find((u) => u.id === status.unitId);
        if (!unit || current.urbanized) continue;
        add('unit', unit.id, unit.x, unit.y, 9, 28, {
          x: unit.x - (15 * SPRITE_SCALE) / WORLD_X,
          y: unit.y,
        });
      }
      for (const pile of getGroundPiles(current)) {
        add('entity', pile.entity.id, pile.entity.x, pile.entity.y, 18, 0, pile);
      }
      current.entities.forEach((e) => {
        if (e.kind === 'ground') return;
        if (e.kind === 'ore' && !hasConcept(current, 'O_07')) return;
        if (
          e.kind === 'wolf' &&
          current.time % 90 < 60 &&
          !e.attacked &&
          !current.units.some((u) => u.hp > 0 && Math.hypot(u.x - e.x, u.y - e.y) < 20)
        )
          return;
        if (e.amount <= 0 && !['tree', 'stone'].includes(e.kind)) return;
        add(
          'entity',
          e.id,
          e.x,
          e.y,
          e.kind === 'tree' || e.kind === 'mammoth' ? 25 : 20,
          e.kind === 'tree' ? 15 : 5,
        );
      });
      if (!current.urbanized)
        current.buildings
          .filter((b) => b.hp > 0)
          .forEach((b) => add('building', b.id, b.x, b.y, 22, 10));
      current.cities.forEach((c) => add('city', c.id, c.x, c.y, 27, 10));
      current.battalions
        .filter((b) => b.hp > 0)
        .forEach((b) => add('battalion', b.id, b.x, b.y, 22, 10));
      current.caravans
        .filter((c) => c.hp > 0 && !c.arrived)
        .forEach((c) => add('caravan', c.id, c.x, c.y, 21, 7));
      candidates.sort((a, b) => a.distance - b.distance);
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

  const zoom = useCallback((delta: number) => {
    setView((previous) => {
      const bounds = viewBounds(stateRef.current),
        span = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);
      const minZoom = stateRef.current.tier >= 4 ? 0.9 : Math.max(1, 400 / span);
      return {
        ...previous,
        zoom: clamp(Math.round((previous.zoom + delta) * 100) / 100, minZoom, 8),
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
        current.paused ? current.time : current.time + (timestamp % 1000) / 1000,
        selectedRef.current,
        hoveredRef.current,
        readyRef.current,
        anchorRef.current,
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
      miniCtx.fillStyle = '#61764a';
      current.units
        .filter(
          (u) =>
            u.hp > 0 &&
            (!current.urbanized ||
              u.isKing ||
              ['delegating', 'frontline', 'frontline-returning'].includes(u.action)),
        )
        .forEach((u) => {
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
      className={`lingus-world ${dragging ? 'is-panning' : ''} ${commandReady ? 'is-targeting' : ''} ${details ? 'has-resource-focus' : ''}`}
    >
      <canvas
        ref={canvasRef}
        className="lingus-world__canvas"
        aria-label="Mappa della valle: seleziona risorse, abitanti e luoghi per dare un ordine alla tribù"
        role="img"
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          const t = getTransform();
          pointerRef.current = {
            x: event.clientX,
            y: event.clientY,
            centerX: t.centerX,
            centerY: t.centerY,
            moved: false,
          };
        }}
        onPointerMove={(event) => {
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
          } else {
            const nextTarget = hitTest(event.clientX, event.clientY),
              next = nextTarget.type === 'point' ? null : nextTarget;
            hoveredRef.current = next;
            setHovered((previous) => (previous?.id === next?.id ? previous : next));
          }
        }}
        onPointerUp={(event) => {
          const pointer = pointerRef.current;
          pointerRef.current = null;
          setDragging(false);
          if (!pointer || pointer.moved) return;
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
          onSelect(hitTest(event.clientX, event.clientY));
        }}
        onPointerCancel={() => {
          pointerRef.current = null;
          setDragging(false);
        }}
        onPointerLeave={() => {
          hoveredRef.current = null;
          setHovered(null);
        }}
      />
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
          data-resource-stage={details.kind}
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
                : 'Trascina per esplorare · rotella per avvicinarti')}
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
