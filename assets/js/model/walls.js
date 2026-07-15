"use strict";

/**
 * Wall creation, normalization, and build settings.
 */

function normalizePositiveInteger(value, fallback = 1) {
  const parsed = Math.round(Number(value));
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : fallback;
}
function updateBuildSettingsUI() {
  $("draw-step").value = drawingStepMM;
  defaultWallThickness = FIXED_WALL_THICKNESS;
  $("default-thickness").value = FIXED_WALL_THICKNESS;
  $("build-settings-badge").textContent = `${drawingStepMM} мм`;
}
function setDrawingStep(value) {
  drawingStepMM = normalizePositiveInteger(value, drawingStepMM || 1);
  updateBuildSettingsUI();
  scheduleAutosave();
}
function setDefaultWallThickness() {
  defaultWallThickness = FIXED_WALL_THICKNESS;
  walls.forEach((w) => {
    w.Thickness = FIXED_WALL_THICKNESS;
  });
  updateBuildSettingsUI();
  scheduleAutosave();
}
function applyDefaultThicknessToAll() {
  if (!walls.length)
    return showModal(
      "Толщина стен",
      "На плане пока нет стен. Указанная толщина будет использоваться для новых стен.",
    );
  walls.forEach((w) => {
    w.Thickness = FIXED_WALL_THICKNESS;
  });
  commitHistory();
  updateSelectionUI();
  draw();
}
function applySelectionThickness() {
  if (!selectedIds.size) return;
  walls.forEach((w) => {
    if (selectedIds.has(w.Id)) w.Thickness = FIXED_WALL_THICKNESS;
  });
  commitHistory();
  updateSelectionUI();
  draw();
}
function createWall(raw = {}) {
  const sx = Number(raw.StartX);
  const sy = Number(raw.StartY);
  const ex = Number(raw.EndX);
  const ey = Number(raw.EndY);
  return {
    Id: typeof raw.Id === "string" && raw.Id.trim() ? raw.Id : newId(),
    Name: typeof raw.Name === "string" ? raw.Name : "",
    IsVeranda: Boolean(raw.IsVeranda),
    IsLoadBearing: raw.IsLoadBearing !== false,
    Thickness: FIXED_WALL_THICKNESS,
    StartX: sx,
    StartY: sy,
    EndX: ex,
    EndY: ey,
  };
}
function repairLegacySnappedWall(w, maxDeviation = AUTO_JOIN_GAP_MM) {
  if (!w || isAxisAligned(w)) return false;
  const dx = Math.abs(w.EndX - w.StartX);
  const dy = Math.abs(w.EndY - w.StartY);
  if (dx <= maxDeviation && dy > dx) {
    w.EndX = w.StartX;
    return true;
  }
  if (dy <= maxDeviation && dx > dy) {
    w.EndY = w.StartY;
    return true;
  }
  return false;
}
function wallsAreNearDuplicates(a, b, maxOffset = AUTO_JOIN_GAP_MM) {
  if (!a || !b || !isAxisAligned(a) || !isAxisAligned(b)) return false;
  const horizontal = isHorizontal(a);
  if (horizontal !== isHorizontal(b)) return false;
  const axisOffset = horizontal
    ? Math.abs(a.StartY - b.StartY)
    : Math.abs(a.StartX - b.StartX);
  if (axisOffset > maxOffset) return false;
  const aMin = horizontal
    ? Math.min(a.StartX, a.EndX)
    : Math.min(a.StartY, a.EndY);
  const aMax = horizontal
    ? Math.max(a.StartX, a.EndX)
    : Math.max(a.StartY, a.EndY);
  const bMin = horizontal
    ? Math.min(b.StartX, b.EndX)
    : Math.min(b.StartY, b.EndY);
  const bMax = horizontal
    ? Math.max(b.StartX, b.EndX)
    : Math.max(b.StartY, b.EndY);
  const overlap = Math.max(0, Math.min(aMax, bMax) - Math.max(aMin, bMin));
  const shorter = Math.min(aMax - aMin, bMax - bMin);
  return shorter >= 1 && overlap / shorter >= 0.9;
}
// Полная структура используется только для внутреннего автосохранения.
function cleanWallForStorage(w) {
  return {
    Id: w.Id,
    Name: w.Name || "",
    IsVeranda: Boolean(w.IsVeranda),
    IsLoadBearing: Boolean(w.IsLoadBearing),
    Thickness: FIXED_WALL_THICKNESS,
    StartX: Math.round(w.StartX),
    StartY: Math.round(w.StartY),
    EndX: Math.round(w.EndX),
    EndY: Math.round(w.EndY),
  };
}
// Публичный экспорт содержит геометрию и заданное пользователем название стены.
function cleanWallForJSONExport(w) {
  return {
    Name: w.Name || "",
    IsVeranda: Boolean(w.IsVeranda),
    StartX: Math.round(w.StartX),
    EndX: Math.round(w.EndX),
    StartY: Math.round(w.StartY),
    EndY: Math.round(w.EndY),
  };
}
