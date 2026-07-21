"use strict";

/**
 * World/screen coordinate conversion and canvas sizing.
 */

function worldToScreen(x, y) {
  return { x: view.originX + x * view.scale, y: view.originY + y * view.scale };
}
function screenToWorld(clientX, clientY) {
  const r = canvas.getBoundingClientRect();
  const sx = clientX - r.left;
  const sy = clientY - r.top;
  return {
    x: (sx - view.originX) / view.scale,
    y: (sy - view.originY) / view.scale,
    sx,
    sy,
  };
}
function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const width = workspace.clientWidth;
  const height = workspace.clientHeight;
  canvas.width = Math.max(1, Math.floor(width * dpr));
  canvas.height = Math.max(1, Math.floor(height * dpr));
  canvas.style.width = width + "px";
  canvas.style.height = height + "px";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (!Number.isFinite(view.originY)) view.originY = 50;
  draw();
}
function canvasSize() {
  return { width: workspace.clientWidth, height: workspace.clientHeight };
}
