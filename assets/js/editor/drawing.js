"use strict";

/**
 * Wall drawing chain, including the first wall starting at (0, 0).
 */

function startDrawingAt(p) {
  // Первая вручную построенная стена — обычная или веранда — всегда
  // начинается точно в мировой координате (0, 0), независимо от места клика.
  if (walls.length === 0) {
    drawStartAttachment = null;
    drawStartBase = { x: 0, y: 0 };
    drawStart = { x: 0, y: 0 };
  } else {
    drawStartAttachment = findWallAttachment(p.x, p.y);
    if (drawStartAttachment) {
      drawStartBase = { ...drawStartAttachment.rawPoint };
      drawStart = { ...drawStartAttachment.point };
    } else {
      drawStartBase = { x: roundStep(p.x), y: roundStep(p.y) };
      drawStart = { ...drawStartBase };
    }
  }
  drawCurrent = { ...drawStart };
  isDrawing = true;
  setSmartInput(
    walls.length === 0 ? "Первая стена от (0, 0), мм:" : "Длина стены, мм:",
  );
}
function updateDrawingPreview(p) {
  if (!isDrawing) return;
  const base = drawStartBase || drawStart;
  const horizontal = Math.abs(p.x - base.x) >= Math.abs(p.y - base.y);
  drawDirection = horizontal ? "x" : "y";
  drawSign = horizontal ? (p.x >= base.x ? 1 : -1) : p.y >= base.y ? 1 : -1;
  const resolvedStart = resolveStartAttachment(
    drawStartAttachment,
    drawDirection,
    drawSign,
  );
  drawStart = resolvedStart
    ? { x: roundStep(resolvedStart.x), y: roundStep(resolvedStart.y) }
    : { ...base };
  let rawEnd;
  if (horizontal) {
    rawEnd = { x: roundStep(snapAxis(p.x, "x")), y: drawStart.y };
  } else {
    rawEnd = { x: drawStart.x, y: roundStep(snapAxis(p.y, "y")) };
  }
  const excluded = new Set(
    drawStartAttachment?.wallId ? [drawStartAttachment.wallId] : [],
  );
  const snapped = snapEndpointToPhysicalFace(
    rawEnd,
    drawStart,
    drawDirection,
    drawSign,
    excluded,
  );
  drawCurrent = { x: roundStep(snapped.x), y: roundStep(snapped.y) };
}
function commitDrawnWall(manualLength = null) {
  if (!isDrawing || !drawStart || !drawCurrent) return;
  let end = { ...drawCurrent };
  if (manualLength !== null) {
    const len = Math.abs(manualLength);
    end =
      drawDirection === "x"
        ? { x: drawStart.x + len * drawSign, y: drawStart.y }
        : { x: drawStart.x, y: drawStart.y + len * drawSign };
  }
  end = { x: Math.round(end.x), y: Math.round(end.y) };
  if (Math.hypot(end.x - drawStart.x, end.y - drawStart.y) < 1) return;
  const newWall = createWall({
    IsVeranda: activeWallType === "veranda",
    IsLoadBearing: true,
    Thickness: FIXED_WALL_THICKNESS,
    StartX: Math.round(drawStart.x),
    StartY: Math.round(drawStart.y),
    EndX: end.x,
    EndY: end.y,
  });
  walls.push(newWall);
  removeExactDuplicates();
  commitHistory();
  runValidation(false);
  // Следующий сегмент цепочки привязывается уже к физическому телу
  // только что созданной стены. При повороте на 90° начало автоматически
  // смещается на 75 мм к нужным граням и образует точный стык внахлёст 0 мм.
  drawStartBase = { ...end };
  drawStartAttachment = {
    wallId: newWall.Id,
    point: { ...end },
    rawPoint: { ...end },
  };
  drawStart = { ...end };
  drawCurrent = { ...end };
  $("length-input").value = "";
  $("length-input").focus();
  updateSelectionUI();
  draw();
}
function normalizedGeometryKey(w) {
  let a = [
    Math.round(w.StartX * 1000) / 1000,
    Math.round(w.StartY * 1000) / 1000,
  ];
  let b = [Math.round(w.EndX * 1000) / 1000, Math.round(w.EndY * 1000) / 1000];
  if (a[0] > b[0] || (a[0] === b[0] && a[1] > b[1])) [a, b] = [b, a];
  return `${a[0]},${a[1]}|${b[0]},${b[1]}`;
}
function removeExactDuplicates() {
  const seen = new Set();
  walls = walls.filter((w) => {
    const key = normalizedGeometryKey(w);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
