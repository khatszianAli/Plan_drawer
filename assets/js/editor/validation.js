"use strict";

/**
 * Physical overlap, gap, and joint validation.
 */

function runValidation(showResult = false) {
  const issues = [];
  const add = (severity, title, message, wallIds = [], point = null) =>
    issues.push({ severity, title, message, wallIds, point });
  const geometryMap = new Map();
  for (const w of walls) {
    if (![w.StartX, w.StartY, w.EndX, w.EndY].every(Number.isFinite)) {
      add(
        "error",
        "Некорректные координаты",
        "У стены есть нечисловые координаты.",
        [w.Id],
      );
    } else if (wallLength(w) < 1) {
      add("error", "Нулевая длина", "Начало и конец стены совпадают.", [w.Id]);
    } else if (!isAxisAligned(w)) {
      add(
        "error",
        "Диагональная стена",
        "Редактор поддерживает только горизонтальные и вертикальные стены.",
        [w.Id],
      );
    }
    const key = normalizedGeometryKey(w);
    if (geometryMap.has(key))
      add("error", "Дубликат стены", "Две стены имеют одинаковые координаты.", [
        geometryMap.get(key),
        w.Id,
      ]);
    else geometryMap.set(key, w.Id);
  }
  for (let i = 0; i < walls.length; i++) {
    for (let j = i + 1; j < walls.length; j++) {
      const a = walls[i],
        b = walls[j];
      if (!isAxisAligned(a) || !isAxisAligned(b)) continue;
      const ra = wallBounds(a),
        rb = wallBounds(b);
      const overlapArea = rectOverlapArea(ra, rb);
      if (overlapArea > 0.5) {
        add(
          "error",
          "Физическое наложение стен",
          `Тела стен перекрываются на ${Math.round(overlapArea)} мм². Координаты должны упираться в грань, а не в ось другой стены.`,
          [a.Id, b.Id],
          {
            x: (Math.max(ra.minX, rb.minX) + Math.min(ra.maxX, rb.maxX)) / 2,
            y: (Math.max(ra.minY, rb.minY) + Math.min(ra.maxY, rb.maxY)) / 2,
          },
        );
        continue;
      }
      const distance = rectDistance(ra, rb);
      if (distance > 0.001 && distance <= GAP_WARNING_MM) {
        add(
          "warning",
          "Физический зазор",
          `Между гранями стен ${Math.round(distance)} мм.`,
          [a.Id, b.Id],
          {
            x:
              (Math.max(ra.minX, Math.min(rb.maxX, ra.maxX)) +
                Math.max(rb.minX, Math.min(ra.maxX, rb.maxX))) /
                2 || 0,
            y:
              (Math.max(ra.minY, Math.min(rb.maxY, ra.maxY)) +
                Math.max(rb.minY, Math.min(ra.maxY, rb.maxY))) /
                2 || 0,
          },
        );
      } else if (distance <= 0.001) {
        const shared = rectSharedEdgeLength(ra, rb);
        if (shared > 0.001 && shared < FIXED_WALL_THICKNESS - 0.5) {
          add(
            "warning",
            "Неполный стык",
            `Стены соприкасаются гранью только на ${Math.round(shared)} мм вместо ${FIXED_WALL_THICKNESS} мм.`,
            [a.Id, b.Id],
          );
        }
      }
    }
  }
  validationIssues = issues;
  invalidWallIds = new Set(issues.flatMap((i) => i.wallIds));
  renderIssues();
  if (showResult) {
    showModal(
      issues.length ? "Проверка завершена" : "План корректен",
      issues.length
        ? `Найдено проблем: ${issues.length}. Проверка выполнена по физическим прямоугольникам стен толщиной ${FIXED_WALL_THICKNESS} мм.`
        : `Наложений и зазоров между физическими гранями стен не найдено. Толщина каждой стены: ${FIXED_WALL_THICKNESS} мм.`,
    );
  }
  draw();
  return issues;
}
function renderIssues() {
  const list = $("issues-list"),
    empty = $("issues-empty"),
    badge = $("issues-badge");
  badge.textContent = validationIssues.length;
  badge.className = "badge " + (validationIssues.length ? "warn" : "ok");
  list.innerHTML = "";
  if (!validationIssues.length) {
    empty.classList.remove("hidden");
    list.classList.add("hidden");
    return;
  }
  empty.classList.add("hidden");
  list.classList.remove("hidden");
  validationIssues.forEach((issue, index) => {
    const div = document.createElement("div");
    div.className = "issue " + (issue.severity === "error" ? "error" : "");
    div.innerHTML = `<strong>${escapeHtml(issue.title)}</strong>${escapeHtml(issue.message)}`;
    div.onclick = () => focusIssue(index);
    list.appendChild(div);
  });
}
function focusIssue(index) {
  const issue = validationIssues[index];
  if (!issue) return;
  selectedIds = new Set(issue.wallIds.filter((id) => wallById(id)));
  updateSelectionUI();
  if (issue.point) centerOnWorld(issue.point.x, issue.point.y);
  else fitSelection();
  draw();
}
function normalizeAllIntersectionsAction() {
  const issues = runValidation(false);
  const overlaps = issues.filter(
    (issue) => issue.title === "Физическое наложение стен",
  ).length;
  const gaps = issues.filter(
    (issue) =>
      issue.title === "Физический зазор" || issue.title === "Неполный стык",
  ).length;
  showModal(
    issues.length ? "Проверка физических стыков" : "Стыки корректны",
    issues.length
      ? `Наложений: ${overlaps}. Зазоров или неполных стыков: ${gaps}. Проблемные стены подсвечены.`
      : `Все стены соприкасаются физическими гранями без наложений и зазоров.`,
  );
}
