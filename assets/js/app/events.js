"use strict";

/** Canvas, keyboard, form, and declarative UI events. */

canvas.addEventListener("mousedown", (e) => {
  const p = screenToWorld(e.clientX, e.clientY);
  mouseWorld = p;
  mouseScreen = { x: p.sx, y: p.sy };
  if (e.button === 2 || e.button === 1 || (spacePressed && e.button === 0)) {
    if (e.button === 2 && isDrawing) {
      cancelDrawing();
      draw();
    }
    isPanning = true;
    panStart = {
      clientX: e.clientX,
      clientY: e.clientY,
      originX: view.originX,
      originY: view.originY,
    };
    updateModeUI();
    e.preventDefault();
    return;
  }
  if (e.button !== 0) return;
  if (mode === "calibrate") {
    addCalibrationPoint(p);
    return;
  }
  if (activeLayer === "roof" && mode === "roof-rectangle") { startRoofRectangle(p); draw(); return; }
  if (activeLayer === "roof" && mode === "roof-select") { const hit = hitTest(e.clientX, e.clientY); if (hit) { if (e.ctrlKey || e.metaKey) toggleSelected(hit.id); else { if (!selectedIds.has(hit.id)) selectedIds = new Set([hit.id]); beginRoofDrag(hit, p); } } else { startSelectionBox(p); selectionBox.additive = e.ctrlKey || e.metaKey; } return; }
  if (mode === "eraser") {
    if (!eraserDrawing) startLinearEraserAt(p);
    else commitLinearErase(null);
    draw();
    return;
  }
  if (mode.startsWith("shape-")) {
    const snapped = nearestSnapPoint(p.x, p.y);
    const start = snapped.snapped
      ? { x: snapped.x, y: snapped.y }
      : { x: roundStep(p.x), y: roundStep(p.y) };
    shapeDrag = {
      start,
      current: { ...start },
      tool: mode,
      wallType: activeWallType,
      thickness: FIXED_WALL_THICKNESS,
    };
    draw();
    return;
  }
  if (mode === "background-move" && background.img) {
    const resizeCorner = hitBackgroundResizeHandle(e.clientX, e.clientY);
    if (resizeCorner) {
      beginBackgroundResize(resizeCorner, p);
      return;
    }
    drag = {
      type: "background",
      start: { x: p.x, y: p.y },
      original: { x: background.x, y: background.y },
      changed: false,
    };
    return;
  }
  if (mode === "select") {
    const hit = hitTest(e.clientX, e.clientY);
    if (hit) {
      if (e.ctrlKey || e.metaKey) {
        toggleSelected(hit.id);
        return;
      }
      if (!selectedIds.has(hit.id)) selectedIds = new Set([hit.id]);
      beginWallDrag(hit, p);
      return;
    }
    startSelectionBox(p);
    selectionBox.additive = e.ctrlKey || e.metaKey;
    return;
  }
  if (!isDrawing) startDrawingAt(p);
  else commitDrawnWall(null);
});
canvas.addEventListener("mousemove", (e) => {
  const p = screenToWorld(e.clientX, e.clientY);
  mouseWorld = p;
  mouseScreen = { x: p.sx, y: p.sy };
  if (isPanning && panStart) {
    view.originX = panStart.originX + (e.clientX - panStart.clientX);
    view.originY = panStart.originY + (e.clientY - panStart.clientY);
    draw();
    return;
  }
  if (mode === "eraser" && eraserDrawing) {
    updateLinearEraserPreview(p);
    draw();
    return;
  }
  if (shapeDrag) {
    shapeDrag.current = normalizedShapeEnd(shapeDrag.start, p, shapeDrag.tool);
    draw();
    return;
  }
  if (roofDrag) { roofDrag.current = normalizedRoofEnd(roofDrag.start, p); draw(); return; }
  if (drag?.type === "background-resize") {
    updateBackgroundResize(p);
    return;
  }
  if (drag?.type === "background") {
    const dx = p.x - drag.start.x,
      dy = p.y - drag.start.y;
    background.x = drag.original.x + dx;
    background.y = drag.original.y + dy;
    drag.changed = Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01;
    draw();
    return;
  }
  if (drag && drag.type === "roofs") { updateRoofDrag(p); return; }
  if (drag && drag.type === "roof-resize") { updateRoofResize(p); return; }
  if (drag) {
    updateWallDrag(p);
    return;
  }
  if (selectionBox) {
    selectionBox.end = { x: p.sx, y: p.sy };
    draw();
    return;
  }
  if (isDrawing) updateDrawingPreview(p);
  draw();
});
canvas.addEventListener("mouseup", (e) => {
  if (shapeDrag) {
    commitShape();
    return;
  }
  if (roofDrag) { commitRoofRectangle(); return; }
  if (isPanning) {
    isPanning = false;
    panStart = null;
    updateModeUI();
    scheduleAutosave();
  }
  if (drag?.type === "background-resize") {
    if (drag.changed) scheduleAutosave();
    drag = null;
    updateBackgroundSizeUI();
    draw();
    return;
  }
  if (drag?.type === "background") {
    if (drag.changed) scheduleAutosave();
    drag = null;
    draw();
    return;
  }
  if (drag && (drag.type === "roofs" || drag.type === "roof-resize")) endRoofDrag();
  else if (drag) endWallDrag();
  if (selectionBox) finishSelectionBox(selectionBox.additive);
});
canvas.addEventListener("mouseleave", () => {
  if (isPanning) {
    isPanning = false;
    panStart = null;
    updateModeUI();
  }
  if (drag && drag.type !== "background" && drag.type !== "background-resize")
    (drag.type === "roofs" || drag.type === "roof-resize") ? endRoofDrag() : endWallDrag();
});
canvas.addEventListener("dblclick", (e) => {
  if (mode !== "select" && mode !== "roof-select") return;
  const hit = hitTest(e.clientX, e.clientY);
  if (hit) {
    selectOnly(hit.id);
    if (activeLayer === "walls") $("prop-name").focus();
  }
});
canvas.addEventListener("contextmenu", (e) => e.preventDefault());
canvas.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.12 : 1 / 1.12);
    scheduleAutosave();
  },
  { passive: false },
);
window.addEventListener("keydown", (e) => {
  const editing = ["INPUT", "TEXTAREA", "SELECT"].includes(
    document.activeElement?.tagName,
  );
  if (e.code === "Space" && !editing) {
    spacePressed = true;
    e.preventDefault();
  }
  if (activeLayer === "roof") {
    const roofCtrl = e.ctrlKey || e.metaKey;
    if (roofCtrl && e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if (roofCtrl && e.key.toLowerCase() === "y") { e.preventDefault(); redo(); return; }
    if (roofCtrl && e.key.toLowerCase() === "d" && !editing) { e.preventDefault(); duplicateSelection(); return; }
    if (!editing) {
      const roofNudges = {
        ArrowUp: [0, -ROOF_MOVE_STEP_MM],
        KeyW: [0, -ROOF_MOVE_STEP_MM],
        ArrowDown: [0, ROOF_MOVE_STEP_MM],
        KeyS: [0, ROOF_MOVE_STEP_MM],
        ArrowLeft: [-ROOF_MOVE_STEP_MM, 0],
        KeyA: [-ROOF_MOVE_STEP_MM, 0],
        ArrowRight: [ROOF_MOVE_STEP_MM, 0],
        KeyD: [ROOF_MOVE_STEP_MM, 0],
      };
      const nudge = roofNudges[e.code];
      if (nudge) {
        e.preventDefault();
        nudgeSelectedRoofs(nudge[0], nudge[1]);
        return;
      }
    }
    if (e.key === "Escape") { roofDrag = null; setMode("roof-select"); return; }
    if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); deleteSelection(); }
    return;
  }
  const ctrl = e.ctrlKey || e.metaKey;
  if (ctrl && e.key.toLowerCase() === "z") {
    e.preventDefault();
    undo();
    return;
  }
  if (
    ctrl &&
    (e.key.toLowerCase() === "y" || (e.shiftKey && e.key.toLowerCase() === "z"))
  ) {
    e.preventDefault();
    redo();
    return;
  }
  if (ctrl && e.key.toLowerCase() === "d" && !editing) {
    e.preventDefault();
    duplicateSelection();
    return;
  }
  if (!editing && e.key === "Tab") {
    e.preventDefault();
    toggleWallType();
    return;
  }
  if (!editing && e.key.toLowerCase() === "v") {
    setMode("select");
    return;
  }
  if (!editing && e.key.toLowerCase() === "n") {
    setMode("draw-normal");
    return;
  }
  if (!editing && e.key.toLowerCase() === "b") {
    setMode("draw-veranda");
    return;
  }
  if (!editing && (e.key === "Delete" || e.key === "Backspace")) {
    e.preventDefault();
    deleteSelection();
    return;
  }
  if (e.key === "Escape") {
    if (mode === "eraser" && eraserDrawing) {
      cancelLinearEraser();
      draw();
    } else if (
      mode === "calibrate" ||
      mode === "background-move" ||
      mode === "eraser" ||
      mode.startsWith("shape-")
    )
      setMode(previousMode || "select");
    else if (isDrawing) cancelDrawing();
    else {
      selectedIds.clear();
      updateSelectionUI();
      draw();
    }
    return;
  }
  if (isDrawing || eraserDrawing) {
    const input = $("length-input");
    if (/^[0-9]$/.test(e.key) && document.activeElement !== input)
      input.focus();
    if (e.key === "Enter") {
      e.preventDefault();
      const val = Number(input.value);
      const length = Number.isFinite(val) && val > 0 ? val : null;
      if (eraserDrawing) commitLinearErase(length);
      else commitDrawnWall(length);
    }
  }
});
window.addEventListener("keyup", (e) => {
  if (e.code === "Space") spacePressed = false;
});
window.addEventListener("resize", resizeCanvas);
$("draw-step").addEventListener("change", (e) =>
  setDrawingStep(e.target.value),
);
$("draw-step").addEventListener("blur", (e) => setDrawingStep(e.target.value));
$("default-thickness").addEventListener("change", (e) =>
  setDefaultWallThickness(e.target.value),
);
$("default-thickness").addEventListener("blur", (e) =>
  setDefaultWallThickness(e.target.value),
);
$("multi-build-stage").addEventListener("change", (e) =>
  setSelectionBuildStage(e.target.value),
);
$("roof-build-type").addEventListener("change", (e) => setRoofType(e.target.value));
$("roof-slope-mode").addEventListener("change", updateRoofSlopePopupUI);
$("json-input").addEventListener("change", (e) =>
  importJSONFile(e.target.files[0]),
);
$("background-input").addEventListener("change", (e) => {
  loadBackgroundFile(e.target.files[0]);
  e.target.value = "";
});
$("background-opacity").addEventListener("input", (e) => {
  background.opacity = Number(e.target.value) / 100;
  $("opacity-label").textContent = `${e.target.value}%`;
  draw();
  scheduleAutosave();
});
$("background-visible").addEventListener("change", (e) => {
  background.visible = e.target.checked;
  draw();
  scheduleAutosave();
});
$("background-width").addEventListener("change", (e) =>
  setBackgroundDimension("width", e.target.value),
);
$("background-height").addEventListener("change", (e) =>
  setBackgroundDimension("height", e.target.value),
);
$("modal-backdrop").addEventListener("mousedown", (e) => {
  if (e.target === $("modal-backdrop")) hideModal();
});

