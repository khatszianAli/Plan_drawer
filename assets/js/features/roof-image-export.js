"use strict";

const ROOF_EXPORT_IMAGE_SIZE = 1500;
const ROOF_EXPORT_MARGIN = 150;

function roofExportIssue() {
  if (!walls.length)
    return "Для генерации изображений сначала добавьте стены.";
  const hasMultiRoof = roofs.some((roof) => roof.RoofType === "multi");
  if (hasMultiRoof && !roofRoot())
    return "Для многоскатных крыш нужно назначить root.";
  const hierarchyIssue = roofHierarchyIssue(roofs);
  if (hierarchyIssue)
    return `Укажите parent для блока крыши «${hierarchyIssue.Name || hierarchyIssue.Id}».`;
  return null;
}

function editableRoofSlopes() {
  const result = [];
  for (const roof of roofs) {
    if (roof.RoofType !== "multi") continue;
    if (roof.IsRoot && normalizeRoofSlope(roof.SlopeStart).IsEditable)
      result.push({
        roof,
        end: "start",
        point: roofRidgeEndpoints(roof).start,
      });
    if (normalizeRoofSlope(roof.SlopeEnd).IsEditable)
      result.push({
        roof,
        end: "end",
        point: roofRidgeEndpoints(roof).end,
      });
  }
  return result;
}

