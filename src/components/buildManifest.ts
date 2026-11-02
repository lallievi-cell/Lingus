import type { BuildInfo } from '../buildInfo';

/** A release response is untrusted network data, even on the same origin. */
export function readBuildManifest(value: unknown): BuildInfo | null {
  if (!value || typeof value !== 'object') return null;
  const manifest = value as Record<string, unknown>;
  if (
    typeof manifest.version !== 'string' ||
    !/^(?:development|\d+\.\d+\.\d+(?:-[0-9a-z.-]+)?(?:\+[0-9a-z.-]+)?)$/i.test(manifest.version) ||
    manifest.version.length > 64 ||
    typeof manifest.commit !== 'string' ||
    !/^(?:development|[0-9a-f]{40})$/i.test(manifest.commit) ||
    typeof manifest.builtAt !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(manifest.builtAt) ||
    !Number.isFinite(Date.parse(manifest.builtAt))
  )
    return null;
  return {
    version: manifest.version,
    commit: manifest.commit.toLowerCase(),
    builtAt: manifest.builtAt,
  };
}

export function sameBuild(left: BuildInfo, right: BuildInfo) {
  return left.commit.toLowerCase() === right.commit.toLowerCase() && left.version === right.version;
}
