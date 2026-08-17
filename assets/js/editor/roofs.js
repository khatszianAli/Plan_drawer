"use strict";

function normalizedRoofEnd(start, current) {
  return { x: roundStep(current.x), y: roundStep(current.y) };
}
function startRoofRectangle(p) {
  const start = { x: roundStep(p.x), y: roundStep(p.y) };
  roofDrag = { start, current: { ...start } };
}
function commitRoofRectangle() {
  if (!roofDrag) return;
  const d = roofDrag;
  roofDrag = null;
  const sx = Math.min(d.start.x, d.current.x), ex = Math.max(d.start.x, d.current.x);
  const sy = Math.min(d.start.y, d.current.y), ey = Math.max(d.start.y, d.current.y);
  if (ex - sx < drawingStepMM || ey - sy < drawingStepMM) { draw(); return; }
  const roof = createRoof({
    StartX: sx,
    StartY: sy,
    EndX: ex,
    EndY: ey,
    RoofType: roofType,
    Name: roofs.length ? nextRoofBlockName() : "RootConsctruction",
    IsRoot: roofType === "multi" && !roofRoot(),
    ParentId: roofType === "multi"
      ? roofRoot()?.Id
      : roofType === "concrete"
        ? (roofRoot()?.Id || roofs[0]?.Id)
        : null,
  });
  if (findInvalidRoofOverlap([...roofs, roof], new Set([roof.Id]))) {
    showModal("Наложение блоков крыши", "Блок крыши нельзя разместить с таким пересечением.");
    draw();
    return;
  }
  roofs.push(roof);
  commitHistory(); updateSelectionUI(); draw();
}
function beginRoofDrag(hit, p) {
  if (hit.part.startsWith("roof-slope-")) {
    selectedIds = new Set([hit.id]);
    openRoofSlopePopup(
      hit.id,
      hit.part.replace("roof-slope-", ""),
      p.sx,
      p.sy,
    );
    updateSelectionUI();
    draw();
    return;
  }
  closeRoofSlopePopup();
  if (hit.part.startsWith("roof-corner-")) {
    const roof = roofById(hit.id);
    if (!roof) return;
    selectedIds = new Set([hit.id]);
    drag = {
      type: "roof-resize",
      handle: hit.part.replace("roof-corner-", ""),
      targetId: hit.id,
      original: deepClone(roof),
      changed: false,
    };
    updateSelectionUI();
    return;
  }
  const ids = hit.part === "roof" && selectedIds.has(hit.id) ? [...selectedIds] : [hit.id];
  if (!selectedIds.has(hit.id)) selectedIds = new Set([hit.id]);
  drag = { type: "roofs", start: { x: p.x, y: p.y }, originals: new Map(ids.map((id) => [id, deepClone(roofById(id))])), changed: false };
  updateSelectionUI();
}
function updateRoofSlopePopupUI() {
  const fixed = $("roof-slope-mode").value === "fixed";
  $("roof-slope-type-field").classList.toggle("hidden", !fixed);
}
function openRoofSlopePopup(roofId, end, screenX, screenY) {
  const roof = roofById(roofId);
  if (!roof || roof.RoofType !== "multi" || (end === "start" && !roof.IsRoot)) return;
  const key = end === "end" ? "SlopeEnd" : "SlopeStart";
  const slope = normalizeRoofSlope(roof[key]);
  activeRoofSlopeEditor = { roofId, end: end === "end" ? "end" : "start" };
  $("roof-slope-title").textContent = end === "end"
    ? "Скат на конце конька"
    : "Скат в начале конька";
  $("roof-slope-mode").value = slope.IsEditable ? "editable" : "fixed";
  $("roof-slope-type").value = slope.Type || "gable";
  updateRoofSlopePopupUI();
  const popup = $("roof-slope-popup");
  popup.classList.remove("hidden");
  const left = clamp(screenX + 12, 8, Math.max(8, workspace.clientWidth - 256));
  const top = clamp(screenY + 12, 8, Math.max(8, workspace.clientHeight - 190));
  popup.style.left = `${left}px`;
  popup.style.top = `${top}px`;
}
function closeRoofSlopePopup() {
  activeRoofSlopeEditor = null;
  $("roof-slope-popup").classList.add("hidden");
}
function saveRoofSlopeProperties() {
  if (!activeRoofSlopeEditor) return;
  const roof = roofById(activeRoofSlopeEditor.roofId);
  if (!roof || roof.RoofType !== "multi") {
    closeRoofSlopePopup();
    return;
  }
  if (activeRoofSlopeEditor.end === "start" && !roof.IsRoot) {
    closeRoofSlopePopup();
    return;
  }
  const key = activeRoofSlopeEditor.end === "end" ? "SlopeEnd" : "SlopeStart";
  const isEditable = $("roof-slope-mode").value === "editable";
  roof[key] = {
    IsEditable: isEditable,
    Type: isEditable ? null : normalizeRoofSlopeType($("roof-slope-type").value),
  };
  commitHistory();
  closeRoofSlopePopup();
  draw();
}
function roofResizeCandidate(original, handle, p) {
  const bounds = roofBounds(original);
  const fixed = {
    nw: { x: bounds.maxX, y: bounds.maxY },
    ne: { x: bounds.minX, y: bounds.maxY },
    se: { x: bounds.minX, y: bounds.minY },
    sw: { x: bounds.maxX, y: bounds.minY },
  }[handle];
  if (!fixed) return null;
  const moving = {
    x: roundRoofMoveStep(p.x),
    y: roundRoofMoveStep(p.y),
  };
  if (
    Math.abs(moving.x - fixed.x) < ROOF_MOVE_STEP_MM ||
    Math.abs(moving.y - fixed.y) < ROOF_MOVE_STEP_MM
  ) return null;
  return {
    ...original,
    StartX: Math.min(fixed.x, moving.x),
    StartY: Math.min(fixed.y, moving.y),
    EndX: Math.max(fixed.x, moving.x),
    EndY: Math.max(fixed.y, moving.y),
  };
}
function updateRoofResize(p) {
  if (!drag || drag.type !== "roof-resize") return;
  const roof = roofById(drag.targetId);
  const candidate = roofResizeCandidate(drag.original, drag.handle, p);
  if (!roof || !candidate) return;
  const proposed = roofs.map((item) => item.Id === roof.Id ? candidate : item);
  if (findInvalidRoofOverlap(proposed, new Set([roof.Id]))) return;
  Object.assign(roof, candidate);
  drag.changed = JSON.stringify(candidate) !== JSON.stringify(drag.original);
  updateSelectionUI(false);
  draw();
}
function nudgeSelectedRoofs(dx, dy) {
  if (!selectedIds.size) return false;
  closeRoofSlopePopup();
  const changedIds = new Set(
    roofs.filter((roof) => selectedIds.has(roof.Id)).map((roof) => roof.Id),
  );
  if (!changedIds.size) return false;
  const proposed = roofs.map((roof) =>
    changedIds.has(roof.Id)
      ? {
          ...roof,
          StartX: roof.StartX + dx,
          EndX: roof.EndX + dx,
          StartY: roof.StartY + dy,
          EndY: roof.EndY + dy,
        }
      : roof,
  );
  if (findInvalidRoofOverlap(proposed, changedIds)) return false;
  for (const candidate of proposed) {
    if (!changedIds.has(candidate.Id)) continue;
    Object.assign(roofById(candidate.Id), candidate);
  }
  commitHistory();
  updateSelectionUI();
  draw();
  return true;
}
function roofDragProposal(dx, dy) {
  return roofs.map((r) => {
    const original = drag.originals.get(r.Id);
    return original
      ? { ...r, StartX: original.StartX + dx, EndX: original.EndX + dx, StartY: original.StartY + dy, EndY: original.EndY + dy }
      : r;
  });
}
function findRoofEdgeSnap(requestedDx, requestedDy, changedIds) {
  const candidates = [];
  const snapThreshold = Math.max(ROOF_MOVE_STEP_MM, 14 / view.scale);
  for (const [movingId, original] of drag.originals) {
    const moving = roofById(movingId);
    if (!moving || moving.RoofType !== "multi") continue;
    const movingAxis = roofRidgeAxis(original);
    const requestedBounds = roofBounds({
      ...original,
      StartX: original.StartX + requestedDx,
      EndX: original.EndX + requestedDx,
      StartY: original.StartY + requestedDy,
      EndY: original.EndY + requestedDy,
    });
    for (const target of roofs) {
      if (changedIds.has(target.Id) || target.RoofType !== "multi" || roofRidgeAxis(target) !== movingAxis) continue;
      if (roofCrossWidth(original) >= roofCrossWidth(target)) continue;
      const requestedItem = {
        ...original,
        StartX: original.StartX + requestedDx,
        EndX: original.EndX + requestedDx,
        StartY: original.StartY + requestedDy,
        EndY: original.EndY + requestedDy,
      };
      // Edge snapping is only meaningful once the moving block actually
      // overlaps the target. A simple edge-to-edge approach must stay free.
      if (!roofIntersection(requestedItem, target)) continue;
      const targetBounds = roofBounds(target);
      const movingEdges = movingAxis === "x" ? [requestedBounds.minY, requestedBounds.maxY] : [requestedBounds.minX, requestedBounds.maxX];
      const targetEdges = movingAxis === "x" ? [targetBounds.minY, targetBounds.maxY] : [targetBounds.minX, targetBounds.maxX];
      for (const movingEdge of movingEdges) {
        for (const targetEdge of targetEdges) {
          const correction = targetEdge - movingEdge;
          if (Math.abs(correction) > snapThreshold) continue;
          const dx = movingAxis === "x" ? requestedDx : requestedDx + correction;
          const dy = movingAxis === "x" ? requestedDy + correction : requestedDy;
          const proposal = roofDragProposal(dx, dy);
          const overlap = findInvalidRoofOverlap(proposal, changedIds);
          if (overlap) continue;
          candidates.push({ dx, dy, correction: Math.abs(correction) });
        }
      }
    }
  }
  candidates.sort((a, b) => a.correction - b.correction);
  return candidates[0] || null;
}
function updateRoofDrag(p) {
  if (!drag || drag.type !== "roofs") return;
  const requestedDx = roundRoofMoveStep(p.x - drag.start.x),
    requestedDy = roundRoofMoveStep(p.y - drag.start.y);
  const changedIds = new Set(drag.originals.keys());
  const propose = (dx, dy) => roofDragProposal(dx, dy);
  let dx = requestedDx, dy = requestedDy;
  let proposed = propose(dx, dy);
  if (findInvalidRoofOverlap(proposed, changedIds)) {
    const edgeSnap = findRoofEdgeSnap(requestedDx, requestedDy, changedIds);
    if (edgeSnap) {
      dx = edgeSnap.dx;
      dy = edgeSnap.dy;
      proposed = propose(dx, dy);
    }
  }
  if (findInvalidRoofOverlap(proposed, changedIds)) {
    // A large pointer jump can skip over the last valid position. Find the
    // furthest valid point on the pointer's movement segment instead.
    let low = 0, high = 1;
    for (let i = 0; i < 16; i++) {
      const factor = (low + high) / 2;
      const testDx = roundRoofMoveStep(requestedDx * factor);
      const testDy = roundRoofMoveStep(requestedDy * factor);
      if (findInvalidRoofOverlap(propose(testDx, testDy), changedIds)) high = factor;
      else low = factor;
    }
    dx = roundRoofMoveStep(requestedDx * low);
    dy = roundRoofMoveStep(requestedDy * low);
    proposed = propose(dx, dy);
    while (findInvalidRoofOverlap(proposed, changedIds) && (dx !== 0 || dy !== 0)) {
      dx -= Math.sign(dx) * ROOF_MOVE_STEP_MM;
      dy -= Math.sign(dy) * ROOF_MOVE_STEP_MM;
      proposed = propose(dx, dy);
    }
  }
  for (const candidate of proposed) {
    if (!changedIds.has(candidate.Id)) continue;
    const r = roofById(candidate.Id); Object.assign(r, candidate);
  }
  drag.changed = dx !== 0 || dy !== 0; updateSelectionUI(false); draw();
}
function endRoofDrag() { if (!drag || (drag.type !== "roofs" && drag.type !== "roof-resize")) return; if (drag.changed) commitHistory(); drag = null; updateSelectionUI(); draw(); }
function applyRoofProperties() {
  if (selectedIds.size !== 1) return;
  const r = roofById([...selectedIds][0]); if (!r) return;
  const values = ["prop-roof-sx", "prop-roof-sy", "prop-roof-ex", "prop-roof-ey"].map((id) => Number($(id).value));
  if (!values.every(Number.isFinite) || values[0] === values[2] || values[1] === values[3]) return showModal("Некорректный блок крыши", "Укажите ненулевые границы блока и числовые координаты.");
  const nextType = normalizeRoofType($("prop-roof-type").value);
  const nextRoot = nextType === "multi" && $("prop-roof-root").value === "yes";
  const existingRoot = roofRoot();
  if (nextRoot && existingRoot && existingRoot.Id !== r.Id)
    return showModal("Root уже назначен", "Сначала снимите root с текущего блока крыши.");
  const needsParent = nextType === "concrete" || (nextType === "multi" && !nextRoot);
  const candidate = { ...r, Name: $("prop-roof-name").value.trim(), StartX: Math.min(values[0], values[2]), StartY: Math.min(values[1], values[3]), EndX: Math.max(values[0], values[2]), EndY: Math.max(values[1], values[3]), BuildStage: normalizeBuildStage($("prop-roof-stage").value), RoofType: nextType, IsRoot: nextRoot, ParentId: needsParent ? normalizeRoofParentId($("prop-roof-parent").value) : null };
  if (needsParent && !candidate.ParentId)
    return showModal("Parent не указан", "Для этого блока крыши нужно выбрать parent.");
  const proposed = roofs.map((item) => item.Id === r.Id ? candidate : item);
  if (findInvalidRoofOverlap(proposed, new Set([r.Id]))) return showModal("Наложение блоков крыши", "Эти координаты или тип создают запрещённое пересечение.");
  normalizeRoofHierarchy(proposed);
  roofs = proposed.map(createRoof);
  if (candidate.RoofType !== "multi") closeRoofSlopePopup();
  commitHistory(); updateSelectionUI(); draw();
}
function rotateSelectedRoof(direction) {
  if (selectedIds.size !== 1) return;
  const r = roofById([...selectedIds][0]);
  if (!r) return;
  const bounds = roofBounds(r);
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  const halfWidth = roofHeight(r) / 2;
  const halfHeight = roofWidth(r) / 2;
  const candidate = { ...r, StartX: centerX - halfWidth, EndX: centerX + halfWidth, StartY: centerY - halfHeight, EndY: centerY + halfHeight, Rotation: normalizeRoofRotation(r.Rotation + (direction === "left" ? -90 : 90)) };
  const proposed = roofs.map((item) => item.Id === r.Id ? candidate : item);
  if (findInvalidRoofOverlap(proposed, new Set([r.Id]))) return showModal("Поворот невозможен", "После поворота блок крыши пересечётся с другим блоком недопустимым образом.");
  Object.assign(r, candidate);
  commitHistory();
  updateSelectionUI();
  draw();
}
