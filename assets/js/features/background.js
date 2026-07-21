"use strict";

/**
 * Background image loading, sizing, moving, and calibration.
 */

function loadBackgroundFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      background.img = img;
      background.dataUrl = reader.result;
      background.visible = true;
      background.flipX = false;
      background.flipY = false;
      $("background-visible").checked = true;
      $("background-badge").textContent = "есть";
      fitBackgroundToView();
      updateBackgroundSizeUI();
      scheduleAutosave();
      draw();
    };
    img.onerror = () =>
      showModal("Ошибка изображения", "Не удалось открыть выбранный файл.");
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}
function backgroundAspectRatio() {
  if (background.width > 0 && background.height > 0)
    return background.width / background.height;
  if (background.img?.naturalWidth && background.img?.naturalHeight)
    return background.img.naturalWidth / background.img.naturalHeight;
  return 1;
}
function updateBackgroundSizeUI() {
  const hasBackground = Boolean(background.img);
  const widthInput = $("background-width");
  const heightInput = $("background-height");
  widthInput.disabled = !hasBackground;
  heightInput.disabled = !hasBackground;
  widthInput.value =
    hasBackground && background.width > 0
      ? String(Math.round(background.width))
      : "";
  heightInput.value =
    hasBackground && background.height > 0
      ? String(Math.round(background.height))
      : "";
  for (const id of ["btn-bg-origin", "btn-bg-flip-x", "btn-bg-flip-y"]) {
    $(id).disabled = !hasBackground;
  }
  $("btn-bg-flip-x").classList.toggle(
    "primary",
    hasBackground && Boolean(background.flipX),
  );
  $("btn-bg-flip-y").classList.toggle(
    "primary",
    hasBackground && Boolean(background.flipY),
  );
  $("btn-bg-flip-x").setAttribute(
    "aria-pressed",
    String(hasBackground && Boolean(background.flipX)),
  );
  $("btn-bg-flip-y").setAttribute(
    "aria-pressed",
    String(hasBackground && Boolean(background.flipY)),
  );
}
function setBackgroundSize(width, height, keepCenter = true) {
  if (!background.img)
    return showModal("Нет подложки", "Сначала загрузите изображение плана.");
  width = Number(width);
  height = Number(height);
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width < MIN_BACKGROUND_SIZE_MM ||
    height < MIN_BACKGROUND_SIZE_MM
  ) {
    updateBackgroundSizeUI();
    return showModal(
      "Некорректный размер",
      `Ширина и высота должны быть не меньше ${MIN_BACKGROUND_SIZE_MM} мм.`,
    );
  }
  const centerX = background.x + background.width / 2;
  const centerY = background.y + background.height / 2;
  background.width = width;
  background.height = height;
  if (keepCenter) {
    background.x = centerX - width / 2;
    background.y = centerY - height / 2;
  }
  updateBackgroundSizeUI();
  scheduleAutosave();
  draw();
}
function setBackgroundDimension(axis, value) {
  if (!background.img) return;
  const next = Number(value);
  if (!Number.isFinite(next) || next < MIN_BACKGROUND_SIZE_MM) {
    updateBackgroundSizeUI();
    return;
  }
  const locked = $("background-lock-ratio").checked;
  const ratio = backgroundAspectRatio();
  let width = background.width,
    height = background.height;
  if (axis === "width") {
    width = next;
    if (locked) height = width / ratio;
  } else {
    height = next;
    if (locked) width = height * ratio;
  }
  setBackgroundSize(width, height, true);
}
function scaleBackground(factor) {
  if (!background.img)
    return showModal("Нет подложки", "Сначала загрузите изображение плана.");
  const nextWidth = background.width * factor;
  const nextHeight = background.height * factor;
  setBackgroundSize(nextWidth, nextHeight, true);
}
function fitBackgroundToView() {
  if (!background.img)
    return showModal("Нет подложки", "Сначала загрузите изображение плана.");
  const size = canvasSize();
  const left = screenToWorld(
    canvas.getBoundingClientRect().left + 60,
    canvas.getBoundingClientRect().top + size.height - 60,
  );
  const rightTop = screenToWorld(
    canvas.getBoundingClientRect().left + size.width - 60,
    canvas.getBoundingClientRect().top + 60,
  );
  const availableW = Math.abs(rightTop.x - left.x),
    availableH = Math.abs(rightTop.y - left.y);
  const ratio = background.img.naturalWidth / background.img.naturalHeight;
  let width = availableW,
    height = width / ratio;
  if (height > availableH) {
    height = availableH;
    width = height * ratio;
  }
  background.width = width;
  background.height = height;
  background.x = (left.x + rightTop.x - width) / 2;
  background.y = (left.y + rightTop.y - height) / 2;
  updateBackgroundSizeUI();
  scheduleAutosave();
  draw();
}
function moveBackgroundToOrigin() {
  if (!background.img)
    return showModal("Нет подложки", "Сначала загрузите изображение плана.");
  background.x = 0;
  background.y = 0;
  scheduleAutosave();
  draw();
}
function toggleBackgroundFlip(axis) {
  if (!background.img)
    return showModal("Нет подложки", "Сначала загрузите изображение плана.");
  if (axis === "x") background.flipX = !background.flipX;
  else if (axis === "y") background.flipY = !background.flipY;
  else return;
  updateBackgroundSizeUI();
  scheduleAutosave();
  draw();
}
function backgroundCornerWorldPoints() {
  return {
    nw: { x: background.x, y: background.y },
    ne: {
      x: background.x + background.width,
      y: background.y,
    },
    se: {
      x: background.x + background.width,
      y: background.y + background.height,
    },
    sw: { x: background.x, y: background.y + background.height },
  };
}
function hitBackgroundResizeHandle(clientX, clientY) {
  if (mode !== "background-move" || !background.img) return null;
  const r = canvas.getBoundingClientRect();
  const sx = clientX - r.left,
    sy = clientY - r.top;
  for (const [corner, point] of Object.entries(backgroundCornerWorldPoints())) {
    const s = worldToScreen(point.x, point.y);
    if (Math.hypot(s.x - sx, s.y - sy) <= 12) return corner;
  }
  return null;
}
function beginBackgroundResize(corner, p) {
  const original = {
    x: background.x,
    y: background.y,
    width: background.width,
    height: background.height,
  };
  const opposite = {
    nw: {
      x: original.x + original.width,
      y: original.y + original.height,
    },
    ne: { x: original.x, y: original.y + original.height },
    se: { x: original.x, y: original.y },
    sw: { x: original.x + original.width, y: original.y },
  }[corner];
  drag = {
    type: "background-resize",
    corner,
    start: { x: p.x, y: p.y },
    original,
    opposite,
    ratio: original.width / original.height,
    changed: false,
  };
}
function updateBackgroundResize(p) {
  if (drag?.type !== "background-resize") return;
  const { corner, opposite, ratio } = drag;
  let width = Math.max(MIN_BACKGROUND_SIZE_MM, Math.abs(p.x - opposite.x));
  let height = Math.max(MIN_BACKGROUND_SIZE_MM, Math.abs(p.y - opposite.y));
  if ($("background-lock-ratio").checked) {
    if (width / height > ratio) height = width / ratio;
    else width = height * ratio;
  }
  background.width = width;
  background.height = height;
  background.x = corner.includes("w") ? opposite.x - width : opposite.x;
  background.y = corner.includes("n") ? opposite.y - height : opposite.y;
  drag.changed = true;
  updateBackgroundSizeUI();
  draw();
}
function toggleBackgroundMove() {
  if (!background.img)
    return showModal("Нет подложки", "Сначала загрузите изображение плана.");
  setMode(
    mode === "background-move" ? previousMode || "select" : "background-move",
  );
}
function startCalibration() {
  if (!background.img)
    return showModal("Нет подложки", "Сначала загрузите изображение плана.");
  previousMode = mode === "calibrate" ? "select" : mode;
  calibrationPoints = [];
  mode = "calibrate";
  updateModeUI();
  draw();
}
function addCalibrationPoint(p) {
  calibrationPoints.push({ x: p.x, y: p.y });
  if (calibrationPoints.length === 2) {
    const current = Math.hypot(
      calibrationPoints[1].x - calibrationPoints[0].x,
      calibrationPoints[1].y - calibrationPoints[0].y,
    );
    const value = window.prompt(
      `Текущее расстояние на подложке: ${Math.round(current)} мм. Введите реальное расстояние, мм:`,
      "5000",
    );
    const actual = Number(value);
    if (Number.isFinite(actual) && actual > 0 && current > 0) {
      const factor = actual / current;
      const anchor = calibrationPoints[0];
      background.x = anchor.x + (background.x - anchor.x) * factor;
      background.y = anchor.y + (background.y - anchor.y) * factor;
      background.width *= factor;
      background.height *= factor;
      updateBackgroundSizeUI();
      scheduleAutosave();
    } else if (value !== null)
      showModal(
        "Некорректный размер",
        "Введите положительное число в миллиметрах.",
      );
    calibrationPoints = [];
    mode = previousMode || "select";
    updateModeUI();
    draw();
  }
}
function removeBackground() {
  background = {
    img: null,
    dataUrl: null,
    visible: true,
    opacity: 0.45,
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    flipX: false,
    flipY: false,
    moveMode: false,
  };
  $("background-badge").textContent = "нет";
  $("background-opacity").value = 45;
  $("opacity-label").textContent = "45%";
  $("background-visible").checked = true;
  updateBackgroundSizeUI();
  if (mode === "background-move" || mode === "calibrate") setMode("select");
  scheduleAutosave();
  draw();
}
