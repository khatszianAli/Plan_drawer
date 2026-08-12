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
function resolveJunctionExit(
  start,
  orientation,
  sign,
  excludeIds = new Set(),
) {
  const half = FIXED_WALL_THICKNESS / 2;
  let best = { ...start };
  let bestAdvance = 0;
  for (const target of walls) {
    if (excludeIds.has(target.Id)) continue;
    const perpendicular =
      orientation === "x" ? isVertical(target) : isHorizontal(target);
    if (!perpendicular) continue;
    const r = wallBounds(target);
    if (!pointInsideRect(start.x, start.y, r, 0.001)) continue;
    const candidate =
      orientation === "x"
        ? {
            x: sign > 0 ? r.maxX : r.minX,
            y: clampForWallFace(start.y, r.minY, r.maxY, half),
          }
        : {
            x: clampForWallFace(start.x, r.minX, r.maxX, half),
            y: sign > 0 ? r.maxY : r.minY,
          };
    const advance =
      orientation === "x"
        ? sign * (candidate.x - start.x)
        : sign * (candidate.y - start.y);
    if (advance >= -0.001 && advance > bestAdvance - 0.001) {
      best = candidate;
      bestAdvance = Math.max(0, advance);
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
  let resolved = null;
  if (orientation === "x") {
    if (isVertical(target)) {
      resolved = {
        x: sign > 0 ? r.maxX : r.minX,
        y: clampForWallFace(anchor.y, r.minY, r.maxY, half),
      };
    } else if (isHorizontal(target)) {
      resolved = {
        x:
          sign > 0
            ? Math.max(target.StartX, target.EndX)
            : Math.min(target.StartX, target.EndX),
        y: target.StartY,
      };
    }
  } else {
    if (isHorizontal(target)) {
      resolved = {
        x: clampForWallFace(anchor.x, r.minX, r.maxX, half),
        y: sign > 0 ? r.maxY : r.minY,
      };
    } else if (isVertical(target)) {
      resolved = {
        x: target.StartX,
        y:
          sign > 0
            ? Math.max(target.StartY, target.EndY)
            : Math.min(target.StartY, target.EndY),
      };
    }
  }
  return resolved ? resolveJunctionExit(resolved, orientation, sign) : null;
}
function repairLegacyWallJunctions(w) {
  if (!w || !isAxisAligned(w) || wallLength(w) < 1) return false;
  const orientation = isHorizontal(w) ? "x" : "y";
  const delta =
    orientation === "x" ? w.EndX - w.StartX : w.EndY - w.StartY;
  const sign = delta > 0 ? 1 : -1;
  const excluded = new Set([w.Id]);
  const start = resolveJunctionExit(
    endpoint(w, "start"),
    orientation,
    sign,
    excluded,
  );
  const end = resolveJunctionExit(
    endpoint(w, "end"),
    orientation,
    -sign,
    excluded,
  );
  const changed =
    !nearlyEqual(start.x, w.StartX) ||
    !nearlyEqual(start.y, w.StartY) ||
    !nearlyEqual(end.x, w.EndX) ||
    !nearlyEqual(end.y, w.EndY);
  if (!changed) return false;
  w.StartX = start.x;
  w.StartY = start.y;
  w.EndX = end.x;
  w.EndY = end.y;
  return true;
}
function snapEndpointToPhysicalFace(
  rawEnd,
  start,
  orientation,
  sign,
  excludeIds = new Set(),
  maxWorld = SNAP_SCREEN_PX / view.scale,
) {
  const half = FIXED_WALL_THICKNESS / 2;
  let best = null;
  let bestScore = Infinity;
  for (const target of walls) {
    if (excludeIds.has(target.Id)) continue;
    const r = wallBounds(target);
    let candidate = null;
    if (orientation === "x") {
      if (
        isVertical(target) &&
        rawEnd.y >= r.minY + half - 0.001 &&
        rawEnd.y <= r.maxY - half + 0.001
      ) {
        candidate = {
          x: sign > 0 ? r.minX : r.maxX,
          y: start.y,
        };
      } else if (
        isHorizontal(target) &&
        nearlyEqual(rawEnd.y, target.StartY)
      ) {
        candidate = {
          x:
            sign > 0
              ? Math.min(target.StartX, target.EndX)
              : Math.max(target.StartX, target.EndX),
          y: start.y,
        };
      }
      if (
        !candidate ||
        Math.abs(candidate.x - rawEnd.x) > maxWorld ||
        sign * (candidate.x - start.x) <= 0.5
      )
        continue;
    } else {
      if (
        isHorizontal(target) &&
        rawEnd.x >= r.minX + half - 0.001 &&
        rawEnd.x <= r.maxX - half + 0.001
      ) {
        candidate = {
          x: start.x,
          y: sign > 0 ? r.minY : r.maxY,
        };
      } else if (
        isVertical(target) &&
        nearlyEqual(rawEnd.x, target.StartX)
      ) {
        candidate = {
          x: start.x,
          y:
            sign > 0
              ? Math.min(target.StartY, target.EndY)
              : Math.max(target.StartY, target.EndY),
        };
      }
      if (
        !candidate ||
        Math.abs(candidate.y - rawEnd.y) > maxWorld ||
        sign * (candidate.y - start.y) <= 0.5
      )
        continue;
    }
    const score = Math.hypot(
      candidate.x - rawEnd.x,
      candidate.y - rawEnd.y,
    );
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

function autoJoinWallEndpoint(
  w,
  which,
  excludeIds = null,
  maxGap = AUTO_JOIN_GAP_MM,
) {
  if (!w || !isAxisAligned(w)) return false;
  const excluded = excludeIds || new Set([w.Id]);
  const moving = endpoint(w, which);
  const fixed = endpoint(w, which === "start" ? "end" : "start");
  const orientation = isHorizontal(w) ? "x" : "y";
  const delta =
    orientation === "x" ? moving.x - fixed.x : moving.y - fixed.y;
  if (Math.abs(delta) < 1) return false;
  const snapped = snapEndpointToPhysicalFace(
    moving,
    fixed,
    orientation,
    delta > 0 ? 1 : -1,
    excluded,
    maxGap,
  );
  if (!snapped.snapped) return false;
  if (which === "start") {
    w.StartX = snapped.x;
    w.StartY = snapped.y;
  } else {
    w.EndX = snapped.x;
    w.EndY = snapped.y;
  }
  return true;
}
