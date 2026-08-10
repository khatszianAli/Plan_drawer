"use strict";

/**
 * Editor modes and rectangle/square/U-shape construction.
 */

function updateModeUI() {
  const roofLayerActive = activeLayer === "roof";
  $("btn-layer-walls").classList.toggle("active", !roofLayerActive);
  $("btn-layer-roof").classList.toggle("active", roofLayerActive);
  $("btn-layer-walls").setAttribute("aria-pressed", String(!roofLayerActive));
  $("btn-layer-roof").setAttribute("aria-pressed", String(roofLayerActive));
  $("wall-tools")
    .querySelectorAll("button")
    .forEach((button) => (button.disabled = roofLayerActive));
  $("wall-editing-tools")
    .querySelectorAll("button")
    .forEach((button) => (button.disabled = roofLayerActive));
  $("btn-select").classList.toggle(
    "active",
    !roofLayerActive && mode === "select",
  );
  $("btn-normal").classList.toggle(
    "active",
    !roofLayerActive && mode === "draw-normal",
  );
  $("btn-veranda").classList.toggle(
    "active",
    !roofLayerActive && mode === "draw-veranda",
  );
  $("btn-wall-toggle").textContent =
    activeWallType === "veranda" ? "Тип: веранда ↹" : "Тип: обычная ↹";
  workspace.classList.remove(
    "draw-cursor",
    "select-cursor",
    "pan-cursor",
    "calibrate-cursor",
    "eraser-cursor",
  );
  $("status-layer").textContent = roofLayerActive
    ? "Слой: крыша"
    : "Слой: стены";
  if (roofLayerActive) {
    workspace.classList.add(isPanning ? "pan-cursor" : "select-cursor");
    $("status-mode").textContent = "Режим: просмотр крыши";
    $("workspace-hint").textContent =
      "Слой крыши. Стены показаны полупрозрачно как опорный план. ПКМ или Space + ЛКМ — перемещение холста. Колесо — масштаб.";
    $("btn-bg-move").classList.remove("primary");
    return;
  }
  if (isPanning) workspace.classList.add("pan-cursor");
  else if (mode === "calibrate") workspace.classList.add("calibrate-cursor");
  else if (mode === "eraser") workspace.classList.add("eraser-cursor");
  else if (mode === "select" || mode === "background-move")
    workspace.classList.add("select-cursor");
  else workspace.classList.add("draw-cursor");
  $("btn-bg-move").classList.toggle("primary", mode === "background-move");
  const labels = {
    select: "выбор",
    "draw-normal": "обычная стена",
    "draw-veranda": "стена веранды",
    calibrate: "калибровка подложки",
    "background-move": "перемещение подложки",
  };
  $("status-mode").textContent = `Режим: ${labels[mode] || mode}`;
  $("workspace-hint").innerHTML =
    mode === "select"
      ? "Клик — выбрать. Перетаскивание стены остаётся свободным, но при приближении включается магнитная привязка к физическим граням и осям. Зелёные линии показывают точное выравнивание. Маркеры меняют конец стены. Delete — удалить."
      : mode === "calibrate"
        ? '<span class="calibration-line">Калибровка:</span> поставьте две точки известного расстояния на подложке. Esc — отменить.'
        : mode === "background-move"
          ? "Перетащите подложку мышкой. Потяните за синий угловой маркер, чтобы изменить размер. Повторно нажмите кнопку для выхода."
          : "ЛКМ — рисование физической стены 150 мм. Первая обычная стена или стена веранды всегда начинается в координате (0, 0). При повороте координаты автоматически смещаются к граням на 75 мм, поэтому стены не входят друг в друга. Tab — сменить тип стены. Esc — завершить цепочку.";
}
function setActiveLayer(nextLayer) {
  const next = nextLayer === "roof" ? "roof" : "walls";
  if (activeLayer === next) return;
  cancelDrawing();
  shapeDrag = null;
  cancelLinearEraser();
  calibrationPoints = [];
  drag = null;
  selectionBox = null;
  activeMoveGuides = { x: null, y: null };
  background.moveMode = false;
  if (
    next === "roof" &&
    (mode === "calibrate" || mode === "background-move")
  ) {
    mode = ["select", "draw-normal", "draw-veranda"].includes(previousMode)
      ? previousMode
      : "select";
  }
  activeLayer = next;
  if (activeLayer === "roof") selectedIds.clear();
  updateSelectionUI();
  updateModeUI();
  draw();
  scheduleAutosave();
}
function setMode(next) {
  if (next === "draw-normal") activeWallType = "normal";
  if (next === "draw-veranda") activeWallType = "veranda";
  if (mode === next && next === "background-move")
    next = previousMode === "background-move" ? "select" : previousMode;
  if (mode !== "calibrate" && mode !== "background-move") previousMode = mode;
  cancelDrawing();
  shapeDrag = null;
  cancelLinearEraser();
  calibrationPoints = [];
  mode = next;
  background.moveMode = mode === "background-move";
  updateModeUI();
  draw();
}
function toggleWallType() {
  activeWallType = activeWallType === "normal" ? "veranda" : "normal";
  if (mode === "draw-normal" || mode === "draw-veranda") {
    mode = activeWallType === "veranda" ? "draw-veranda" : "draw-normal";
  }
  updateModeUI();
  draw();
}
function normalizedShapeEnd(start, current, shapeMode) {
  let x = roundStep(current.x),
    y = roundStep(current.y);
  if (shapeMode === "shape-square") {
    const dx = x - start.x,
      dy = y - start.y;
    const side = Math.max(Math.abs(dx), Math.abs(dy));
    x = start.x + (dx >= 0 ? side : -side);
    y = start.y + (dy >= 0 ? side : -side);
  }
  return { x, y };
}
function shapeSegments(
  start,
  end,
  shapeMode,
  wallType = activeWallType,
  thickness = FIXED_WALL_THICKNESS,
) {
  const minX = Math.min(start.x, end.x);
  const maxX = Math.max(start.x, end.x);
  const minY = Math.min(start.y, end.y);
  const maxY = Math.max(start.y, end.y);
  const t = FIXED_WALL_THICKNESS;
  const half = t / 2;
  const width = maxX - minX;
  const height = maxY - minY;
  if (width < t * 2 || height < t) return [];
  const common = {
    IsVeranda: wallType === "veranda",
    IsLoadBearing: true,
    Thickness: t,
  };
  const seg = (sx, sy, ex, ey) =>
    createWall({
      ...common,
      StartX: Math.round(sx),
      StartY: Math.round(sy),
      EndX: Math.round(ex),
      EndY: Math.round(ey),
    });
  // Габарит фигуры считается по наружным граням. Вертикальные стены идут
  // непрерывно на всю высоту, а горизонтальные точно упираются во внутренние
  // грани вертикальных стен. Поэтому ни наложений, ни пустых углов нет.
  const leftX = minX + half;
  const rightX = maxX - half;
  const bottomY = minY + half;
  const topY = maxY - half;
  const innerLeft = minX + t;
  const innerRight = maxX - t;
  if (shapeMode === "shape-u") {
    return [
      seg(leftX, minY, leftX, maxY),
      seg(innerLeft, topY, innerRight, topY),
      seg(rightX, maxY, rightX, minY),
    ];
  }
  if (height < t * 2) return [];
  return [
    seg(innerLeft, bottomY, innerRight, bottomY),
    seg(rightX, minY, rightX, maxY),
    seg(innerRight, topY, innerLeft, topY),
    seg(leftX, maxY, leftX, minY),
  ];
}
function commitShape() {
  if (!shapeDrag) return;
  const completedShape = shapeDrag;
  const created = shapeSegments(
    completedShape.start,
    completedShape.current,
    completedShape.tool,
    completedShape.wallType,
    completedShape.thickness,
  );
  shapeDrag = null;
  // Инструмент фигуры и выбранный тип стены намеренно сохраняются после построения.
  mode = completedShape.tool;
  activeWallType = completedShape.wallType;
  if (!created.length) {
    updateModeUI();
    draw();
    return;
  }
  walls.push(...created);
  removeExactDuplicates();
  commitHistory();
  runValidation(false);
  updateSelectionUI();
  updateModeUI();
  draw();
}
