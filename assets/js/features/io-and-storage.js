"use strict";

/**
 * JSON import/export and browser autosave.
 */

function exportJSON() {
  if (!walls.length)
    return showModal("План пуст", "Сначала нарисуйте или импортируйте стены.");
  const payload = { walls: walls.map(cleanWallForJSONExport) };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "house_plan.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
async function importJSONFile(file) {
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const arr = Array.isArray(parsed) ? parsed : parsed?.walls;
    if (!Array.isArray(arr))
      throw new Error('Ожидался объект { "walls": [...] }.');
    const imported = arr.map((raw, index) => {
      const values = [raw.StartX, raw.StartY, raw.EndX, raw.EndY].map(Number);
      if (!values.every(Number.isFinite))
        throw new Error(`Стена ${index + 1}: координаты должны быть числами.`);
      const wall = createWall(raw);
      if (wallLength(wall) < 1)
        throw new Error(`Стена ${index + 1}: нулевая длина.`);
      if (!isAxisAligned(wall))
        throw new Error(
          `Стена ${index + 1}: поддерживаются только горизонтальные и вертикальные стены.`,
        );
      return wall;
    });
    walls = imported;
    normalizeIds();
    removeExactDuplicates();
    selectedIds.clear();
    commitHistory();
    runValidation(false);
    updateSelectionUI();
    fitPlan();
    showModal(
      "Импорт завершён",
      `Загружено стен: ${walls.length}. Координаты интерпретированы в миллиметрах, начало координат — слева сверху, ось Y направлена вниз.`,
    );
  } catch (error) {
    showModal("Ошибка импорта", error.message || "Не удалось прочитать JSON.");
  }
  $("json-input").value = "";
}
function saveToLocalStorage(showResult = false) {
  clearTimeout(autosaveTimer);
  try {
    const bgData =
      background.dataUrl && background.dataUrl.length < 2500000
        ? background.dataUrl
        : null;
    const persistedMode = [
      "select",
      "draw-normal",
      "draw-veranda",
      "shape-rectangle",
      "shape-square",
      "shape-u",
      "eraser",
    ].includes(mode)
      ? mode
      : previousMode;
    const data = {
      version: 6,
      coordinateSystem: "y-down",
      walls: walls.map(cleanWallForStorage),
      view,
      settings: {
        drawingStepMM,
        defaultWallThickness: FIXED_WALL_THICKNESS,
        activeWallType,
        mode: persistedMode,
      },
      background: {
        visible: background.visible,
        opacity: background.opacity,
        x: background.x,
        y: background.y,
        width: background.width,
        height: background.height,
        flipX: Boolean(background.flipX),
        flipY: Boolean(background.flipY),
        dataUrl: bgData,
      },
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    $("status-save").textContent =
      `Сохранено ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    $("save-badge").textContent = "вкл.";
    $("save-badge").className = "badge ok";
    if (showResult)
      showModal("Автосохранение", "Текущий план сохранён в браузере.");
  } catch (error) {
    $("status-save").textContent = "Ошибка сохранения";
    $("save-badge").textContent = "ошибка";
    $("save-badge").className = "badge warn";
    if (showResult)
      showModal(
        "Не удалось сохранить",
        "Хранилище браузера переполнено. Попробуйте удалить или уменьшить изображение-подложку.",
      );
  }
}
function scheduleAutosave() {
  $("status-save").textContent = "Сохранение…";
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => saveToLocalStorage(false), 250);
}
function restoreAutosave() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (data.settings) {
      drawingStepMM = normalizePositiveInteger(
        data.settings.drawingStepMM,
        DEFAULT_DRAWING_STEP_MM,
      );
      defaultWallThickness = FIXED_WALL_THICKNESS;
      activeWallType =
        data.settings.activeWallType === "veranda" ? "veranda" : "normal";
      if (
        [
          "select",
          "draw-normal",
          "draw-veranda",
          "shape-rectangle",
          "shape-square",
          "shape-u",
          "eraser",
        ].includes(data.settings.mode)
      )
        mode = data.settings.mode;
    }
    if (Array.isArray(data.walls)) walls = data.walls.map(createWall);
    const needsYAxisMigration = data.coordinateSystem !== "y-down";
    if (needsYAxisMigration) {
      walls.forEach((w) => {
        w.StartY = -w.StartY;
        w.EndY = -w.EndY;
      });
    }
    const legacyFormat = Number(data.version) <= 4;
    const repairedLegacyIds = new Set();
    walls.forEach((w) => {
      w.Thickness = FIXED_WALL_THICKNESS;
      // В старой версии привязка иногда смещала только конечную точку на
      // половину толщины и сохраняла диагональную стену. Исправляем именно
      // этот небольшой служебный сдвиг при первом открытии нового формата.
      if (legacyFormat && repairLegacySnappedWall(w))
        repairedLegacyIds.add(w.Id);
    });
    if (legacyFormat && repairedLegacyIds.size) {
      walls = walls.filter(
        (w) =>
          !repairedLegacyIds.has(w.Id) ||
          !walls.some(
            (other) =>
              other.Id !== w.Id &&
              !repairedLegacyIds.has(other.Id) &&
              wallsAreNearDuplicates(w, other),
          ),
      );
    }
    if (legacyFormat) walls.forEach((w) => repairLegacyWallJunctions(w));
    if (data.view && Number.isFinite(data.view.scale))
      view = { ...view, ...data.view };
    if (data.background) {
      background = { ...background, ...data.background };
      if (needsYAxisMigration && Number.isFinite(background.y)) {
        background.y = -(background.y + (Number(background.height) || 0));
      }
      background.flipX = Boolean(data.background.flipX);
      background.flipY = Boolean(data.background.flipY);
      $("background-visible").checked = background.visible !== false;
      $("background-opacity").value = Math.round(
        (background.opacity ?? 0.45) * 100,
      );
      $("opacity-label").textContent = `${$("background-opacity").value}%`;
      if (data.background.dataUrl) {
        const img = new Image();
        img.onload = () => {
          background.img = img;
          $("background-badge").textContent = "есть";
          updateBackgroundSizeUI();
          draw();
        };
        img.src = data.background.dataUrl;
        background.dataUrl = data.background.dataUrl;
      }
      updateBackgroundSizeUI();
    }
    normalizeIds();
    updateBuildSettingsUI();
    runValidation(false);
    return true;
  } catch {
    return false;
  }
}
function clearAutosave() {
  localStorage.removeItem(STORAGE_KEY);
  $("status-save").textContent = "Локальная копия удалена";
  showModal(
    "Автосохранение",
    "Сохранённая в браузере копия удалена. Текущий план остался открыт.",
  );
}
