import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createGame, parseGame, serializeGame } from '../game/engine';
import { SaveRecoveryPanel } from '../components/SaveRecoveryPanel';
import { SessionStatus } from '../components/SessionStatus';
import {
  createSaveRepository,
  SAVE_KEY,
  SAVE_HISTORY_KEY,
  SAVE_METADATA_KEY,
  SAVE_DAMAGED_HISTORY_KEY,
  type SaveStorage,
} from './saveRepository';

class MemoryStorage implements SaveStorage {
  data = new Map<string, string>();
  writes: string[] = [];
  failKeys = new Set<string>();
  failReads = false;
  getItem(key: string) {
    if (this.failReads) throw new Error('Storage blocked');
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    if (this.failKeys.has(key)) throw new DOMException('Storage quota', 'QuotaExceededError');
    this.writes.push(key);
    this.data.set(key, value);
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
}

function gameAt(time = 10) {
  const game = createGame(6842, 'guided');
  game.started = true;
  game.time = time;
  game.stats.commands = Math.floor(time / 10);
  return game;
}

function fixture() {
  const storage = new MemoryStorage();
  let clock = 1_000;
  const repo = createSaveRepository(
    () => storage,
    () => clock++,
  );
  return { storage, repo };
}

describe('recoverable browser saves', () => {
  it('rejects a stale session before writing backups, metadata or the active slot', () => {
    const { storage, repo } = fixture();
    expect(repo.save(gameAt(10), { expectedRaw: null }).ok).toBe(true);
    const baseline = storage.data.get(SAVE_KEY)!;
    expect(repo.save(gameAt(20), { expectedRaw: baseline }).ok).toBe(true);
    const changed = new Map(storage.data);
    storage.writes = [];
    expect(repo.save(gameAt(30), { expectedRaw: baseline })).toMatchObject({
      ok: false,
      issue: { kind: 'conflict' },
    });
    expect(storage.data).toEqual(changed);
    expect(storage.writes).toEqual([]);
    // New-story/import permissions for damaged files do not bypass concurrency.
    expect(
      repo.save(gameAt(40), {
        expectedRaw: baseline,
        allowReplaceInvalid: true,
        reason: 'new-story',
      }),
    ).toMatchObject({ ok: false, issue: { kind: 'conflict' } });
    expect(storage.data).toEqual(changed);
  });

  it('also protects an initially empty slot and a slot removed by another tab', () => {
    const { storage, repo } = fixture();
    expect(repo.save(gameAt(10)).ok).toBe(true);
    const baseline = storage.data.get(SAVE_KEY)!;
    expect(repo.save(gameAt(20), { expectedRaw: null })).toMatchObject({
      ok: false,
      issue: { kind: 'conflict' },
    });
    storage.data.delete(SAVE_KEY);
    storage.writes = [];
    expect(repo.save(gameAt(30), { expectedRaw: baseline })).toMatchObject({
      ok: false,
      issue: { kind: 'conflict' },
    });
    expect(storage.data.has(SAVE_KEY)).toBe(false);
    expect(storage.writes).toEqual([]);
  });

  it('reads the unchanged legacy raw slot without writing or inventing a save date', () => {
    const { storage, repo } = fixture();
    const original = serializeGame(gameAt());
    storage.data.set(SAVE_KEY, original);
    const loaded = repo.load();
    expect(loaded.issue).toBeNull();
    expect(loaded.game).toMatchObject({ time: 10, paused: true, openingBalanceVersion: 1 });
    expect(loaded.lastSavedAt).toBeNull();
    expect(loaded.raw).toBe(original);
    expect(storage.writes).toEqual([]);
  });

  it('reports an unreadable active save and preserves every original byte until an explicit choice', () => {
    const { storage, repo } = fixture();
    const original = '{"version":2,"units":[';
    storage.data.set(SAVE_KEY, original);
    expect(repo.load()).toMatchObject({
      game: null,
      issue: { kind: 'invalid', raw: original },
      raw: original,
    });
    expect(repo.save(gameAt(), { reason: 'auto' })).toMatchObject({
      ok: false,
      issue: { kind: 'invalid' },
    });
    expect(storage.data.get(SAVE_KEY)).toBe(original);
    expect(storage.writes).toEqual([]);
    expect(repo.save(gameAt(), { reason: 'new-story', allowReplaceInvalid: true }).ok).toBe(true);
    expect(parseGame(storage.data.get(SAVE_KEY)!)).not.toBeNull();
  });

  it('keeps exactly the three latest distinct previous states and preserves counters/resources', () => {
    const { storage, repo } = fixture();
    for (const time of [10, 20, 30, 40, 50]) {
      const state = gameAt(time);
      state.resources.wood = time / 10;
      expect(repo.save(state, { reason: 'auto' }).ok).toBe(true);
    }
    const copies = repo.list();
    expect(copies).toHaveLength(3);
    expect(copies.map((entry) => entry.game.time)).toEqual([40, 30, 20]);
    expect(copies.map((entry) => entry.game.stats.commands)).toEqual([4, 3, 2]);
    expect(copies.map((entry) => entry.game.resources.wood)).toEqual([4, 3, 2]);
    expect(repo.load().game?.time).toBe(50);
    expect(JSON.parse(storage.data.get(SAVE_KEY)!)).not.toHaveProperty('savedAt');
    expect(JSON.parse(storage.data.get(SAVE_METADATA_KEY)!)).toMatchObject({
      version: 1,
      reason: 'auto',
    });
  });

  it('does not fill backups by repeatedly saving an unchanged paused game', () => {
    const { repo } = fixture();
    const state = gameAt();
    state.paused = true;
    for (let i = 0; i < 5; i++) expect(repo.save(state).ok).toBe(true);
    expect(repo.list()).toEqual([]);
    expect(repo.save(gameAt(20)).ok).toBe(true);
    for (let i = 0; i < 5; i++) expect(repo.save(gameAt(20)).ok).toBe(true);
    expect(repo.list()).toHaveLength(1);
    expect(repo.list()[0].game.time).toBe(10);
  });

  it('does not replace the active game when its previous state cannot be backed up', () => {
    const { storage, repo } = fixture();
    const first = repo.save(gameAt(10));
    const original = storage.data.get(SAVE_KEY);
    storage.failKeys.add(SAVE_HISTORY_KEY);
    const failed = repo.save(gameAt(20));
    expect(failed).toMatchObject({
      ok: false,
      issue: { kind: 'write-failed' },
      lastSavedAt: first.lastSavedAt,
    });
    expect(storage.data.get(SAVE_KEY)).toBe(original);
    expect(repo.load().lastSavedAt).toBe(first.lastSavedAt);
  });

  it('retains the old active game even when the new primary write fails after backing up', () => {
    const { storage, repo } = fixture();
    const first = repo.save(gameAt());
    const original = storage.data.get(SAVE_KEY);
    storage.failKeys.add(SAVE_KEY);
    expect(repo.save(gameAt(20))).toMatchObject({ ok: false, lastSavedAt: first.lastSavedAt });
    expect(storage.data.get(SAVE_KEY)).toBe(original);
    expect(repo.list()[0].game.time).toBe(10);
    expect(repo.load().game?.time).toBe(10);
  });

  it('reports a successful game write with a warning if only the optional date cannot be written', () => {
    const { storage, repo } = fixture();
    storage.failKeys.add(SAVE_METADATA_KEY);
    const result = repo.save(gameAt());
    expect(result.ok).toBe(true);
    expect(result.warning).toContain('data');
    expect(result.lastSavedAt).toBe(1_000);
    expect(repo.load().game?.time).toBe(10);
    expect(repo.load().lastSavedAt).toBeNull();
  });

  it('does not trust metadata belonging to an externally imported or changed active slot', () => {
    const { storage, repo } = fixture();
    expect(repo.save(gameAt()).ok).toBe(true);
    expect(repo.load().lastSavedAt).not.toBeNull();
    storage.data.set(SAVE_KEY, serializeGame(gameAt(20)));
    expect(repo.load().lastSavedAt).toBeNull();
    expect(repo.load().game?.time).toBe(20);
  });

  it('restores a valid backup over damaged active data, paused and without changing the world', () => {
    const { storage, repo } = fixture();
    const state = gameAt();
    state.stats.births = 3;
    state.stats.deaths = 2;
    state.resources.pelt = 4;
    expect(repo.save(state).ok).toBe(true);
    expect(repo.save(gameAt(20)).ok).toBe(true);
    const copy = repo.list()[0];
    storage.data.set(SAVE_KEY, 'unreadable');
    const result = repo.restore(copy.id);
    expect(result.ok).toBe(true);
    expect(result.game).toEqual({ ...state, paused: true });
    expect(repo.load().game).toEqual({ ...state, paused: true });
  });

  it('archives three separate stories independently from the automatic backups', () => {
    const { repo } = fixture();
    for (const time of [10, 20, 30, 40]) expect(repo.archive(gameAt(time)).ok).toBe(true);
    expect(repo.save(gameAt(50)).ok).toBe(true);
    expect(repo.save(gameAt(60)).ok).toBe(true);
    expect(
      repo
        .list()
        .filter((entry) => entry.kind === 'archive')
        .map((entry) => entry.game.time),
    ).toEqual([40, 30, 20]);
    expect(
      repo
        .list()
        .filter((entry) => entry.kind === 'backup')
        .map((entry) => entry.game.time),
    ).toEqual([50]);
    const archived = repo.list().find((entry) => entry.kind === 'archive')!;
    expect(repo.restore(archived.id).game?.time).toBe(40);
  });

  it('ignores invalid backup games and preserves the damaged journal before any repair', () => {
    const { storage, repo } = fixture();
    expect(repo.save(gameAt()).ok).toBe(true);
    const damaged = JSON.stringify({
      version: 1,
      entries: [{ id: 'bad', kind: 'backup', raw: '{}', savedAt: 1 }],
    });
    storage.data.set(SAVE_HISTORY_KEY, damaged);
    expect(repo.load()).toMatchObject({ issue: { kind: 'invalid', raw: damaged } });
    expect(repo.list()).toEqual([]);
    expect(storage.data.get(SAVE_HISTORY_KEY)).toBe(damaged);
    expect(repo.save(gameAt(20)).ok).toBe(true);
    expect(storage.data.get(SAVE_DAMAGED_HISTORY_KEY)).toBe(damaged);
    expect(repo.list()[0].game.time).toBe(10);
  });

  it('returns recoverable storage failures without throwing or fabricating successful writes', () => {
    const denied = createSaveRepository(() => {
      throw new Error('Storage inaccessible');
    });
    expect(denied.load()).toMatchObject({ game: null, issue: { kind: 'unavailable' } });
    expect(denied.save(gameAt())).toMatchObject({ ok: false, lastSavedAt: null });
    expect(denied.archive(gameAt())).toMatchObject({ ok: false });
    expect(denied.restore('missing')).toMatchObject({ ok: false });
    expect(denied.remove('missing')).toBe(false);
  });

  it('rejects invalid in-memory state before touching any stored game', () => {
    const { storage, repo } = fixture();
    expect(repo.save(gameAt()).ok).toBe(true);
    const before = new Map(storage.data);
    const broken = gameAt(20);
    broken.resources.wood = Number.NaN;
    expect(repo.save(broken)).toMatchObject({ ok: false, issue: { kind: 'invalid' } });
    expect(storage.data).toEqual(before);
  });

  it('keeps a valid story and its controls readable when the saved date is outside the Date range', () => {
    const { storage, repo } = fixture();
    expect(repo.save(gameAt()).ok).toBe(true);
    const metadata = JSON.parse(storage.data.get(SAVE_METADATA_KEY)!);
    storage.data.set(SAVE_METADATA_KEY, JSON.stringify({ ...metadata, savedAt: 1e20 }));
    const loaded = repo.load();
    expect(loaded.game?.time).toBe(10);
    const markup = renderToStaticMarkup(
      createElement(SessionStatus, {
        details: true,
        status: { ok: true, issue: null, lastSavedAt: loaded.lastSavedAt },
        onExport: () => {},
        onRecovery: () => {},
        onResume: () => {},
      }),
    );
    expect(markup).toContain('Data dell’ultimo salvataggio non disponibile');
    expect(markup).toContain('Copie e storie');
    expect(repo.load().game?.time).toBe(10);
  });

  it('shows a recovery panel with explicit restore controls and export of the original damaged file', () => {
    const { storage, repo } = fixture();
    repo.save(gameAt());
    repo.save(gameAt(20));
    storage.data.set(SAVE_KEY, '{broken');
    const loaded = repo.load();
    const markup = renderToStaticMarkup(
      createElement(SaveRecoveryPanel, {
        load: loaded,
        candidates: loaded.recoveryCandidates,
        onRestore: () => {},
        onExportRaw: () => {},
      }),
    );
    expect(markup).toContain('role="alert"');
    expect(markup).toContain('Esporta il file originale');
    expect(markup).toContain('Scegli questa copia');
    expect(markup).toContain('Ogni copia viene aperta in pausa');
    expect(markup).not.toContain('Ripristina questa storia');
    expect(storage.data.get(SAVE_KEY)).toBe('{broken');
  });
});
