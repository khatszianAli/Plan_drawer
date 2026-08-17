"use strict";

/**
 * Drawing cancellation, undo/redo history, and ID normalization.
 */

function cancelDrawing() {
  isDrawing = false;
  drawStart = null;
  drawStartBase = null;
  drawStartAttachment = null;
  drawCurrent = null;
  if (!eraserDrawing) {
    $("smart-input").classList.add("hidden");
    $("length-input").blur();
  }
}
function snapshot(layer = activeLayer) {
  return layer === "roof" ? deepClone(roofs) : deepClone(walls);
}
function commitHistory(layer = activeLayer) {
  const history = layerHistories[layer];
  const historyIndex = layerHistoryIndexes[layer];
  const state = snapshot(layer);
  const current = history[historyIndex];
  if (current && JSON.stringify(current) === JSON.stringify(state)) return;
  layerHistories[layer] = history.slice(0, historyIndex + 1);
  layerHistories[layer].push(state);
  if (layerHistories[layer].length > MAX_HISTORY) layerHistories[layer].shift();
  layerHistoryIndexes[layer] = layerHistories[layer].length - 1;
  updateHistoryButtons();
  scheduleAutosave();
}
function initializeHistory() {
  layerHistories = { walls: [snapshot("walls")], roof: [snapshot("roof")] };
  layerHistoryIndexes = { walls: 0, roof: 0 };
  updateHistoryButtons();
}
function restoreHistory(index, layer = activeLayer) {
  const history = layerHistories[layer];
  if (index < 0 || index >= history.length) return;
  layerHistoryIndexes[layer] = index;
  if (layer === "roof") {
    roofs = deepClone(history[index]).map(createRoof);
    normalizeRoofHierarchy(roofs);
  }
  else walls = deepClone(history[index]).map(createWall);
  walls.forEach((w) => {
    w.Thickness = FIXED_WALL_THICKNESS;
  });
  selectedIds.clear();
  cancelDrawing();
  cancelLinearEraser();
  normalizeIds();
  runValidation(false);
  updateSelectionUI();
  updateHistoryButtons();
  scheduleAutosave();
  draw();
}
function undo() {
  const layer = activeLayer;
  restoreHistory(layerHistoryIndexes[layer] - 1, layer);
}
function redo() {
  const layer = activeLayer;
  restoreHistory(layerHistoryIndexes[layer] + 1, layer);
}
function updateHistoryButtons() {
  const layer = activeLayer;
  $("btn-undo").disabled = layerHistoryIndexes[layer] <= 0;
  $("btn-redo").disabled = layerHistoryIndexes[layer] >= layerHistories[layer].length - 1;
}
function normalizeIds() {
  const used = new Set();
  walls.forEach((w) => {
    if (!w.Id || used.has(w.Id)) w.Id = newId();
    used.add(w.Id);
  });
  roofs.forEach((r) => {
    if (!r.Id || used.has(r.Id)) r.Id = newRoofId();
    used.add(r.Id);
  });
}