function exportPlanBounds(extraPoints = []) {
  const points = [];
  for (const wall of walls) {
    const bounds = wallBounds(wall);
    points.push(
      { x: bounds.minX, y: bounds.minY },
      { x: bounds.maxX, y: bounds.maxY },
    );
  }
  points.push(...extraPoints);
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

function roofSlopeOutwardVector(roof, end) {
  const ridge = roofRidgeEndpoints(roof);
  const point = ridge[end];
  const bounds = roofBounds(roof);
  const center = {
    x: (bounds.minX + bounds.maxX) / 2,
    y: (bounds.minY + bounds.maxY) / 2,
  };
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  const length = Math.hypot(dx, dy) || 1;
  return { x: dx / length, y: dy / length };
}

function createRoofExportTransform(extraPoints = []) {
  const bounds = exportPlanBounds(extraPoints);
  const width = Math.max(bounds.maxX - bounds.minX, 1);
  const height = Math.max(bounds.maxY - bounds.minY, 1);
  const scale = Math.min(
    (ROOF_EXPORT_IMAGE_SIZE - ROOF_EXPORT_MARGIN * 2) / width,
    (ROOF_EXPORT_IMAGE_SIZE - ROOF_EXPORT_MARGIN * 2) / height,
  );
  const offsetX =
    (ROOF_EXPORT_IMAGE_SIZE - width * scale) / 2 - bounds.minX * scale;
  const offsetY =
    (ROOF_EXPORT_IMAGE_SIZE - height * scale) / 2 - bounds.minY * scale;
  return (point) => ({
    x: point.x * scale + offsetX,
    y: point.y * scale + offsetY,
    scale,
  });
}

function drawExportWallBody(context, wall, transform, color, outline) {
  const bounds = wallBounds(wall);
  const topLeft = transform({ x: bounds.minX, y: bounds.minY });
  const bottomRight = transform({ x: bounds.maxX, y: bounds.maxY });
  const x = Math.min(topLeft.x, bottomRight.x);
  const y = Math.min(topLeft.y, bottomRight.y);
  const width = Math.max(Math.abs(bottomRight.x - topLeft.x), 2);
  const height = Math.max(Math.abs(bottomRight.y - topLeft.y), 2);
  context.fillStyle = color;
  context.fillRect(x, y, width, height);
  if (outline) {
    context.strokeStyle = "#20242a";
    context.lineWidth = 2;
    context.strokeRect(x, y, width, height);
  }
}

function structuralWallNodes() {
  const nodes = [];
  const add = (
    x,
    y,
    thickness = FIXED_WALL_THICKNESS,
    locked = false,
  ) => {
    const tolerance = Math.max(thickness, FIXED_WALL_THICKNESS) * 0.8;
    const existing = nodes.find(
      (node) => Math.hypot(node.x - x, node.y - y) <= tolerance,
    );
    if (existing) {
      existing.count++;
      existing.thickness = Math.max(existing.thickness, thickness);
      if (locked && !existing.locked) {
        existing.x = x;
        existing.y = y;
        existing.locked = true;
      } else if (!existing.locked && !locked) {
        existing.x =
          (existing.x * (existing.count - 1) + x) / existing.count;
        existing.y =
          (existing.y * (existing.count - 1) + y) / existing.count;
      }
    } else {
      nodes.push({ x, y, count: 1, thickness, locked });
    }
  };

  for (let i = 0; i < walls.length; i++) {
    const first = walls[i];
    if (!isHorizontal(first) && !isVertical(first)) continue;
    for (let j = i + 1; j < walls.length; j++) {
      const second = walls[j];
      if (
        (!isHorizontal(first) && !isVertical(first)) ||
        (!isHorizontal(second) && !isVertical(second))
      )
        continue;
      if (isHorizontal(first) === isHorizontal(second)) continue;
      const horizontal = isHorizontal(first) ? first : second;
      const vertical = isVertical(first) ? first : second;
      const firstBounds = wallBounds(first);
      const secondBounds = wallBounds(second);
      if (rectDistance(firstBounds, secondBounds) > 0.001) continue;
      add(
        vertical.StartX,
        horizontal.StartY,
        Math.max(
          Number(first.Thickness) || FIXED_WALL_THICKNESS,
          Number(second.Thickness) || FIXED_WALL_THICKNESS,
        ),
        true,
      );
    }
  }
  for (const wall of walls) {
    const thickness = Number(wall.Thickness) || FIXED_WALL_THICKNESS;
    add(wall.StartX, wall.StartY, thickness);
    add(wall.EndX, wall.EndY, thickness);
  }
  return nodes;
}

function drawStructureNodes(context, transform) {
  for (const node of structuralWallNodes()) {
    const point = transform(node);
    const size = Math.max(node.thickness * point.scale, 10);
    context.fillStyle = "#d3d2ca";
    context.strokeStyle = "#20242a";
    context.lineWidth = Math.max(2, size * 0.04);
    context.fillRect(
      point.x - size / 2,
      point.y - size / 2,
      size,
      size,
    );
    context.strokeRect(
      point.x - size / 2,
      point.y - size / 2,
      size,
      size,
    );
  }
}

function drawArrow(context, center, direction) {
  const angle = Math.atan2(direction.y, direction.x);
  const width = 90;
  const height = width * 0.58;
  const left = -width / 2;
  const right = width / 2;
  const top = -height / 2;
  const bottom = height / 2;
  const neckX = left + width * 0.38;
  context.save();
  context.translate(center.x, center.y);
  context.rotate(angle);
  context.beginPath();
  context.moveTo(right, 0);
  context.lineTo(-neckX, top);
  context.lineTo(-neckX, -height * 0.2);
  context.lineTo(left, -height * 0.2);
  context.lineTo(left, height * 0.2);
  context.lineTo(-neckX, height * 0.2);
  context.lineTo(-neckX, bottom);
  context.closePath();
  context.fillStyle = "#68de0f";
  context.strokeStyle = "#377e0f";
  context.lineWidth = 3;
  context.fill();
  context.stroke();
  context.restore();
}

function renderRoofExportImage(slope = null, black = false) {
  const canvasElement = document.createElement("canvas");
  canvasElement.width = ROOF_EXPORT_IMAGE_SIZE;
  canvasElement.height = ROOF_EXPORT_IMAGE_SIZE;
  const context = canvasElement.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvasElement.width, canvasElement.height);

  let arrowWorld = null;
  let targetWorld = null;
  if (slope) {
    const outward = roofSlopeOutwardVector(slope.roof, slope.end);
    const planBounds = exportPlanBounds();
    const planSize = Math.max(
      planBounds.maxX - planBounds.minX,
      planBounds.maxY - planBounds.minY,
      1,
    );
    const offset = Math.max(planSize * 0.08, 350);
    targetWorld = slope.point;
    arrowWorld = {
      x: targetWorld.x + outward.x * offset,
      y: targetWorld.y + outward.y * offset,
    };
  }
  const transform = createRoofExportTransform(
    arrowWorld ? [arrowWorld] : [],
  );
  for (const wall of walls) {
    const color = black
      ? wall.IsVeranda
        ? "#dc2d2d"
        : "#000000"
      : "#848480";
    drawExportWallBody(context, wall, transform, color, !black);
  }
  if (!black) drawStructureNodes(context, transform);
  if (arrowWorld && targetWorld) {
    const arrow = transform(arrowWorld);
    const target = transform(targetWorld);
    const dx = target.x - arrow.x;
    const dy = target.y - arrow.y;
    const length = Math.hypot(dx, dy) || 1;
    drawArrow(context, arrow, { x: dx / length, y: dy / length });
  }
  return canvasElement;
}

