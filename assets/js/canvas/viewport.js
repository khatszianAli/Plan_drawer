"use strict";

/**
 * Fit, pan-center, and zoom operations.
 */

function fitSelection() {
  const selected = walls.filter((w) => selectedIds.has(w.Id));
  if (selected.length) fitWalls(selected);
}
function fitPlan() {
  if (walls.length) fitWalls(walls);
  else resetView();
}
function fitWalls(items) {
  const size = canvasSize();
  const rects = items.map((w) => wallBounds(w));
  const minX = Math.min(...rects.map((r) => r.minX)),
    maxX = Math.max(...rects.map((r) => r.maxX));
  const minY = Math.min(...rects.map((r) => r.minY)),
    maxY = Math.max(...rects.map((r) => r.maxY));
  const padding = 70;
  const width = Math.max(500, maxX - minX),
    height = Math.max(500, maxY - minY);
  view.scale = clamp(
    Math.min(
      (size.width - padding * 2) / width,
      (size.height - padding * 2) / height,
    ),
    0.02,
    2,
  );
  const cx = (minX + maxX) / 2,
    cy = (minY + maxY) / 2;
  view.originX = size.width / 2 - cx * view.scale;
  view.originY = size.height / 2 + cy * view.scale;
  updateZoomIndicator();
  draw();
}
function centerOnWorld(x, y) {
  const size = canvasSize();
  view.originX = size.width / 2 - x * view.scale;
  view.originY = size.height / 2 + y * view.scale;
  draw();
}
function zoomAt(clientX, clientY, factor) {
  const p = screenToWorld(clientX, clientY);
  view.scale = clamp(view.scale * factor, 0.02, 2);
  view.originX = p.sx - p.x * view.scale;
  view.originY = p.sy + p.y * view.scale;
  updateZoomIndicator();
  draw();
}
function zoomAtCenter(factor) {
  const r = canvas.getBoundingClientRect();
  zoomAt(r.left + r.width / 2, r.top + r.height / 2, factor);
}
function resetView() {
  const size = canvasSize();
  view = { scale: 0.16, originX: 50, originY: size.height - 50 };
  updateZoomIndicator();
  draw();
}
function updateZoomIndicator() {
  $("zoom-value").textContent = `${Math.round((view.scale / 0.16) * 100)}%`;
}
