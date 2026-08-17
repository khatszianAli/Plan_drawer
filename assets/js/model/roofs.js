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
function normalizeRoofSlope(raw = {}, forceFixed = false) {
  const isEditable = !forceFixed && raw.IsEditable !== false;
  return {
    IsEditable: isEditable,
    Type: isEditable ? null : normalizeRoofSlopeType(raw.Type),
  };
}
function normalizeRoofParentId(value) {
  return typeof value === "string" && value.trim() ? value : null;
}
function normalizeRoofRotation(value) {
  const rotation = Number(value);
  return Number.isFinite(rotation) ? ((Math.round(rotation / 90) * 90) % 360 + 360) % 360 : 0;
}
function createRoof(raw = {}) {
  const sx = Number(raw.StartX), sy = Number(raw.StartY);
  const ex = Number(raw.EndX), ey = Number(raw.EndY);
  const startX = Math.min(sx || 0, ex || 0), startY = Math.min(sy || 0, ey || 0);
  const endX = Math.max(sx || 0, ex || 0), endY = Math.max(sy || 0, ey || 0);
  const roofType = normalizeRoofType(raw.RoofType);
  const isRoot = roofType === "multi" && (raw.IsRoot === true || raw.Root === true);
  // Rotation is the position of the start of the ridge: 0=top, 90=right,
  // 180=bottom, 270=left. New blocks always start at the top.
  const rotation = normalizeRoofRotation(raw.Rotation);
  return {
    Id: typeof raw.Id === "string" && raw.Id.trim() ? raw.Id : newRoofId(),
    Name: typeof raw.Name === "string" ? raw.Name : "",
    StartX: startX, StartY: startY,
    EndX: endX, EndY: endY,
    BuildStage: normalizeBuildStage(raw.BuildStage),
    RoofType: roofType,
    Rotation: rotation,
    SlopeStart: normalizeRoofSlope(raw.SlopeStart, roofType === "multi" && !isRoot),
    SlopeEnd: normalizeRoofSlope(raw.SlopeEnd),
    IsRoot: isRoot,
    ParentId: roofType === "multi" || roofType === "concrete"
      ? normalizeRoofParentId(raw.ParentId ?? raw.Parent)
      : null,
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
  return normalizeRoofRotation(r.Rotation) % 180 === 0 ? "y" : "x";
}
function roofRidgeEndpoints(r) {
  const bounds = roofBounds(r);
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  const rotation = normalizeRoofRotation(r.Rotation);
  if (rotation === 0)
    return { start: { x: centerX, y: bounds.minY }, end: { x: centerX, y: bounds.maxY } };
  if (rotation === 90)
    return { start: { x: bounds.maxX, y: centerY }, end: { x: bounds.minX, y: centerY } };
  if (rotation === 180)
    return { start: { x: centerX, y: bounds.maxY }, end: { x: centerX, y: bounds.minY } };
  return { start: { x: bounds.minX, y: centerY }, end: { x: bounds.maxX, y: centerY } };
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
function roofRoot() {
  return roofs.find((roof) => roof.RoofType === "multi" && roof.IsRoot) || null;
}
function nextRoofBlockName(items = roofs) {
  let index = 1;
  const names = new Set(items.map((roof) => roof.Name));
  while (names.has(`Блок крыши ${index}`)) index++;
  return `Блок крыши ${index}`;
}
function normalizeRoofHierarchy(items) {
  const ids = new Set(items.map((roof) => roof.Id));
  let rootSeen = false;
  for (const roof of items) {
    if (roof.RoofType === "single") {
      roof.IsRoot = false;
      roof.ParentId = null;
      continue;
    }
    if (roof.RoofType === "concrete") {
      roof.IsRoot = false;
      if (roof.ParentId === roof.Id || !ids.has(roof.ParentId)) roof.ParentId = null;
      continue;
    }
    if (roof.IsRoot && !rootSeen) {
      rootSeen = true;
      roof.ParentId = null;
      roof.SlopeStart = normalizeRoofSlope(roof.SlopeStart);
    } else {
      roof.IsRoot = false;
      roof.SlopeStart = normalizeRoofSlope(roof.SlopeStart, true);
      if (roof.ParentId === roof.Id || !ids.has(roof.ParentId)) roof.ParentId = null;
    }
  }
}
function roofHierarchyIssue(items) {
  const ids = new Set(items.map((roof) => roof.Id));
  return items.find((roof) =>
    (roof.RoofType === "concrete" || (roof.RoofType === "multi" && !roof.IsRoot)) &&
    (!roof.ParentId || roof.ParentId === roof.Id || !ids.has(roof.ParentId))
  ) || null;
}
function cleanRoofForStorage(r) { return { ...r }; }
function cleanRoofForJSONExport(r, slopeImages = null) {
  const { IsRoot, ParentId, ...roof } = r;
  if (r.RoofType === "multi") {
    if (!IsRoot) delete roof.SlopeStart;
    for (const end of ["start", "end"]) {
      const key = end === "start" ? "SlopeStart" : "SlopeEnd";
      const image = slopeImages instanceof Map
        ? slopeImages.get(`${r.Id}:${end}`)
        : null;
      if (roof[key] && image) roof[key] = { ...roof[key], Image: image };
    }
  }
  return {
    ...roof,
    Root: r.RoofType === "multi" && IsRoot === true,
    Parent: r.RoofType === "multi" || r.RoofType === "concrete"
      ? normalizeRoofParentId(ParentId)
      : null,
  };
}
function newRoofId() { return "roof-" + (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`); }
