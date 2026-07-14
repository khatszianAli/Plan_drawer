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
// Публичный экспорт намеренно содержит только согласованные поля.
function cleanWallForJSONExport(w) {
  return {
    IsVeranda: Boolean(w.IsVeranda),
    StartX: Math.round(w.StartX),
    EndX: Math.round(w.EndX),
    StartY: Math.round(w.StartY),
    EndY: Math.round(w.EndY),
  };
}
