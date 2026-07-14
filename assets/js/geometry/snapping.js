"use strict";

/**
 * Physical-face snapping and attachment calculations.
 */

function projectPointToWallBody(x, y, w) {
  const r = wallBounds(w);
  if (!pointInsideRect(x, y, r)) {
    return { x: clamp(x, r.minX, r.maxX), y: clamp(y, r.minY, r.maxY) };
  }
  const candidates = [
    { x: r.minX, y },
    { x: r.maxX, y },
    { x, y: r.minY },
    { x, y: r.maxY },
  ];
  candidates.sort(
    (a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y),
  );
  return candidates[0];
}
function nearestSnapPoint(x, y, excludeIds = new Set()) {
  const maxWorld = SNAP_SCREEN_PX / view.scale;
  let result = { x, y, snapped: false, kind: null, wallId: null };
  let best = maxWorld;
  for (const w of walls) {
    if (excludeIds.has(w.Id)) continue;
    const r = wallBounds(w);
    const points = [
      { x: w.StartX, y: w.StartY, kind: "центр торца" },
      { x: w.EndX, y: w.EndY, kind: "центр торца" },
      ...wallPhysicalCorners(w),
      { x: (r.minX + r.maxX) / 2, y: r.minY, kind: "грань" },
      { x: (r.minX + r.maxX) / 2, y: r.maxY, kind: "грань" },
      { x: r.minX, y: (r.minY + r.maxY) / 2, kind: "грань" },
      { x: r.maxX, y: (r.minY + r.maxY) / 2, kind: "грань" },
    ];
    for (const point of points) {
      const d = Math.hypot(point.x - x, point.y - y);
      if (d < best) {
        best = d;
        result = { ...point, snapped: true, wallId: w.Id };
      }
    }
    const projected = projectPointToWallBody(x, y, w);
    const d = Math.hypot(projected.x - x, projected.y - y);
    if (d < best) {
      best = d;
      result = {
        ...projected,
        snapped: true,
        kind: "физическая грань",
        wallId: w.Id,
      };
    }
  }
  return result;
}
function projectPointToWall(x, y, w) {
  if (isHorizontal(w)) {
    const min = Math.min(w.StartX, w.EndX),
      max = Math.max(w.StartX, w.EndX);
    return { x: clamp(x, min, max), y: w.StartY };
  }
  if (isVertical(w)) {
    const min = Math.min(w.StartY, w.EndY),
      max = Math.max(w.StartY, w.EndY);
    return { x: w.StartX, y: clamp(y, min, max) };
  }
  return null;
}
function snapAxis(value, axis, excludeIds = new Set()) {
  const threshold = SNAP_SCREEN_PX / view.scale;
  let best = value;
  let bestDistance = threshold;
  for (const w of walls) {
    if (excludeIds.has(w.Id)) continue;
    const r = wallBounds(w);
    const values =
      axis === "x"
        ? [w.StartX, w.EndX, r.minX, r.maxX]
        : [w.StartY, w.EndY, r.minY, r.maxY];
    for (const v of values) {
      const d = Math.abs(v - value);
      if (d < bestDistance) {
        best = v;
        bestDistance = d;
      }
    }
  }
  return best;
}
function findWallAttachment(x, y, excludeIds = new Set()) {
  const maxWorld = SNAP_SCREEN_PX / view.scale;
  let best = null;
  let bestDistance = maxWorld;
  for (const w of walls) {
    if (excludeIds.has(w.Id)) continue;
    const r = wallBounds(w);
    const distance = pointRectDistance(x, y, r);
    if (distance <= bestDistance) {
      bestDistance = distance;
      best = {
        wallId: w.Id,
        point: projectPointToWallBody(x, y, w),
        rawPoint: { x, y },
      };
    }
  }
  return best;
}
function resolveStartAttachment(attachment, orientation, sign) {
  if (!attachment) return null;
  const target = wallById(attachment.wallId);
  if (!target) return null;
  const r = wallBounds(target);
  const half = FIXED_WALL_THICKNESS / 2;
  const anchor = attachment.rawPoint || attachment.point;
  if (orientation === "x") {
    if (isVertical(target)) {
      return {
        x: sign > 0 ? r.maxX : r.minX,
        y: clampForWallFace(anchor.y, r.minY, r.maxY, half),
      };
    }
    if (isHorizontal(target)) {
      return {
        x:
          sign > 0
            ? Math.max(target.StartX, target.EndX)
            : Math.min(target.StartX, target.EndX),
        y: target.StartY,
      };
    }
  } else {
    if (isHorizontal(target)) {
      return {
        x: clampForWallFace(anchor.x, r.minX, r.maxX, half),
        y: sign > 0 ? r.maxY : r.minY,
      };
    }
    if (isVertical(target)) {
      return {
        x: target.StartX,
        y:
          sign > 0
            ? Math.max(target.StartY, target.EndY)
            : Math.min(target.StartY, target.EndY),
      };
    }
  }
  return null;
}
function snapEndpointToPhysicalFace(
  rawEnd,
  start,
  orientation,
  sign,
  excludeIds = new Set(),
) {
  const maxWorld = SNAP_SCREEN_PX / view.scale;
  const half = FIXED_WALL_THICKNESS / 2;
  let best = null;
  let bestScore = Infinity;
  for (const target of walls) {
    if (excludeIds.has(target.Id)) continue;
    const r = wallBounds(target);
    const bodyDistance = pointRectDistance(rawEnd.x, rawEnd.y, r);
    if (bodyDistance > maxWorld) continue;
    let candidate = null;
    if (orientation === "x") {
      if (isVertical(target)) {
        candidate = {
          x: sign > 0 ? r.minX : r.maxX,
          y: clampForWallFace(rawEnd.y, r.minY, r.maxY, half),
        };
      } else if (
        isHorizontal(target) &&
        Math.abs(rawEnd.y - target.StartY) <= maxWorld
      ) {
        candidate = {
          x:
            sign > 0
              ? Math.min(target.StartX, target.EndX)
              : Math.max(target.StartX, target.EndX),
          y: target.StartY,
        };
      }
      if (!candidate || sign * (candidate.x - start.x) <= 0.5) continue;
    } else {
      if (isHorizontal(target)) {
        candidate = {
          x: clampForWallFace(rawEnd.x, r.minX, r.maxX, half),
          y: sign > 0 ? r.minY : r.maxY,
        };
      } else if (
        isVertical(target) &&
        Math.abs(rawEnd.x - target.StartX) <= maxWorld
      ) {
        candidate = {
          x: target.StartX,
          y:
            sign > 0
              ? Math.min(target.StartY, target.EndY)
              : Math.max(target.StartY, target.EndY),
        };
      }
      if (!candidate || sign * (candidate.y - start.y) <= 0.5) continue;
    }
    const score =
      bodyDistance +
      Math.hypot(candidate.x - rawEnd.x, candidate.y - rawEnd.y) * 0.02;
    if (score < bestScore) {
      bestScore = score;
      best = {
        ...candidate,
        snapped: true,
        wallId: target.Id,
        kind: "стык по грани",
      };
    }
  }
  return best || { ...rawEnd, snapped: false };
}