/** Bind declarative buttons from index.html. */
function bindUiActions() {
  document.querySelectorAll("[data-layer]").forEach((element) => {
    element.addEventListener("click", () =>
      setActiveLayer(element.dataset.layer),
    );
  });

  document.querySelectorAll("[data-mode]").forEach((element) => {
    element.addEventListener("click", () => setMode(element.dataset.mode));
  });

  const actions = {
    "toggle-wall-type": () => toggleWallType(),
    undo: () => undo(),
    redo: () => redo(),
    "duplicate-selection": () => duplicateSelection(),
    "merge-selection": () => mergeSelectedWalls(),
    "rotate-roof": (element) => rotateSelectedRoof(element.dataset.direction),
    "save-roof-properties": () => applyRoofProperties(),
    "save-roof-slope": () => saveRoofSlopeProperties(),
    "close-roof-slope": () => closeRoofSlopePopup(),
    "open-json-import": () => $("json-input").click(),
    "export-json": () => exportJSON(),
    "fit-plan": () => fitPlan(),
    "confirm-clear": () => confirmClear(),
    "toggle-sidebar": () => toggleSidebar(),
    zoom: (element) => zoomAtCenter(Number(element.dataset.factor)),
    "reset-view": () => resetView(),
    "save-wall-properties": () => applySingleProperties(),
    "delete-selection": () => deleteSelection(),
    "selection-type": (element) =>
      setSelectionType(element.dataset.value === "veranda"),
    "scale-background": (element) =>
      scaleBackground(Number(element.dataset.factor)),
    "fit-background": () => fitBackgroundToView(),
    "background-to-origin": () => moveBackgroundToOrigin(),
    "flip-background": (element) =>
      toggleBackgroundFlip(element.dataset.axis),
    "toggle-background-move": () => toggleBackgroundMove(),
    "start-calibration": () => startCalibration(),
    "remove-background": () => removeBackground(),
    "validate-plan": () => runValidation(true),
    "validate-joints": () => normalizeAllIntersectionsAction(),
    "save-local": () => saveToLocalStorage(true),
    "clear-local": () => clearAutosave(),
  };

  document.querySelectorAll("[data-action]").forEach((element) => {
    const handler = actions[element.dataset.action];
    if (!handler) {
      console.warn(`Unknown UI action: ${element.dataset.action}`);
      return;
    }
    element.addEventListener("click", () => handler(element));
  });
}
