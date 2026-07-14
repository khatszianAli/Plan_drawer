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
function snapshot() {
  return { walls: deepClone(walls) };
}
function commitHistory() {
  const state = snapshot();
  const current = history[historyIndex];
  if (current && JSON.stringify(current) === JSON.stringify(state)) return;
  history = history.slice(0, historyIndex + 1);
  history.push(state);
  if (history.length > MAX_HISTORY) history.shift();
  historyIndex = history.length - 1;
  updateHistoryButtons();
  scheduleAutosave();
}
function initializeHistory() {
  history = [snapshot()];
  historyIndex = 0;
  updateHistoryButtons();
}
function restoreHistory(index) {
  if (index < 0 || index >= history.length) return;
  historyIndex = index;
  walls = deepClone(history[index].walls).map(createWall);
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
  restoreHistory(historyIndex - 1);
}
function redo() {
  restoreHistory(historyIndex + 1);
}
function updateHistoryButtons() {
  $("btn-undo").disabled = historyIndex <= 0;
  $("btn-redo").disabled = historyIndex >= history.length - 1;
}
function normalizeIds() {
  const used = new Set();
  walls.forEach((w) => {
    if (!w.Id || used.has(w.Id)) w.Id = newId();
    used.add(w.Id);
  });
}
