"use strict";

function normalizeRoofType(value) {
  return ["single", "concrete"].includes(value) ? value : "multi";
}
const ROOF_SLOPE_TYPES = [
  "gable",
  "hip",
  "hipWithVent",
  "hipConnector",
  "innetHipconnector",
  "gableConnector",
];
function normalizeRoofSlopeType(value) {
  return ROOF_SLOPE_TYPES.includes(value) ? value : "gable";
}
function normalizeRoofSlope(raw = {}) {
  const isEditable = raw.IsEditable !== false;
  return {
    IsEditable: isEditable,
    Type: isEditable ? null : normalizeRoofSlopeType(raw.Type),
  };
}
function normalizeRoofRotation(value, legacyDirection = null) {
  const legacy = { north: 0, east: 90, south: 180, west: 270 };
  if (Object.prototype.hasOwnProperty.call(legacy, legacyDirection)) return legacy[legacyDirection];
  const rotation = Number(value);
  return Number.isFinite(rotation) ? ((Math.round(rotation / 90) * 90) % 360 + 360) % 360 : 0;
}
function createRoof(raw = {}) {
  const sx = Number(raw.StartX), sy = Number(raw.StartY);
  const ex = Number(raw.EndX), ey = Number(raw.EndY);
  const startX = Math.min(sx || 0, ex || 0), startY = Math.min(sy || 0, ey || 0);
  const endX = Math.max(sx || 0, ex || 0), endY = Math.max(sy || 0, ey || 0);
  const roofType = normalizeRoofType(raw.RoofType);
  const hasStoredRotation = Number.isFinite(Number(raw.Rotation));
  const rotation = hasStoredRotation
    ? normalizeRoofRotation(raw.Rotation)
    : roofType === "multi"
      ? (endX - startX >= endY - startY ? 0 : 90)
      : normalizeRoofRotation(null, raw.SlopeDirection);
  return {
    Id: typeof raw.Id === "string" && raw.Id.trim() ? raw.Id : newRoofId(),
    Name: typeof raw.Name === "string" ? raw.Name : "",
    StartX: startX, StartY: startY,
    EndX: endX, EndY: endY,
    BuildStage: normalizeBuildStage(raw.BuildStage),
    RoofType: roofType,
    Rotation: rotation,
    SlopeStart: normalizeRoofSlope(raw.SlopeStart),
    SlopeEnd: normalizeRoofSlope(raw.SlopeEnd),
  };
}
function roofBounds(r) {
  return { minX: Math.min(r.StartX, r.EndX), maxX: Math.max(r.StartX, r.EndX), minY: Math.min(r.StartY, r.EndY), maxY: Math.max(r.StartY, r.EndY) };
}
function roofWidth(r) { const b = roofBounds(r); return b.maxX - b.minX; }
function roofHeight(r) { const b = roofBounds(r); return b.maxY - b.minY; }
function roofIntersection(a, b) {
  const ra = roofBounds(a), rb = roofBounds(b);
  const minX = Math.max(ra.minX, rb.minX), maxX = Math.min(ra.maxX, rb.maxX);
  const minY = Math.max(ra.minY, rb.minY), maxY = Math.min(ra.maxY, rb.maxY);
  return maxX - minX > 0.001 && maxY - minY > 0.001
    ? { minX, maxX, minY, maxY }
    : null;
}
function roofRidgeAxis(r) {
  return normalizeRoofRotation(r.Rotation) % 180 === 0 ? "x" : "y";
}
function roofRidgeEndpoints(r) {
  const bounds = roofBounds(r);
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  return roofRidgeAxis(r) === "x"
    ? {
        start: { x: bounds.minX, y: centerY },
        end: { x: bounds.maxX, y: centerY },
      }
    : {
        start: { x: centerX, y: bounds.minY },
        end: { x: centerX, y: bounds.maxY },
      };
}
function roofCrossWidth(r) {
  return roofRidgeAxis(r) === "x" ? roofHeight(r) : roofWidth(r);
}
function roofOverlapAllowed(a, b) {
  if (!(a.RoofType === "multi" &&
    b.RoofType === "multi" &&
    roofRidgeAxis(a) === roofRidgeAxis(b))) return false;
  const small = roofCrossWidth(a) < roofCrossWidth(b) ? a : b;
  const large = small === a ? b : a;
  if (nearlyEqual(roofCrossWidth(a), roofCrossWidth(b))) return false;
  const smallBounds = roofBounds(small), largeBounds = roofBounds(large);
  const crossContained = roofRidgeAxis(small) === "x"
    ? smallBounds.minY >= largeBounds.minY && smallBounds.maxY <= largeBounds.maxY
    : smallBounds.minX >= largeBounds.minX && smallBounds.maxX <= largeBounds.maxX;
  if (!crossContained) return false;
  const crossEdgeAligned = roofRidgeAxis(small) === "x"
    ? nearlyEqual(smallBounds.minY, largeBounds.minY) || nearlyEqual(smallBounds.maxY, largeBounds.maxY)
    : nearlyEqual(smallBounds.minX, largeBounds.minX) || nearlyEqual(smallBounds.maxX, largeBounds.maxX);
  if (!crossEdgeAligned) return false;
  const ridgeContained = roofRidgeAxis(small) === "x"
    ? smallBounds.minX >= largeBounds.minX && smallBounds.maxX <= largeBounds.maxX
    : smallBounds.minY >= largeBounds.minY && smallBounds.maxY <= largeBounds.maxY;
  const ridgeEdgeEnters = roofRidgeAxis(small) === "x"
    ? (smallBounds.minX > largeBounds.minX && smallBounds.minX < largeBounds.maxX) ||
      (smallBounds.maxX > largeBounds.minX && smallBounds.maxX < largeBounds.maxX)
    : (smallBounds.minY > largeBounds.minY && smallBounds.minY < largeBounds.maxY) ||
      (smallBounds.maxY > largeBounds.minY && smallBounds.maxY < largeBounds.maxY);
  return !ridgeContained && ridgeEdgeEnters;
}
function findInvalidRoofOverlap(items, changedIds = null) {
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i], b = items[j];
      if (changedIds && !changedIds.has(a.Id) && !changedIds.has(b.Id)) continue;
      if (roofIntersection(a, b) && !roofOverlapAllowed(a, b)) return { a, b };
    }
  }
  return null;
}
function cleanRoofForStorage(r) { return { ...r }; }
function cleanRoofForJSONExport(r) { return { ...r }; }
function newRoofId() { return "roof-" + (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`); }
