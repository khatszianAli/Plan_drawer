"use strict";

/**
 * Canvas renderer: grid, walls, labels, guides, and selections.
 */

function draw() {
  const size = canvasSize();
  ctx.clearRect(0, 0, size.width, size.height);
  if (activeLayer === "walls") drawBackground();
  drawGrid();
  drawDrawingGuides();
  drawWallCollection(walls, false, { reference: activeLayer === "roof" });
  if (activeLayer === "roof") {
    drawRoofCollection(roofs, false);
    drawRoofIntersections(roofs);
  }
  drawMoveGuides();
  if (isDrawing && drawStart && drawCurrent) {
    drawWallCollection(
      [
        {
          ...createWall({
            StartX: drawStart.x,
            StartY: drawStart.y,
            EndX: drawCurrent.x,
            EndY: drawCurrent.y,
            IsVeranda: activeWallType === "veranda",
            Thickness: defaultWallThickness,
          }),
          Id: "preview",
        },
      ],
      true,
    );
  }
  if (shapeDrag) {
    const previewWalls = shapeSegments(
      shapeDrag.start,
      shapeDrag.current,
      shapeDrag.tool,
      shapeDrag.wallType,
      shapeDrag.thickness,
    ).map((w, index) => ({ ...w, Id: `shape-preview-${index}` }));
    drawWallCollection(previewWalls, true);
  }
  if (roofDrag) drawRoofCollection([createRoof({ StartX: roofDrag.start.x, StartY: roofDrag.start.y, EndX: roofDrag.current.x, EndY: roofDrag.current.y, RoofType: roofType })], true);
  if (mode === "eraser") drawEraserPreview();
  drawSelection();
  drawSelectionBox();
  drawCalibration();
  updateStatus();
}
function drawGuideLabel(screenX, screenY, text, align = "left") {
  ctx.save();
  ctx.font = "600 12px sans-serif";
  ctx.textBaseline = "middle";
  const paddingX = 7;
  const height = 24;
  const width = ctx.measureText(text).width + paddingX * 2;
  let x = align === "right" ? screenX - width : screenX;
  x = clamp(x, 4, canvasSize().width - width - 4);
  const y = clamp(screenY - height / 2, 4, canvasSize().height - height - 4);
  ctx.fillStyle = "rgba(255,255,255,.96)";
  ctx.strokeStyle = "#10b981";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, 6);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#047857";
  ctx.textAlign = "left";
  ctx.fillText(text, x + paddingX, y + height / 2);
  ctx.restore();
}
function guideContactPoint(guide, axis) {
  if (!guide) return null;
  const moving = wallById(guide.movingId);
  const target = wallById(guide.targetId);
  if (!moving || !target) return null;
  const mr = wallBounds(moving);
  const tr = wallBounds(target);
  if (axis === "x") {
    const overlapMin = Math.max(mr.minY, tr.minY);
    const overlapMax = Math.min(mr.maxY, tr.maxY);
    const y =
      overlapMax >= overlapMin
        ? (overlapMin + overlapMax) / 2
        : (clamp((mr.minY + mr.maxY) / 2, tr.minY, tr.maxY) +
            clamp((tr.minY + tr.maxY) / 2, mr.minY, mr.maxY)) /
          2;
    return { x: guide.value, y };
  }
  const overlapMin = Math.max(mr.minX, tr.minX);
  const overlapMax = Math.min(mr.maxX, tr.maxX);
  const x =
    overlapMax >= overlapMin
      ? (overlapMin + overlapMax) / 2
      : (clamp((mr.minX + mr.maxX) / 2, tr.minX, tr.maxX) +
          clamp((tr.minX + tr.maxX) / 2, mr.minX, mr.maxX)) /
        2;
  return { x, y: guide.value };
}
// Направляющие и магнитная привязка при перемещении стены.
// Перемещение остаётся свободным; ограничение только вдоль существующих стен
// намеренно не используется, чтобы стену можно было поставить в любую точку.
function drawMoveGuides() {
  if (!drag || (drag.type !== "walls" && drag.type !== "handle")) return;
  const xGuide = activeMoveGuides.x;
  const yGuide = activeMoveGuides.y;
  if (!xGuide && !yGuide) return;
  const size = canvasSize();
  ctx.save();
  ctx.strokeStyle = "#10b981";
  ctx.lineWidth = 1.6;
  ctx.setLineDash([7, 5]);
  if (xGuide) {
    const x = worldToScreen(xGuide.value, 0).x;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, size.height);
    ctx.stroke();
  }
  if (yGuide) {
    const y = worldToScreen(0, yGuide.value).y;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size.width, y);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  const targetIds = new Set(
    [xGuide?.targetId, yGuide?.targetId].filter(Boolean),
  );
  for (const id of targetIds) {
    const target = wallById(id);
    if (!target) continue;
    const r = wallBounds(target);
    const topLeft = worldToScreen(r.minX, r.minY);
    const bottomRight = worldToScreen(r.maxX, r.maxY);
    ctx.strokeStyle = "#10b981";
    ctx.lineWidth = 2.2;
    ctx.strokeRect(
      topLeft.x,
      topLeft.y,
      bottomRight.x - topLeft.x,
      bottomRight.y - topLeft.y,
    );
  }
  for (const [axis, guide] of [
    ["x", xGuide],
    ["y", yGuide],
  ]) {
    if (!guide) continue;
    const point = guideContactPoint(guide, axis);
    if (point) {
      const s = worldToScreen(point.x, point.y);
      ctx.beginPath();
      ctx.arc(s.x, s.y, guide.contact ? 5 : 3.5, 0, Math.PI * 2);
      ctx.fillStyle = "#10b981";
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }
  ctx.restore();
  if (xGuide) {
    const x = worldToScreen(xGuide.value, 0).x;
    drawGuideLabel(
      x + 8,
      22,
      `X ${Math.round(xGuide.value)} мм · ${xGuide.kind}`,
    );
  }
  if (yGuide) {
    const y = worldToScreen(0, yGuide.value).y;
    drawGuideLabel(
      8,
      y - 8,
      `Y ${Math.round(yGuide.value)} мм · ${yGuide.kind}`,
    );
  }
}
// Зелёные направляющие через текущую точку строящейся стены.
// Они помогают видеть точное выравнивание по X и Y на всём холсте.
function drawDrawingGuides() {
  const guidePoint =
    isDrawing && drawCurrent
      ? drawCurrent
      : eraserDrawing && eraserCurrent
        ? eraserCurrent
        : null;
  if (!guidePoint) return;
  const size = canvasSize();
  const current = worldToScreen(guidePoint.x, guidePoint.y);
  ctx.save();
  ctx.strokeStyle = "#10b981";
  ctx.lineWidth = 1.4;
  ctx.setLineDash([6, 5]);
  ctx.beginPath();
  ctx.moveTo(current.x, 0);
  ctx.lineTo(current.x, size.height);
  ctx.moveTo(0, current.y);
  ctx.lineTo(size.width, current.y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.arc(current.x, current.y, 3.5, 0, Math.PI * 2);
  ctx.fillStyle = "#10b981";
  ctx.fill();
  ctx.restore();
}
function drawBackground() {
  if (
    !background.img ||
    !background.visible ||
    !background.width ||
    !background.height
  )
    return;
  const topLeft = worldToScreen(background.x, background.y);
  const drawWidth = background.width * view.scale;
  const drawHeight = background.height * view.scale;
  ctx.save();
  ctx.globalAlpha = background.opacity;
  ctx.translate(
    topLeft.x + (background.flipX ? drawWidth : 0),
    topLeft.y + (background.flipY ? drawHeight : 0),
  );
  ctx.scale(background.flipX ? -1 : 1, background.flipY ? -1 : 1);
  ctx.drawImage(
    background.img,
    0,
    0,
    drawWidth,
    drawHeight,
  );
  ctx.restore();
  if (mode === "background-move") {
    const bottomRight = worldToScreen(
      background.x + background.width,
      background.y + background.height,
    );
    ctx.save();
    ctx.strokeStyle = "#2563eb";
    ctx.lineWidth = 2;
    ctx.setLineDash([7, 5]);
    ctx.strokeRect(
      topLeft.x,
      topLeft.y,
      bottomRight.x - topLeft.x,
      bottomRight.y - topLeft.y,
    );
    ctx.setLineDash([]);
    for (const point of Object.values(backgroundCornerWorldPoints())) {
      const s = worldToScreen(point.x, point.y);
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "#2563eb";
      ctx.lineWidth = 2;
      ctx.fillRect(s.x - 6, s.y - 6, 12, 12);
      ctx.strokeRect(s.x - 6, s.y - 6, 12, 12);
    }
    const label = `${Math.round(background.width)} × ${Math.round(background.height)} мм`;
    ctx.font = "12px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    const cx = (topLeft.x + bottomRight.x) / 2,
      cy = Math.min(topLeft.y, bottomRight.y) - 8;
    const tw = ctx.measureText(label).width;
    ctx.fillStyle = "rgba(255,255,255,.94)";
    ctx.fillRect(cx - tw / 2 - 5, cy - 16, tw + 10, 18);
    ctx.fillStyle = "#1d4ed8";
    ctx.fillText(label, cx, cy);
    ctx.restore();
  }
}
function dynamicGridStep() {
  const steps = [50, 100, 200, 500, 1000, 2000, 5000, 10000];
  return steps.find((s) => s * view.scale >= 18) || 10000;
}
function drawGrid() {
  const size = canvasSize();
  const step = dynamicGridStep();
  const major = step * 5;
  const left = (0 - view.originX) / view.scale,
    right = (size.width - view.originX) / view.scale;
  const top = (0 - view.originY) / view.scale,
    bottom = (size.height - view.originY) / view.scale;
  const startX = Math.floor(left / step) * step,
    endX = Math.ceil(right / step) * step;
  const startY = Math.floor(top / step) * step,
    endY = Math.ceil(bottom / step) * step;
  ctx.save();
  for (let x = startX; x <= endX; x += step) {
    const s = worldToScreen(x, 0);
    ctx.beginPath();
    ctx.moveTo(s.x, 0);
    ctx.lineTo(s.x, size.height);
    ctx.strokeStyle = nearlyEqual(x % major, 0) ? "#d7dee9" : "#edf1f6";
    ctx.lineWidth = nearlyEqual(x % major, 0) ? 1.2 : 1;
    ctx.stroke();
  }
  for (let y = startY; y <= endY; y += step) {
    const s = worldToScreen(0, y);
    ctx.beginPath();
    ctx.moveTo(0, s.y);
    ctx.lineTo(size.width, s.y);
    ctx.strokeStyle = nearlyEqual(y % major, 0) ? "#d7dee9" : "#edf1f6";
    ctx.lineWidth = nearlyEqual(y % major, 0) ? 1.2 : 1;
    ctx.stroke();
  }
  const origin = worldToScreen(0, 0);
  ctx.strokeStyle = "#94a3b8";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(origin.x, 0);
  ctx.lineTo(origin.x, size.height);
  ctx.moveTo(0, origin.y);
  ctx.lineTo(size.width, origin.y);
  ctx.stroke();
  ctx.fillStyle = "#64748b";
  ctx.font = "11px sans-serif";
  ctx.fillText("0,0", origin.x + 5, origin.y - 6);
  ctx.restore();
}
function wallRenderStyle(w, preview = false) {
  return {
    color: invalidWallIds.has(w.Id)
      ? "#dc2626"
      : w.IsVeranda
        ? "#3b82f6"
        : preview
          ? "#6b7280"
          : "#374151",
    dashed: Boolean(w.IsVeranda),
  };
}
function drawPhysicalWallBody(w, style, preview = false, opacity = 1) {
  if (!isAxisAligned(w) || wallLength(w) < 1) return;
  const r = wallBounds(w);
  const topLeft = worldToScreen(r.minX, r.minY);
  const bottomRight = worldToScreen(r.maxX, r.maxY);
  const x = Math.min(topLeft.x, bottomRight.x);
  const y = Math.min(topLeft.y, bottomRight.y);
  const width = Math.abs(bottomRight.x - topLeft.x);
  const height = Math.abs(bottomRight.y - topLeft.y);
  ctx.save();
  if (style.dashed) {
    // Веранда тоже имеет настоящее тело 150 мм. Пунктир — только стиль
    // отображения, а не замена физической ширины стены.
    ctx.globalAlpha = (preview ? 0.18 : 0.12) * opacity;
    ctx.fillStyle = style.color;
    ctx.fillRect(x, y, width, height);
    ctx.globalAlpha = (preview ? 0.8 : 1) * opacity;
    ctx.strokeStyle = style.color;
    ctx.lineWidth = clamp(2 * (view.scale / 0.16), 1, 5);
    ctx.setLineDash([
      clamp(10 * (view.scale / 0.16), 4, 30),
      clamp(7 * (view.scale / 0.16), 3, 22),
    ]);
    ctx.strokeRect(x, y, width, height);
  } else {
    ctx.globalAlpha = (preview ? 0.72 : 1) * opacity;
    ctx.fillStyle = style.color;
    ctx.fillRect(x, y, width, height);
  }
  ctx.restore();
}
function drawWallLabel(w, preview = false) {
  const a = worldToScreen(w.StartX, w.StartY);
  const b = worldToScreen(w.EndX, w.EndY);
  const zoomRatio = view.scale / 0.16;
  const len = Math.round(wallLength(w));
  if (len <= 0 || view.scale <= 0.045) return;
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const fontSize = clamp(12 * zoomRatio, 9, 20);
  ctx.save();
  ctx.font = `${fontSize}px sans-serif`;
  const text = `${len}`;
  const tw = ctx.measureText(text).width;
  const padX = 4;
  const padY = clamp(4 * zoomRatio, 2, 7);
  ctx.fillStyle = preview ? "rgba(59,130,246,.92)" : "rgba(255,255,255,.92)";
  ctx.fillRect(
    mx - tw / 2 - padX,
    my - fontSize / 2 - padY,
    tw + padX * 2,
    fontSize + padY * 2,
  );
  ctx.fillStyle = preview ? "#fff" : "#111827";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, mx, my);
  ctx.restore();
}
function drawWallCollection(wallList, preview = false, options = {}) {
  if (!wallList.length) return;
  const reference = Boolean(options.reference);
  const opacity = reference ? 0.32 : 1;
  for (const w of wallList) {
    const style = wallRenderStyle(w, preview);
    drawPhysicalWallBody(w, style, preview, opacity);
  }
  if (!preview && !reference) {
    ctx.save();
    for (const w of wallList) {
      if (!selectedIds.has(w.Id)) continue;
      const r = wallBounds(w);
      const topLeft = worldToScreen(r.minX, r.minY);
      const bottomRight = worldToScreen(r.maxX, r.maxY);
      const x = Math.min(topLeft.x, bottomRight.x);
      const y = Math.min(topLeft.y, bottomRight.y);
      const width = Math.abs(bottomRight.x - topLeft.x);
      const height = Math.abs(bottomRight.y - topLeft.y);
      ctx.strokeStyle = "#f59e0b";
      ctx.lineWidth = 3;
      ctx.setLineDash([]);
      ctx.strokeRect(x - 1.5, y - 1.5, width + 3, height + 3);
    }
    ctx.restore();
  }
  if (!reference) wallList.forEach((w) => drawWallLabel(w, preview));
}
function drawSelection() {
  if (activeLayer === "roof") {
    if (selectedIds.size !== 1) return;
    const roof = roofById([...selectedIds][0]);
    if (!roof) return;
    const bounds = roofBounds(roof);
    const corners = [
      { x: bounds.minX, y: bounds.minY },
      { x: bounds.maxX, y: bounds.minY },
      { x: bounds.maxX, y: bounds.maxY },
      { x: bounds.minX, y: bounds.maxY },
    ];
    ctx.save();
    for (const point of corners) {
      const screen = worldToScreen(point.x, point.y);
      ctx.beginPath();
      ctx.rect(
        screen.x - HANDLE_RADIUS,
        screen.y - HANDLE_RADIUS,
        HANDLE_RADIUS * 2,
        HANDLE_RADIUS * 2,
      );
      ctx.fillStyle = "#fff";
      ctx.fill();
      ctx.strokeStyle = "#2563eb";
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    if (roof.RoofType === "multi") {
      const ridge = roofRidgeEndpoints(roof);
      for (const [end, point] of Object.entries(ridge)) {
        if (end === "start" && !roof.IsRoot) continue;
        const slope = normalizeRoofSlope(end === "end" ? roof.SlopeEnd : roof.SlopeStart);
        const screen = worldToScreen(point.x, point.y);
        ctx.beginPath();
        ctx.arc(screen.x, screen.y, HANDLE_RADIUS + 1, 0, Math.PI * 2);
        ctx.fillStyle = slope.IsEditable ? "#fff" : "#0f766e";
        ctx.fill();
        ctx.strokeStyle = slope.IsEditable ? "#2563eb" : "#134e4a";
        ctx.lineWidth = 3;
        ctx.stroke();
      }
    }
    ctx.restore();
    return;
  }
  if (selectedIds.size !== 1) return;
  const w = wallById([...selectedIds][0]);
  if (!w) return;
  [endpoint(w, "start"), endpoint(w, "end")].forEach((p) => {
    const s = worldToScreen(p.x, p.y);
    ctx.save();
    ctx.beginPath();
    ctx.arc(s.x, s.y, HANDLE_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.strokeStyle = "#2563eb";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();
  });
}
function drawRoofCollection(items, preview = false) {
  for (const r of items) {
    const b = roofBounds(r), a = worldToScreen(b.minX, b.minY), z = worldToScreen(b.maxX, b.maxY);
    const x = Math.min(a.x, z.x), y = Math.min(a.y, z.y), w = Math.abs(z.x - a.x), h = Math.abs(z.y - a.y);
    const concrete = r.RoofType === "concrete";
    ctx.save(); ctx.globalAlpha = preview ? 0.42 : 0.58; ctx.fillStyle = preview ? (concrete ? "#9ca3af" : "#f59e0b") : (concrete ? "#cbd5e1" : "#fbbf24"); ctx.fillRect(x, y, w, h); ctx.globalAlpha = 1;
    ctx.strokeStyle = selectedIds.has(r.Id) && activeLayer === "roof" ? "#dc2626" : (concrete ? "#64748b" : "#b45309"); ctx.lineWidth = selectedIds.has(r.Id) ? 3 : 2; ctx.setLineDash([7, 4]); ctx.strokeRect(x, y, w, h); ctx.setLineDash([]); ctx.strokeStyle = concrete ? "#475569" : "#92400e"; ctx.fillStyle = concrete ? "#475569" : "#92400e"; ctx.lineWidth = 2;
    if (r.RoofType === "multi") { const ridge = roofRidgeEndpoints(r); const start = worldToScreen(ridge.start.x, ridge.start.y); const end = worldToScreen(ridge.end.x, ridge.end.y); ctx.beginPath(); ctx.moveTo(start.x, start.y); ctx.lineTo(end.x, end.y); ctx.stroke(); }
    else if (r.RoofType === "single") { const sx = x + w / 2, sy = y + h / 2; const angle = (normalizeRoofRotation(r.Rotation) - 90) * Math.PI / 180; const distance = (Math.abs(Math.cos(angle)) * w + Math.abs(Math.sin(angle)) * h) * .28; const ex = sx + Math.cos(angle) * distance, ey = sy + Math.sin(angle) * distance; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.lineTo(ex - 9 * Math.cos(angle - .55), ey - 9 * Math.sin(angle - .55)); ctx.moveTo(ex, ey); ctx.lineTo(ex - 9 * Math.cos(angle + .55), ey - 9 * Math.sin(angle + .55)); ctx.stroke(); }
    if (r.BuildStage) { ctx.font = "600 11px sans-serif"; ctx.fillText(`Этап ${r.BuildStage}`, x + 6, y + 14); }
    ctx.restore();
  }
}
function drawRoofIntersections(items) {
  ctx.save();
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const intersection = roofIntersection(items[i], items[j]);
      if (!intersection || !roofOverlapAllowed(items[i], items[j])) continue;
      const a = worldToScreen(intersection.minX, intersection.minY);
      const b = worldToScreen(intersection.maxX, intersection.maxY);
      const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
      const width = Math.abs(b.x - a.x), height = Math.abs(b.y - a.y);
      ctx.fillStyle = "rgba(13, 148, 136, 0.55)";
      ctx.strokeStyle = "#0f766e";
      ctx.lineWidth = 2;
      ctx.fillRect(x, y, width, height);
      ctx.strokeRect(x, y, width, height);
    }
  }
  ctx.restore();
}
function drawSelectionBox() {
  if (!selectionBox) return;
  const x = Math.min(selectionBox.start.x, selectionBox.end.x),
    y = Math.min(selectionBox.start.y, selectionBox.end.y),
    w = Math.abs(selectionBox.end.x - selectionBox.start.x),
    h = Math.abs(selectionBox.end.y - selectionBox.start.y);
  ctx.save();
  ctx.fillStyle = "rgba(37,99,235,.08)";
  ctx.strokeStyle = "#2563eb";
  ctx.setLineDash([5, 4]);
  ctx.fillRect(x, y, w, h);
  ctx.strokeRect(x, y, w, h);
  ctx.restore();
}
function drawCalibration() {
  if (mode !== "calibrate" || !calibrationPoints.length) return;
  ctx.save();
  ctx.strokeStyle = "#7c3aed";
  ctx.fillStyle = "#7c3aed";
  ctx.lineWidth = 2;
  for (const p of calibrationPoints) {
    const s = worldToScreen(p.x, p.y);
    ctx.beginPath();
    ctx.arc(s.x, s.y, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  if (calibrationPoints.length === 1) {
    const a = worldToScreen(calibrationPoints[0].x, calibrationPoints[0].y),
      b = worldToScreen(mouseWorld.x, mouseWorld.y);
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  ctx.restore();
}
function updateStatus() {
  $("status-coords").textContent =
    `X: ${Math.round(mouseWorld.x)} мм · Y: ${Math.round(mouseWorld.y)} мм`;
  $("status-count").textContent = activeLayer === "roof" ? `Крыши: ${roofs.length}` : `Стен: ${walls.length}`;
}