function canvasToPngBlob(canvasElement) {
  return new Promise((resolve, reject) =>
    canvasElement.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(new Error("Не удалось создать PNG.")),
      "image/png",
    ),
  );
}

function safeExportFileName(value) {
  const cleaned = String(value || "roof")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9а-яё_-]+/gi, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || "roof";
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++)
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function zipU16(value) {
  return [value & 255, (value >>> 8) & 255];
}
function zipU32(value) {
  return [...zipU16(value), ...zipU16(value >>> 16)];
}

async function createStoredZip(entries) {
  const encoder = new TextEncoder();
  const files = [];
  const central = [];
  let offset = 0;
  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const data = new Uint8Array(await entry.blob.arrayBuffer());
    const crc = crc32(data);
    const local = new Uint8Array([
      ...zipU32(0x04034b50),
      ...zipU16(20),
      ...zipU16(0x0800),
      ...zipU16(0),
      ...zipU16(0),
      ...zipU16(0),
      ...zipU32(crc),
      ...zipU32(data.length),
      ...zipU32(data.length),
      ...zipU16(name.length),
      ...zipU16(0),
      ...name,
      ...data,
    ]);
    files.push(local);
    central.push(
      new Uint8Array([
        ...zipU32(0x02014b50),
        ...zipU16(20),
        ...zipU16(20),
        ...zipU16(0x0800),
        ...zipU16(0),
        ...zipU16(0),
        ...zipU16(0),
        ...zipU32(crc),
        ...zipU32(data.length),
        ...zipU32(data.length),
        ...zipU16(name.length),
        ...zipU16(0),
        ...zipU16(0),
        ...zipU16(0),
        ...zipU16(0),
        ...zipU32(0),
        ...zipU32(offset),
        ...name,
      ]),
    );
    offset += local.length;
  }
  const centralSize = central.reduce((sum, item) => sum + item.length, 0);
  const end = new Uint8Array([
    ...zipU32(0x06054b50),
    ...zipU16(0),
    ...zipU16(0),
    ...zipU16(entries.length),
    ...zipU16(entries.length),
    ...zipU32(centralSize),
    ...zipU32(offset),
    ...zipU16(0),
  ]);
  return new Blob([...files, ...central, end], {
    type: "application/zip",
  });
}

async function exportRoofImagePackage() {
  const issue = roofExportIssue();
  if (issue) return showModal("Генерация невозможна", issue);
  try {
    const slopes = editableRoofSlopes();
    const slopeImages = new Map();
    const entries = [];
    for (let index = 0; index < slopes.length; index++) {
      const slope = slopes[index];
      const endName = slope.end === "start" ? "start" : "end";
      const fileName =
        `images/${String(index + 1).padStart(2, "0")}-` +
        `${safeExportFileName(slope.roof.Name || slope.roof.Id)}-${endName}.png`;
      slopeImages.set(`${slope.roof.Id}:${slope.end}`, fileName);
      entries.push({
        name: `house_plan_with_images/${fileName}`,
        blob: await canvasToPngBlob(renderRoofExportImage(slope)),
      });
    }
    entries.push({
      name: "house_plan_with_images/images/walls_black.png",
      blob: await canvasToPngBlob(renderRoofExportImage(null, true)),
    });
    const payload = {
      walls: walls.map(cleanWallForJSONExport),
      roofs: roofs.map((roof) => cleanRoofForJSONExport(roof, slopeImages)),
      Images: { WallsBlack: "images/walls_black.png" },
    };
    entries.unshift({
      name: "house_plan_with_images/house_plan.json",
      blob: new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      }),
    });
    const zip = await createStoredZip(entries);
    const url = URL.createObjectURL(zip);
    const link = document.createElement("a");
    link.href = url;
    link.download = "house_plan_with_images.zip";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showModal(
      "Архив создан",
      `Архив house_plan_with_images.zip скачан в папку загрузок. Изображений скатов: ${slopes.length}.`,
    );
  } catch (error) {
    if (error?.name === "AbortError") return;
    showModal(
      "Ошибка генерации",
      error.message || "Не удалось создать JSON и изображения.",
    );
  }
}
