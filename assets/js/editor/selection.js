"use strict";

/**
 * Hit testing, smart movement guides, selection, and properties.
 */

function hitTest(clientX, clientY) {
  const p = screenToWorld(clientX, clientY);
  if (selectedIds.size === 1) {
    const w = wallById([...selectedIds][0]);
    if (w) {
      const s = worldToScreen(w.StartX, w.StartY),
        e = worldToScreen(w.EndX, w.EndY);
      if (Math.hypot(p.sx - s.x, p.sy - s.y) <= HANDLE_RADIUS + 5)
        return { id: w.Id, part: "start" };
      if (Math.hypot(p.sx - e.x, p.sy - e.y) <= HANDLE_RADIUS + 5)
        return { id: w.Id, part: "end" };
    }
  }
  const tolerance = Math.max(4 / view.scale, 1);
  for (let i = walls.length - 1; i >= 0; i--) {
    const w = walls[i];
    if (pointInsideRect(p.x, p.y, wallBounds(w), tolerance))
      return { id: w.Id, part: "wall" };
  }
  return null;
}
function selectOnly(id) {
  selectedIds = new Set(id ? [id] : []);
  updateSelectionUI();
  draw();
}
function toggleSelected(id) {
  selectedIds.has(id) ? selectedIds.delete(id) : selectedIds.add(id);
  updateSelectionUI();
  draw();
}
function beginWallDrag(hit, p) {
  const ids =
    hit.part === "wall" && selectedIds.has(hit.id)
      ? [...selectedIds]
      : [hit.id];
  if (!selectedIds.has(hit.id)) selectedIds = new Set([hit.id]);
  activeMoveGuides = { x: null, y: null };
  drag = {
    type: hit.part === "wall" ? "walls" : "handle",
    handle: hit.part,
    targetId: hit.id,
    start: { x: p.x, y: p.y },
    originals: new Map(ids.map((id) => [id, deepClone(wallById(id))])),
    changed: false,
  };
  updateSelectionUI();
}
function intervalDistance1D(minA, maxA, minB, maxB) {
  return Math.max(minA - maxB, minB - maxA, 0);
}
function uniqueAxisAnchors(w, axis) {
  const r = wallBounds(w);
  const min = axis === "x" ? r.minX : r.minY;
  const max = axis === "x" ? r.maxX : r.maxY;
  const raw = [
    { value: min, role: "min", kind: "грань" },
    { value: (min + max) / 2, role: "center", kind: "ось" },
    { value: max, role: "max", kind: "грань" },
  ];
  const result = [];
  for (const item of raw) {
    if (!result.some((existing) => nearlyEqual(existing.value, item.value)))
      result.push(item);
  }
  return result;
}
function translatedWallForSnap(original, dx, dy) {
  return {
    ...original,
    StartX: original.StartX + dx,
    EndX: original.EndX + dx,
    StartY: original.StartY + dy,
    EndY: original.EndY + dy,
  };
}
function moveSnapCategory(
  movingAnchor,
  targetAnchor,
  orthGap,
  contactThreshold,
) {
  const oppositeEdges =
    (movingAnchor.role === "min" && targetAnchor.role === "max") ||
    (movingAnchor.role === "max" && targetAnchor.role === "min");
  if (oppositeEdges && orthGap <= contactThreshold)
    return { rank: 0, kind: "стык граней", contact: true };
  if (movingAnchor.role === "center" && targetAnchor.role === "center")
    return { rank: 1, kind: "выравнивание осей", contact: false };
  if (movingAnchor.role === targetAnchor.role && movingAnchor.role !== "center")
    return { rank: 2, kind: "выравнивание граней", contact: false };
  return { rank: 3, kind: "направляющая", contact: false };
}
function findBestWholeWallSnap(rawDx, rawDy, excluded) {
  const threshold = SNAP_SCREEN_PX / view.scale;
  const contactThreshold = threshold * 2.25;
  const maxOrthDistance = MOVE_GUIDE_ORTH_SCREEN_PX / view.scale;
  const moving = [...drag.originals.entries()].map(([id, original]) => ({
    id,
    wall: translatedWallForSnap(original, rawDx, rawDy),
  }));
  const targets = walls.filter((w) => !excluded.has(w.Id));
  function bestForAxis(axis) {
    let best = null;
    for (const movingItem of moving) {
      const movingBounds = wallBounds(movingItem.wall);
      const movingAnchors = uniqueAxisAnchors(movingItem.wall, axis);
      for (const target of targets) {
        const targetBounds = wallBounds(target);
        const orthGap =
          axis === "x"
            ? intervalDistance1D(
                movingBounds.minY,
                movingBounds.maxY,
                targetBounds.minY,
                targetBounds.maxY,
              )
            : intervalDistance1D(
                movingBounds.minX,
                movingBounds.maxX,
                targetBounds.minX,
                targetBounds.maxX,
              );
        if (orthGap > maxOrthDistance) continue;
        const targetAnchors = uniqueAxisAnchors(target, axis);
        for (const movingAnchor of movingAnchors) {
          for (const targetAnchor of targetAnchors) {
            const correction = targetAnchor.value - movingAnchor.value;
            if (Math.abs(correction) > threshold) continue;
            const category = moveSnapCategory(
              movingAnchor,
              targetAnchor,
              orthGap,
              contactThreshold,
            );
            const score =
              category.rank * threshold * 4 +
              Math.abs(correction) +
              orthGap * 0.015;
            if (!best || score < best.score) {
              best = {
                score,
                correction,
                value: targetAnchor.value,
                kind: category.kind,
                contact: category.contact,
                movingId: movingItem.id,
                targetId: target.Id,
                movingRole: movingAnchor.role,
                targetRole: targetAnchor.role,
              };
            }
          }
        }
      }
    }
    return best;
  }
  const x = bestForAxis("x");
  const y = bestForAxis("y");
  return {
    dx: rawDx + (x ? x.correction : 0),
    dy: rawDy + (y ? y.correction : 0),
    guides: { x, y },
  };
}
function updateWallDrag(p) {
  if (!drag) return;
  const excluded = new Set(drag.originals.keys());
  if (drag.type === "walls") {
    const pointerDx = p.x - drag.start.x;
    const pointerDy = p.y - drag.start.y;
    const snapped = findBestWholeWallSnap(pointerDx, pointerDy, excluded);
    const dx = snapped.guides.x ? snapped.dx : roundStep(pointerDx);
    const dy = snapped.guides.y ? snapped.dy : roundStep(pointerDy);
    activeMoveGuides = snapped.guides;
    for (const [id, original] of drag.originals) {
      const w = wallById(id);
      if (!w) continue;
      w.StartX = original.StartX + dx;
      w.EndX = original.EndX + dx;
      w.StartY = original.StartY + dy;
      w.EndY = original.EndY + dy;
    }
    drag.changed = !nearlyEqual(dx, 0) || !nearlyEqual(dy, 0);
  } else {
    activeMoveGuides = { x: null, y: null };
    const w = wallById(drag.targetId);
    const original = drag.originals.get(drag.targetId);
    if (!w || !original) return;
    const fixed =
      drag.handle === "start"
        ? endpoint(original, "end")
        : endpoint(original, "start");
    const horizontal = Math.abs(p.x - fixed.x) >= Math.abs(p.y - fixed.y);
    const orientation = horizontal ? "x" : "y";
    const sign = horizontal
      ? p.x >= fixed.x
        ? 1
        : -1
      : p.y >= fixed.y
        ? 1
        : -1;
    const snappedAxis = horizontal
      ? snapAxis(p.x, "x", excluded)
      : snapAxis(p.y, "y", excluded);
    let moving = horizontal
      ? { x: roundStep(snappedAxis), y: fixed.y }
      : { x: fixed.x, y: roundStep(snappedAxis) };
    const snapProbe = horizontal
      ? { x: snappedAxis, y: fixed.y }
      : { x: fixed.x, y: snappedAxis };
    const snap = snapEndpointToPhysicalFace(
      snapProbe,
      fixed,
      orientation,
      sign,
      excluded,
    );
    if (snap.snapped) {
      moving = { x: snap.x, y: snap.y };
      activeMoveGuides[orientation] = {
        value: orientation === "x" ? snap.x : snap.y,
        kind: snap.kind || "стык граней",
        contact: true,
        movingId: w.Id,
        targetId: snap.wallId,
      };
    }
    if (drag.handle === "start") {
      w.StartX = moving.x;
      w.StartY = moving.y;
      w.EndX = fixed.x;
      w.EndY = fixed.y;
    } else {
      w.StartX = fixed.x;
      w.StartY = fixed.y;
      w.EndX = moving.x;
      w.EndY = moving.y;
    }
    drag.changed = JSON.stringify(w) !== JSON.stringify(original);
  }
  updateSelectionUI(false);
  draw();
}
function endWallDrag() {
  if (!drag) return;
  if (drag.changed) {
    if (drag.type === "handle") {
      const w = wallById(drag.targetId);
      if (w) autoJoinWallEndpoint(w, drag.handle);
    } else if (drag.type === "walls") {
      const excluded = new Set(drag.originals.keys());
      for (const id of excluded) {
        const w = wallById(id);
        if (!w) continue;
        autoJoinWallEndpoint(w, "start", excluded);
        autoJoinWallEndpoint(w, "end", excluded);
      }
    }
    const selectedBefore = new Set(selectedIds);
    removeExactDuplicates();
    selectedIds = new Set([...selectedBefore].filter((id) => wallById(id)));
    commitHistory();
    runValidation(false);
  }
  drag = null;
  activeMoveGuides = { x: null, y: null };
  updateSelectionUI();
  draw();
}
function startSelectionBox(p) {
  selectionBox = {
    start: { x: p.sx, y: p.sy },
    end: { x: p.sx, y: p.sy },
    additive: false,
  };
}
function finishSelectionBox(additive) {
  if (!selectionBox) return;
  const x1 = Math.min(selectionBox.start.x, selectionBox.end.x),
    x2 = Math.max(selectionBox.start.x, selectionBox.end.x);
  const y1 = Math.min(selectionBox.start.y, selectionBox.end.y),
    y2 = Math.max(selectionBox.start.y, selectionBox.end.y);
  if (!additive) selectedIds.clear();
  if (Math.abs(x2 - x1) > 4 || Math.abs(y2 - y1) > 4) {
    for (const w of walls) {
      const r = wallBounds(w);
      const topLeft = worldToScreen(r.minX, r.minY);
      const bottomRight = worldToScreen(r.maxX, r.maxY);
      if (
        topLeft.x >= x1 &&
        bottomRight.x <= x2 &&
        topLeft.y >= y1 &&
        bottomRight.y <= y2
      )
        selectedIds.add(w.Id);
    }
  }
  selectionBox = null;
  updateSelectionUI();
  draw();
}
function deleteSelection() {
  if (!selectedIds.size) return;
  walls = walls.filter((w) => !selectedIds.has(w.Id));
  selectedIds.clear();
  commitHistory();
  runValidation(false);
  updateSelectionUI();
  draw();
}
function duplicateSelection() {
  if (!selectedIds.size) return;
  const copies = walls
    .filter((w) => selectedIds.has(w.Id))
    .map((w) => ({
      ...deepClone(w),
      Id: newId(),
      Name: w.Name ? `${w.Name} — копия` : "",
      StartX: w.StartX + 200,
      EndX: w.EndX + 200,
      StartY: w.StartY + 200,
      EndY: w.EndY + 200,
    }));
  walls.push(...copies);
  selectedIds = new Set(copies.map((w) => w.Id));
  commitHistory();
  runValidation(false);
  updateSelectionUI();
  draw();
}
function mergeSelectedWalls() {
  const selected = walls.filter((w) => selectedIds.has(w.Id));
  if (selected.length < 2)
    return showModal(
      "Объединение",
      "Выберите минимум две стены на одной линии.",
    );
  const first = selected[0];
  const horizontal = isHorizontal(first);
  const compatible = selected.every(
    (w) =>
      isAxisAligned(w) &&
      isHorizontal(w) === horizontal &&
      (horizontal
        ? nearlyEqual(w.StartY, first.StartY)
        : nearlyEqual(w.StartX, first.StartX)) &&
      w.IsVeranda === first.IsVeranda &&
      w.IsLoadBearing === first.IsLoadBearing &&
      nearlyEqual(w.Thickness, first.Thickness),
  );
  if (!compatible)
    return showModal(
      "Нельзя объединить",
      "Стены должны находиться на одной оси и иметь одинаковый тип, толщину и статус несущей стены.",
    );
  const intervals = selected
    .map((w) =>
      horizontal
        ? [Math.min(w.StartX, w.EndX), Math.max(w.StartX, w.EndX)]
        : [Math.min(w.StartY, w.EndY), Math.max(w.StartY, w.EndY)],
    )
    .sort((a, b) => a[0] - b[0]);
  for (let i = 1; i < intervals.length; i++)
    if (intervals[i][0] > intervals[i - 1][1] + 0.001)
      return showModal(
        "Нельзя объединить",
        "Между выбранными стенами есть разрыв.",
      );
  const min = intervals[0][0],
    max = Math.max(...intervals.map((i) => i[1]));
  const merged = {
    ...deepClone(first),
    Id: newId(),
    Name: first.Name || "Объединённая стена",
  };
  if (horizontal) {
    merged.StartX = min;
    merged.EndX = max;
    merged.StartY = merged.EndY = first.StartY;
  } else {
    merged.StartY = min;
    merged.EndY = max;
    merged.StartX = merged.EndX = first.StartX;
  }
  walls = walls.filter((w) => !selectedIds.has(w.Id));
  walls.push(merged);
  selectedIds = new Set([merged.Id]);
  commitHistory();
  runValidation(false);
  updateSelectionUI();
  draw();
}
function applySingleProperties() {
  if (selectedIds.size !== 1) return;
  const w = wallById([...selectedIds][0]);
  if (!w) return;
  const sx = Number($("prop-sx").value),
    sy = Number($("prop-sy").value),
    ex = Number($("prop-ex").value),
    ey = Number($("prop-ey").value);
  const thickness = FIXED_WALL_THICKNESS;
  if (![sx, sy, ex, ey].every(Number.isFinite))
    return showModal("Некорректные данные", "Заполните координаты числами.");
  if (sx === ex && sy === ey)
    return showModal(
      "Некорректная стена",
      "Начало и конец стены не могут совпадать.",
    );
  if (sx !== ex && sy !== ey)
    return showModal(
      "Только прямые стены",
      "Стена должна быть горизонтальной или вертикальной.",
    );
  w.Name = $("prop-name").value.trim();
  w.StartX = sx;
  w.StartY = sy;
  w.EndX = ex;
  w.EndY = ey;
  w.Thickness = FIXED_WALL_THICKNESS;
  w.IsVeranda = $("prop-type").value === "veranda";
  w.IsLoadBearing = $("prop-bearing").checked;
  autoJoinWallEndpoint(w, "start");
  autoJoinWallEndpoint(w, "end");
  removeExactDuplicates();
  commitHistory();
  runValidation(false);
  updateSelectionUI();
  draw();
}
function setSelectionType(isVeranda) {
  if (!selectedIds.size) return;
  walls.forEach((w) => {
    if (selectedIds.has(w.Id)) w.IsVeranda = isVeranda;
  });
  commitHistory();
  runValidation(false);
  updateSelectionUI();
  draw();
}
function setSelectionBearing(value) {
  if (!selectedIds.size) return;
  walls.forEach((w) => {
    if (selectedIds.has(w.Id)) w.IsLoadBearing = value;
  });
  commitHistory();
  runValidation(false);
  updateSelectionUI();
  draw();
}
function updateSelectionUI(updateInputs = true) {
  const count = selectedIds.size;
  $("selection-badge").textContent = count;
  $("status-selected").textContent = `Выбрано: ${count}`;
  $("properties-empty").classList.toggle("hidden", count !== 0);
  $("properties-single").classList.toggle("hidden", count !== 1);
  $("properties-multi").classList.toggle("hidden", count <= 1);
  if (count === 1 && updateInputs) {
    const w = wallById([...selectedIds][0]);
    if (w) {
      $("prop-id").value = w.Id;
      $("prop-name").value = w.Name || "";
      $("prop-sx").value = Math.round(w.StartX);
      $("prop-sy").value = Math.round(w.StartY);
      $("prop-ex").value = Math.round(w.EndX);
      $("prop-ey").value = Math.round(w.EndY);
      $("prop-thickness").value = FIXED_WALL_THICKNESS;
      $("prop-type").value = w.IsVeranda ? "veranda" : "normal";
      $("prop-bearing").checked = Boolean(w.IsLoadBearing);
      const bounds = wallBounds(w);
      $("prop-length").textContent =
        `Длина: ${Math.round(wallLength(w))} мм · физические границы X: ${Math.round(bounds.minX)}…${Math.round(bounds.maxX)}, Y: ${Math.round(bounds.minY)}…${Math.round(bounds.maxY)}`;
    }
  }
  if (count > 1) {
    const selectedWalls = walls.filter((w) => selectedIds.has(w.Id));
    const total = selectedWalls.reduce((sum, w) => sum + wallLength(w), 0);
    const thicknesses = [FIXED_WALL_THICKNESS];
    $("multi-summary").textContent =
      `${count} стен · суммарная длина ${Math.round(total)} мм`;
    if (updateInputs)
      $("multi-thickness").value =
        thicknesses.length === 1 ? thicknesses[0] : "";
  }
  $("status-count").textContent = `Стен: ${walls.length}`;
}
