"use strict";

/**
 * Physical wall rectangles and geometry helpers.
 */

function wallHalfThickness(w = null) {
  return (Number(w?.Thickness) || FIXED_WALL_THICKNESS) / 2;
}
function wallBounds(w) {
  const half = wallHalfThickness(w);
  if (isHorizontal(w)) {
    return {
      minX: Math.min(w.StartX, w.EndX),
      maxX: Math.max(w.StartX, w.EndX),
      minY: w.StartY - half,
      maxY: w.StartY + half,
    };
  }
  if (isVertical(w)) {
    return {
      minX: w.StartX - half,
      maxX: w.StartX + half,
      minY: Math.min(w.StartY, w.EndY),
      maxY: Math.max(w.StartY, w.EndY),
    };
  }
  return {
    minX: Math.min(w.StartX, w.EndX) - half,
    maxX: Math.max(w.StartX, w.EndX) + half,
    minY: Math.min(w.StartY, w.EndY) - half,
    maxY: Math.max(w.StartY, w.EndY) + half,
  };
}
function wallPhysicalCorners(w) {
  const r = wallBounds(w);
  return [
    { x: r.minX, y: r.minY, kind: "угол" },
    { x: r.minX, y: r.maxY, kind: "угол" },
    { x: r.maxX, y: r.minY, kind: "угол" },
    { x: r.maxX, y: r.maxY, kind: "угол" },
  ];
}
function pointRectDistance(x, y, r) {
  const dx = Math.max(r.minX - x, 0, x - r.maxX);
  const dy = Math.max(r.minY - y, 0, y - r.maxY);
  return Math.hypot(dx, dy);
}
function pointInsideRect(x, y, r, tolerance = 0) {
  return (
    x >= r.minX - tolerance &&
    x <= r.maxX + tolerance &&
    y >= r.minY - tolerance &&
    y <= r.maxY + tolerance
  );
}
function rectOverlapArea(a, b) {
  const width = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
  const height = Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY);
  return width > 0.001 && height > 0.001 ? width * height : 0;
}
function rectDistance(a, b) {
  const dx = Math.max(a.minX - b.maxX, b.minX - a.maxX, 0);
  const dy = Math.max(a.minY - b.maxY, b.minY - a.maxY, 0);
  return Math.hypot(dx, dy);
}
function rectSharedEdgeLength(a, b) {
  const overlapX = Math.max(
    0,
    Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX),
  );
  const overlapY = Math.max(
    0,
    Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY),
  );
  if (nearlyEqual(a.maxX, b.minX) || nearlyEqual(b.maxX, a.minX))
    return overlapY;
  if (nearlyEqual(a.maxY, b.minY) || nearlyEqual(b.maxY, a.minY))
    return overlapX;
  return 0;
}
function clampForWallFace(value, min, max, half) {
  const low = min + half;
  const high = max - half;
  return low <= high ? clamp(value, low, high) : (min + max) / 2;
}
