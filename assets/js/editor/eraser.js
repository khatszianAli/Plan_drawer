"use strict";

/**
 * Smart length input and linear eraser behavior.
 */

function setSmartInput(label, placeholder = "например 5000") {
  $("smart-input-label").textContent = label;
  $("length-input").placeholder = placeholder;
  $("smart-input").classList.remove("hidden");
  $("length-input").value = "";
  $("length-input").focus();
}
function startLinearEraserAt(p) {
  const snapped = nearestSnapPoint(p.x, p.y);
  eraserStart = snapped.snapped
    ? { x: snapped.x, y: snapped.y }
    : { x: roundStep(p.x), y: roundStep(p.y) };
  eraserCurrent = { ...eraserStart };
  eraserDrawing = true;
  setSmartInput("Удалить, мм:");
}
function updateLinearEraserPreview(p) {
  if (!eraserDrawing || !eraserStart) return;
  const horizontal =
    Math.abs(p.x - eraserStart.x) >= Math.abs(p.y - eraserStart.y);
  eraserDirection = horizontal ? "x" : "y";
  eraserSign = horizontal
    ? p.x >= eraserStart.x
      ? 1
      : -1
    : p.y >= eraserStart.y
      ? 1
      : -1;
  if (horizontal) {
    const x = roundStep(snapAxis(p.x, "x"));
    // Ластик всегда остаётся строго горизонтальным.
    eraserCurrent = { x, y: eraserStart.y };
  } else {
    const y = roundStep(snapAxis(p.y, "y"));
    // Ластик всегда остаётся строго вертикальным.
    eraserCurrent = { x: eraserStart.x, y };
  }
}
function cancelLinearEraser() {
  eraserDrawing = false;
  eraserStart = null;
  eraserCurrent = null;
  if (!isDrawing) {
    $("smart-input").classList.add("hidden");
    $("length-input").blur();
  }
}
function subtractEraserFromWall(w, eraser) {
  const horizontalErase = nearlyEqual(eraser.StartY, eraser.EndY);
  const verticalErase = nearlyEqual(eraser.StartX, eraser.EndX);
  if (
    horizontalErase &&
    isHorizontal(w) &&
    nearlyEqual(w.StartY, eraser.StartY)
  ) {
    const wallMin = Math.min(w.StartX, w.EndX);
    const wallMax = Math.max(w.StartX, w.EndX);
    const eraseMin = Math.min(eraser.StartX, eraser.EndX);
    const eraseMax = Math.max(eraser.StartX, eraser.EndX);
    const overlapMin = Math.max(wallMin, eraseMin);
    const overlapMax = Math.min(wallMax, eraseMax);
    if (overlapMax - overlapMin <= 0.001)
      return { changed: false, segments: [w] };
    const ranges = [];
    if (overlapMin - wallMin > 0.5) ranges.push([wallMin, overlapMin]);
    if (wallMax - overlapMax > 0.5) ranges.push([overlapMax, wallMax]);
    const forward = w.EndX >= w.StartX;
    const segments = ranges.map((range, index) => ({
      ...deepClone(w),
      Id: index === 0 ? w.Id : newId(),
      StartX: forward ? range[0] : range[1],
      EndX: forward ? range[1] : range[0],
      StartY: w.StartY,
      EndY: w.EndY,
    }));
    return { changed: true, segments };
  }
  if (verticalErase && isVertical(w) && nearlyEqual(w.StartX, eraser.StartX)) {
    const wallMin = Math.min(w.StartY, w.EndY);
    const wallMax = Math.max(w.StartY, w.EndY);
    const eraseMin = Math.min(eraser.StartY, eraser.EndY);
    const eraseMax = Math.max(eraser.StartY, eraser.EndY);
    const overlapMin = Math.max(wallMin, eraseMin);
    const overlapMax = Math.min(wallMax, eraseMax);
    if (overlapMax - overlapMin <= 0.001)
      return { changed: false, segments: [w] };
    const ranges = [];
    if (overlapMin - wallMin > 0.5) ranges.push([wallMin, overlapMin]);
    if (wallMax - overlapMax > 0.5) ranges.push([overlapMax, wallMax]);
    const forward = w.EndY >= w.StartY;
    const segments = ranges.map((range, index) => ({
      ...deepClone(w),
      Id: index === 0 ? w.Id : newId(),
      StartX: w.StartX,
      EndX: w.EndX,
      StartY: forward ? range[0] : range[1],
      EndY: forward ? range[1] : range[0],
    }));
    return { changed: true, segments };
  }
  return { changed: false, segments: [w] };
}
function commitLinearErase(manualLength = null) {
  if (!eraserDrawing || !eraserStart || !eraserCurrent) return;
  let end = { ...eraserCurrent };
  if (manualLength !== null) {
    const len = Math.abs(manualLength);
    end =
      eraserDirection === "x"
        ? { x: eraserStart.x + len * eraserSign, y: eraserStart.y }
        : { x: eraserStart.x, y: eraserStart.y + len * eraserSign };
  }
  end = { x: Math.round(end.x), y: Math.round(end.y) };
  if (Math.hypot(end.x - eraserStart.x, end.y - eraserStart.y) < 1) return;
  const eraser = {
    StartX: Math.round(eraserStart.x),
    StartY: Math.round(eraserStart.y),
    EndX: end.x,
    EndY: end.y,
  };
  let changed = false;
  const nextWalls = [];
  for (const w of walls) {
    const result = subtractEraserFromWall(w, eraser);
    if (result.changed) changed = true;
    nextWalls.push(...result.segments);
  }
  if (changed) {
    walls = nextWalls;
    selectedIds = new Set([...selectedIds].filter((id) => wallById(id)));
    removeExactDuplicates();
    commitHistory();
    runValidation(false);
    updateSelectionUI();
  }
  // Как при строительстве стены: следующий участок начинается в конце предыдущего.
  eraserStart = { ...end };
  eraserCurrent = { ...end };
  $("length-input").value = "";
  $("length-input").focus();
  draw();
}
function drawEraserPreview() {
  if (!eraserDrawing || !eraserStart || !eraserCurrent) return;
  const a = worldToScreen(eraserStart.x, eraserStart.y);
  const b = worldToScreen(eraserCurrent.x, eraserCurrent.y);
  const length = Math.round(
    Math.hypot(
      eraserCurrent.x - eraserStart.x,
      eraserCurrent.y - eraserStart.y,
    ),
  );
  ctx.save();
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.strokeStyle = "rgba(220, 38, 38, .18)";
  ctx.lineWidth = 18;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.strokeStyle = "#dc2626";
  ctx.lineWidth = 3;
  ctx.setLineDash([8, 5]);
  ctx.stroke();
  ctx.setLineDash([]);
  for (const p of [a, b]) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.strokeStyle = "#dc2626";
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  if (length > 0) {
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    ctx.font = "12px sans-serif";
    const text = String(length);
    const width = ctx.measureText(text).width;
    ctx.fillStyle = "rgba(220,38,38,.94)";
    ctx.fillRect(mx - width / 2 - 5, my - 12, width + 10, 24);
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, mx, my);
  }
  ctx.restore();
}
