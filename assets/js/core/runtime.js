"use strict";

/**
 * Shared DOM references, constants, and mutable application state.
 */

"use strict";
const $ = (id) => document.getElementById(id);
const canvas = $("planCanvas");
const ctx = canvas.getContext("2d");
const workspace = $("workspace");
const STORAGE_KEY = "planDrawerV3.9.smartMove.autosave";
const SNAP_SCREEN_PX = 13;
const HIT_SCREEN_PX = 10;
const HANDLE_RADIUS = 7;
const GAP_WARNING_MM = 100;
const MIN_BACKGROUND_SIZE_MM = 50;
const MAX_HISTORY = 100;
const FIXED_WALL_THICKNESS = 150;
const MOVE_GUIDE_ORTH_SCREEN_PX = 280;
let walls = [];
let selectedIds = new Set();
let drawingStepMM = 1;
let defaultWallThickness = FIXED_WALL_THICKNESS;
let mode = "draw-normal";
let previousMode = "draw-normal";
let activeWallType = "normal";
let shapeDrag = null;
let eraserDrawing = false;
let eraserStart = null;
let eraserCurrent = null;
let eraserDirection = "x";
let eraserSign = 1;
let mouseScreen = { x: 0, y: 0 };
let isDrawing = false;
let drawStart = null;
let drawStartBase = null;
let drawStartAttachment = null;
let drawCurrent = null;
let drawDirection = "x";
let drawSign = 1;
let isPanning = false;
let panStart = null;
let drag = null;
let activeMoveGuides = { x: null, y: null };
let selectionBox = null;
let spacePressed = false;
let mouseWorld = { x: 0, y: 0 };
let view = { scale: 0.16, originX: 50, originY: 500 };
let lastCanvasCssHeight = 0;
let history = [];
let historyIndex = -1;
let validationIssues = [];
let invalidWallIds = new Set();
let autosaveTimer = null;
let calibrationPoints = [];
let background = {
  img: null,
  dataUrl: null,
  visible: true,
  opacity: 0.45,
  x: 0,
  y: 0,
  width: 0,
  height: 0,
  moveMode: false,
};
const deepClone = (value) => JSON.parse(JSON.stringify(value));
const roundStep = (value) => Math.round(value / drawingStepMM) * drawingStepMM;
const nearlyEqual = (a, b, eps = 0.001) => Math.abs(a - b) <= eps;
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const newId = () =>
  "wall-" +
  (crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
const wallLength = (w) => Math.hypot(w.EndX - w.StartX, w.EndY - w.StartY);
const isHorizontal = (w) => nearlyEqual(w.StartY, w.EndY);
const isVertical = (w) => nearlyEqual(w.StartX, w.EndX);
const isAxisAligned = (w) => isHorizontal(w) || isVertical(w);
const endpoint = (w, which) =>
  which === "start" ? { x: w.StartX, y: w.StartY } : { x: w.EndX, y: w.EndY };
const wallById = (id) => walls.find((w) => w.Id === id);
// Геометрическая модель стены. Координаты описывают ось между центрами
// торцевых граней, а толщина формирует настоящий прямоугольник в миллиметрах.
// Все привязки выполняются к физическим граням этого прямоугольника.
