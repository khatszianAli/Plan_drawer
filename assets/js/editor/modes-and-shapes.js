"use strict";

/**
 * Editor modes and rectangle/square/U-shape construction.
 */

function updateModeUI() {
  $("btn-select").classList.toggle("active", mode === "select");
  $("btn-normal").classList.toggle("active", mode === "draw-normal");
  $("btn-veranda").classList.toggle("active", mode === "draw-veranda");
  $("btn-rectangle").classList.toggle("active", mode === "shape-rectangle");
  $("btn-square").classList.toggle("active", mode === "shape-square");
  $("btn-u-shape").classList.toggle("active", mode === "shape-u");
  $("btn-eraser").classList.toggle("active", mode === "eraser");
  $("btn-wall-toggle").textContent =
    activeWallType === "veranda" ? "Тип: веранда ↹" : "Тип: обычная ↹";
  workspace.classList.remove(
    "draw-cursor",
    "select-cursor",
    "pan-cursor",
    "calibrate-cursor",
    "eraser-cursor",
  );
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
    "shape-rectangle": "прямоугольник",
    "shape-square": "квадрат",
    "shape-u": "П-образный контур",
    eraser: "ластик",
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
          : mode === "eraser"
            ? "Линейный ластик: первый клик — начало, второй — конец удаляемого участка. Можно ввести точную длину и нажать Enter. Esc — отменить текущий отрезок."
            : mode.startsWith("shape-")
              ? "Зажмите ЛКМ и протяните фигуру. Tab мгновенно меняет обычные стены и веранду. Esc — отменить."
              : "ЛКМ — рисование физической стены 150 мм. Первая обычная стена или стена веранды всегда начинается в координате (0, 0). При повороте координаты автоматически смещаются к граням на 75 мм, поэтому стены не входят друг в друга. Tab — сменить тип стены. Esc — завершить цепочку.";
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
