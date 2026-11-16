import {
  coastSegmentCuts,
  coastEdges,
  createCoastGeometry,
  isSeaPoint,
  type CoastPoint,
} from './coastGeometry';
import { isDryLandPoint, isDryLandSegment, isLandSegment } from './landNavigation';
import type { GameState } from './types';
import { isWorldPoint } from './worldDimensions';

/** One short dry approach reaches open water without crossing a bay, an
 * intervening island or a river before the final coast transition. */
export function isShoreConnection(state: GameState, land: CoastPoint, water: CoastPoint) {
  const coast = createCoastGeometry(state);
  const length = Math.hypot(water.x - land.x, water.y - land.y);
  if (
    !coast ||
    !isWorldPoint(state, land) ||
    !isWorldPoint(state, water) ||
    !isDryLandPoint(state, land) ||
    !isSeaPoint(state, water) ||
    length > 20 + 1e-8
  )
    return false;
  const at = (fraction: number) => ({
    x: land.x + (water.x - land.x) * fraction,
    y: land.y + (water.y - land.y) * fraction,
  });
  const cuts = coastSegmentCuts(coast, land, water);
  let wet = false;
  for (let index = 1; index < cuts.length; index++) {
    if (cuts[index] - cuts[index - 1] < 1e-10) continue;
    const sea = isSeaPoint(state, at((cuts[index] + cuts[index - 1]) / 2));
    if (!sea && wet) return false;
    if (sea && !wet) {
      // The quarter-metre physical coast boundary belongs to water. Keep the
      // approach strictly inside land while checking its whole exact corridor.
      const dryEnd = Math.max(0, cuts[index - 1] - 1e-6 / Math.max(length, 1));
      if (!isDryLandSegment(state, land, at(dryEnd))) return false;
    }
    wet ||= sea;
  }
  return wet;
}

/** A short physical jetty connects the selected dry workstation to open water.
 * The dry approach is checked independently of the sea route: a river or a
 * second piece of land cannot become an invisible part of this connection. */
export function findShoreAccess(
  state: GameState,
  landPoint: CoastPoint,
  maxDistance = 16,
): { land: CoastPoint; water: CoastPoint } | undefined {
  const coast = createCoastGeometry(state);
  if (
    !coast ||
    !Number.isFinite(maxDistance) ||
    maxDistance < 0 ||
    !isDryLandPoint(state, landPoint)
  )
    return undefined;
  const edges = coastEdges(coast);
  const candidates: { water: CoastPoint; shoreDistance: number }[] = [];
  for (const { a, b, inward } of edges) {
    const dx = b.x - a.x,
      dy = b.y - a.y,
      length = Math.hypot(dx, dy);
    const fraction = Math.max(
      0,
      Math.min(1, ((landPoint.x - a.x) * dx + (landPoint.y - a.y) * dy) / (length * length)),
    );
    const shore = { x: a.x + dx * fraction, y: a.y + dy * fraction };
    const shoreDistance = Math.hypot(landPoint.x - shore.x, landPoint.y - shore.y);
    if (shoreDistance > maxDistance) continue;
    const nx = (-dy * inward) / length,
      ny = (dx * inward) / length;
    const approach = { x: shore.x + nx, y: shore.y + ny };
    const water = { x: shore.x - nx * 3, y: shore.y - ny * 3 };
    if (
      !isWorldPoint(state, water) ||
      !isSeaPoint(state, water) ||
      !isDryLandPoint(state, approach) ||
      !isLandSegment(state, landPoint, approach) ||
      Math.hypot(landPoint.x - water.x, landPoint.y - water.y) > 20
    )
      continue;
    if (isShoreConnection(state, landPoint, water)) candidates.push({ water, shoreDistance });
  }
  candidates.sort((a, b) => a.shoreDistance - b.shoreDistance);
  return candidates.length
    ? { land: { x: landPoint.x, y: landPoint.y }, water: candidates[0].water }
    : undefined;
}
