/**
 * AEC Shape Renderers — standalone draw functions extracted from ShapeRenderer.
 *
 * Each function takes a ShapeRenderContext instead of operating on `this`.
 */

import type {
  ShapeRenderContext,
  BeamShape,
  GridlineShape,
  LevelShape,
  PuntniveauShape,
  PileShape,
  WallShape,
  SlabShape,
  SlabOpeningShape,
  SlabLabelShape,
  WallSystemType,
  SectionCalloutShape,
  SpaceShape,
  PlateSystemShape,
  SpotElevationShape,
  CPTShape,
  FoundationZoneShape,
  ColumnShape,
  RebarShape,
  ProfileType,
  ParameterValues,
} from 'open-2d-studio';
import {
  shapeRendererRegistry,
  bulgeToArc,
  generateProfileGeometry,
  calculateLayerOffsets,
  generateWallSystemGrid,
  CAD_DEFAULT_FONT,
  DEFAULT_MATERIAL_HATCH_SETTINGS,
  LINE_DASH_REFERENCE_SCALE,
  STRUCTURAL_FLOOR_TYPES,
  formatNumber,
  formatElevation,
  useAppStore,
} from 'open-2d-studio';

// ---------------------------------------------------------------------------
// Helper: line-line intersection (pure geometry, no render context)
// ---------------------------------------------------------------------------

function lineIntersection(
  p1: { x: number; y: number },
  d1: { x: number; y: number },
  p2: { x: number; y: number },
  d2: { x: number; y: number },
): { x: number; y: number } | null {
  const cross = d1.x * d2.y - d1.y * d2.x;
  if (Math.abs(cross) < 1e-10) return null;
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const t = (dx * d2.y - dy * d2.x) / cross;
  return { x: p1.x + t * d1.x, y: p1.y + t * d1.y };
}

// ---------------------------------------------------------------------------
// Beam helpers
// ---------------------------------------------------------------------------

/**
 * Compute the four polygon corners of a beam in plan view, taking miter caps
 * into account.  Corner order: [startLeft, endLeft, endRight, startRight].
 */
function computeBeamCorners(shape: BeamShape): { x: number; y: number }[] {
  const { start, end, flangeWidth, startMiterAngle, endMiterAngle } = shape;
  const startCap = shape.startCap || 'butt';
  const endCap = shape.endCap || 'butt';
  const beamAngle = Math.atan2(end.y - start.y, end.x - start.x);
  const halfWidth = flangeWidth / 2;

  const perpX = Math.sin(beamAngle) * halfWidth;
  const perpY = Math.cos(beamAngle) * halfWidth;

  const dirX = Math.cos(beamAngle);
  const dirY = Math.sin(beamAngle);

  let startLeft  = { x: start.x + perpX, y: start.y - perpY };
  let startRight = { x: start.x - perpX, y: start.y + perpY };
  let endLeft    = { x: end.x + perpX,   y: end.y - perpY };
  let endRight   = { x: end.x - perpX,   y: end.y + perpY };

  // --- Miter at start ---
  if (startCap === 'miter' && startMiterAngle !== undefined) {
    const otherDirX = Math.cos(startMiterAngle);
    const otherDirY = Math.sin(startMiterAngle);

    const bisX = dirX + otherDirX;
    const bisY = dirY + otherDirY;
    const bisLen = Math.hypot(bisX, bisY);

    if (bisLen > 1e-10) {
      const miterDir = { x: bisX / bisLen, y: bisY / bisLen };
      const beamDir = { x: dirX, y: dirY };

      const newStartLeft = lineIntersection(startLeft, beamDir, start, miterDir);
      const newStartRight = lineIntersection(startRight, beamDir, start, miterDir);

      const maxExt = flangeWidth * 3;
      if (newStartLeft) {
        const dist = Math.hypot(newStartLeft.x - startLeft.x, newStartLeft.y - startLeft.y);
        if (dist < maxExt) startLeft = newStartLeft;
      }
      if (newStartRight) {
        const dist = Math.hypot(newStartRight.x - startRight.x, newStartRight.y - startRight.y);
        if (dist < maxExt) startRight = newStartRight;
      }
    }
  }

  // --- Miter at end ---
  if (endCap === 'miter' && endMiterAngle !== undefined) {
    const otherDirX = Math.cos(endMiterAngle);
    const otherDirY = Math.sin(endMiterAngle);

    const awayDirX = -dirX;
    const awayDirY = -dirY;

    const bisX = awayDirX + otherDirX;
    const bisY = awayDirY + otherDirY;
    const bisLen = Math.hypot(bisX, bisY);

    if (bisLen > 1e-10) {
      const miterDir = { x: bisX / bisLen, y: bisY / bisLen };
      const beamDir = { x: dirX, y: dirY };

      const newEndLeft = lineIntersection(endLeft, beamDir, end, miterDir);
      const newEndRight = lineIntersection(endRight, beamDir, end, miterDir);

      const maxExt = flangeWidth * 3;
      if (newEndLeft) {
        const dist = Math.hypot(newEndLeft.x - endLeft.x, newEndLeft.y - endLeft.y);
        if (dist < maxExt) endLeft = newEndLeft;
      }
      if (newEndRight) {
        const dist = Math.hypot(newEndRight.x - endRight.x, newEndRight.y - endRight.y);
        if (dist < maxExt) endRight = newEndRight;
      }
    }
  }

  return [startLeft, endLeft, endRight, startRight];
}

// ---------------------------------------------------------------------------
// Wall helpers
// ---------------------------------------------------------------------------

/**
 * Compute the four polygon corners of a wall, taking miter caps into account.
 * Corner order: [startLeft, endLeft, endRight, startRight].
 */
function computeWallCorners(shape: WallShape): { x: number; y: number }[] {
  const { start, end, thickness, startCap, endCap, startMiterAngle, endMiterAngle, justification } = shape;
  const wallAngle = Math.atan2(end.y - start.y, end.x - start.x);
  const halfThick = thickness / 2;

  let leftThick: number;
  let rightThick: number;
  if (justification === 'left') {
    // "Left justified" = left face is on the draw line, wall extends to the right
    leftThick = 0;
    rightThick = thickness;
  } else if (justification === 'right') {
    // "Right justified" = right face is on the draw line, wall extends to the left
    leftThick = thickness;
    rightThick = 0;
  } else {
    leftThick = halfThick;
    rightThick = halfThick;
  }

  const perpUnitX = Math.sin(wallAngle);
  const perpUnitY = Math.cos(wallAngle);
  const dirX = Math.cos(wallAngle);
  const dirY = Math.sin(wallAngle);

  let startLeft  = { x: start.x + perpUnitX * leftThick,  y: start.y - perpUnitY * leftThick };
  let startRight = { x: start.x - perpUnitX * rightThick, y: start.y + perpUnitY * rightThick };
  let endLeft    = { x: end.x + perpUnitX * leftThick,    y: end.y - perpUnitY * leftThick };
  let endRight   = { x: end.x - perpUnitX * rightThick,   y: end.y + perpUnitY * rightThick };

  // --- Miter at start ---
  if (startCap === 'miter' && startMiterAngle !== undefined) {
    const otherDirX = Math.cos(startMiterAngle);
    const otherDirY = Math.sin(startMiterAngle);

    const bisX = dirX + otherDirX;
    const bisY = dirY + otherDirY;
    const bisLen = Math.hypot(bisX, bisY);

    if (bisLen > 1e-10) {
      const miterDir = { x: bisX / bisLen, y: bisY / bisLen };
      const wallDir = { x: dirX, y: dirY };

      const leftInt = lineIntersection(startLeft, wallDir, start, miterDir);
      const rightInt = lineIntersection(startRight, wallDir, start, miterDir);

      const maxExt = thickness * 3;
      if (leftInt) {
        const dist = Math.hypot(leftInt.x - startLeft.x, leftInt.y - startLeft.y);
        if (dist < maxExt) startLeft = leftInt;
      }
      if (rightInt) {
        const dist = Math.hypot(rightInt.x - startRight.x, rightInt.y - startRight.y);
        if (dist < maxExt) startRight = rightInt;
      }
    }
  }

  // --- Miter at end ---
  if (endCap === 'miter' && endMiterAngle !== undefined) {
    const otherDirX = Math.cos(endMiterAngle);
    const otherDirY = Math.sin(endMiterAngle);

    const awayDirX = -dirX;
    const awayDirY = -dirY;

    const bisX = awayDirX + otherDirX;
    const bisY = awayDirY + otherDirY;
    const bisLen = Math.hypot(bisX, bisY);

    if (bisLen > 1e-10) {
      const miterDir = { x: bisX / bisLen, y: bisY / bisLen };
      const wallDir = { x: dirX, y: dirY };

      const leftInt = lineIntersection(endLeft, wallDir, end, miterDir);
      const rightInt = lineIntersection(endRight, wallDir, end, miterDir);

      const maxExt = thickness * 3;
      if (leftInt) {
        const dist = Math.hypot(leftInt.x - endLeft.x, leftInt.y - endLeft.y);
        if (dist < maxExt) endLeft = leftInt;
      }
      if (rightInt) {
        const dist = Math.hypot(rightInt.x - endRight.x, rightInt.y - endRight.y);
        if (dist < maxExt) endRight = rightInt;
      }
    }
  }

  return [startLeft, endLeft, endRight, startRight];
}

// ---------------------------------------------------------------------------
// Beam draw functions
// ---------------------------------------------------------------------------

/** Draw beam label at midpoint */
function drawBeamLabel(renderCtx: ShapeRenderContext, shape: BeamShape, invertColors: boolean): void {
  const ctx = renderCtx.ctx;
  const { start, end, flangeWidth, labelText, presetName } = shape;
  const beamAngle = Math.atan2(end.y - start.y, end.x - start.x);
  const halfWidth = flangeWidth / 2;

  const beamLabel = labelText || presetName || `${Math.round(flangeWidth)}mm`;
  const midX = (start.x + end.x) / 2;
  const midY = (start.y + end.y) / 2;
  const dpr = window.devicePixelRatio || 1;
  const zoom = ctx.getTransform().a / dpr;
  const fontSize = Math.max(10 / zoom, flangeWidth * 0.3);

  ctx.save();
  ctx.translate(midX, midY);
  let textAngle = beamAngle;
  if (textAngle > Math.PI / 2 || textAngle < -Math.PI / 2) {
    textAngle += Math.PI;
  }
  ctx.rotate(textAngle);

  let textColor = shape.style.strokeColor;
  if (invertColors && textColor === '#ffffff') {
    textColor = '#000000';
  }
  ctx.fillStyle = textColor;
  ctx.font = `${fontSize}px ${CAD_DEFAULT_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(beamLabel, 0, -halfWidth - fontSize * 0.8);
  ctx.restore();
}

/** Draw beam in plan view (top-down rectangle, with miter polygon support) */
function drawBeamPlan(renderCtx: ShapeRenderContext, shape: BeamShape, invertColors: boolean): void {
  if (shape.bulge && Math.abs(shape.bulge) > 0.0001) {
    drawArcBeam(renderCtx, shape, invertColors);
    return;
  }

  const ctx = renderCtx.ctx;
  const { start, end, showCenterline, showLabel, material } = shape;
  const startCap = shape.startCap || 'butt';
  const endCap = shape.endCap || 'butt';

  const originalLineWidth = ctx.lineWidth;
  if (material === 'concrete') {
    ctx.lineWidth = originalLineWidth * 1.5;
  } else if (material === 'timber') {
    ctx.lineWidth = originalLineWidth * 1.2;
  }

  const corners = computeBeamCorners(shape);

  const hasStartMiterBeam = startCap === 'miter';
  const hasEndMiterBeam = endCap === 'miter';

  // Left side edge
  ctx.beginPath();
  ctx.moveTo(corners[0].x, corners[0].y);
  ctx.lineTo(corners[1].x, corners[1].y);
  ctx.stroke();

  // End cap edge (always draw — corners already account for miter angle)
  ctx.beginPath();
  ctx.moveTo(corners[1].x, corners[1].y);
  ctx.lineTo(corners[2].x, corners[2].y);
  ctx.stroke();

  // Right side edge
  ctx.beginPath();
  ctx.moveTo(corners[2].x, corners[2].y);
  ctx.lineTo(corners[3].x, corners[3].y);
  ctx.stroke();

  // Start cap edge (always draw)
  ctx.beginPath();
  ctx.moveTo(corners[3].x, corners[3].y);
  ctx.lineTo(corners[0].x, corners[0].y);
  ctx.stroke();

  if (showCenterline) {
    ctx.save();
    ctx.setLineDash(renderCtx.getLineDash('dashdot'));
    ctx.strokeStyle = invertColors ? 'rgba(0, 0, 0, 0.4)' : 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = originalLineWidth * 0.5;
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
    ctx.restore();
  }

  if (showLabel) {
    drawBeamLabel(renderCtx, shape, invertColors);
  }

  ctx.lineWidth = originalLineWidth;
}

/** Draw an arc beam shape (curved beam using bulge factor) */
function drawArcBeam(renderCtx: ShapeRenderContext, shape: BeamShape, invertColors: boolean): void {
  const ctx = renderCtx.ctx;
  const { start, end, flangeWidth, showCenterline, showLabel, material, justification } = shape;
  const bulge = shape.bulge!;

  const originalLineWidth = ctx.lineWidth;
  if (material === 'concrete') {
    ctx.lineWidth = originalLineWidth * 1.5;
  } else if (material === 'timber') {
    ctx.lineWidth = originalLineWidth * 1.2;
  }

  const { center, radius, startAngle, endAngle, clockwise } = bulgeToArc(start, end, bulge);

  let innerR: number;
  let outerR: number;
  if (justification === 'left') {
    innerR = radius;
    outerR = radius + flangeWidth;
  } else if (justification === 'right') {
    innerR = radius - flangeWidth;
    outerR = radius;
  } else {
    innerR = radius - flangeWidth / 2;
    outerR = radius + flangeWidth / 2;
  }
  if (innerR < 0) innerR = 0;

  const buildArcPath = () => {
    ctx.beginPath();
    ctx.arc(center.x, center.y, outerR, startAngle, endAngle, clockwise);
    ctx.lineTo(center.x + innerR * Math.cos(endAngle), center.y + innerR * Math.sin(endAngle));
    ctx.arc(center.x, center.y, innerR, endAngle, startAngle, !clockwise);
    ctx.closePath();
  };

  buildArcPath();
  ctx.stroke();

  if (showCenterline) {
    ctx.save();
    ctx.setLineDash(renderCtx.getLineDash('dashdot'));
    ctx.strokeStyle = invertColors ? 'rgba(0, 0, 0, 0.4)' : 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = originalLineWidth * 0.5;
    ctx.beginPath();
    ctx.arc(center.x, center.y, radius, startAngle, endAngle, clockwise);
    ctx.stroke();
    ctx.restore();
  }

  if (showLabel) {
    drawBeamLabel(renderCtx, shape, invertColors);
  }

  ctx.lineWidth = originalLineWidth;
}

/** Draw beam in section view (cross-section at midpoint) */
function drawBeamSection(renderCtx: ShapeRenderContext, shape: BeamShape, invertColors: boolean): void {
  const ctx = renderCtx.ctx;
  const { start, end, profileType, profileParameters } = shape;

  const midX = (start.x + end.x) / 2;
  const midY = (start.y + end.y) / 2;

  try {
    const geometry = generateProfileGeometry(
      profileType as ProfileType,
      profileParameters as ParameterValues,
      { x: midX, y: midY },
      shape.rotation,
      1,
    );

    for (let i = 0; i < geometry.outlines.length; i++) {
      const outline = geometry.outlines[i];
      const closed = geometry.closed[i];
      if (outline.length < 2) continue;

      ctx.beginPath();
      ctx.moveTo(outline[0].x, outline[0].y);
      for (let j = 1; j < outline.length; j++) {
        ctx.lineTo(outline[j].x, outline[j].y);
      }
      if (closed) ctx.closePath();
      ctx.stroke();
    }
  } catch {
    drawBeamPlan(renderCtx, shape, invertColors);
    return;
  }

  if (shape.showLabel) {
    drawBeamLabel(renderCtx, shape, invertColors);
  }
}

/** Draw beam in elevation view (side view showing depth) */
function drawBeamElevation(renderCtx: ShapeRenderContext, shape: BeamShape, invertColors: boolean): void {
  const ctx = renderCtx.ctx;
  const { start, end, profileParameters, material } = shape;

  const depth =
    (profileParameters.webHeight as number) ||
    (profileParameters.height as number) ||
    (profileParameters.outerDiameter as number) ||
    shape.flangeWidth;

  const beamAngle = Math.atan2(end.y - start.y, end.x - start.x);
  const halfDepth = depth / 2;
  const perpX = Math.sin(beamAngle) * halfDepth;
  const perpY = Math.cos(beamAngle) * halfDepth;

  const originalLineWidth = ctx.lineWidth;
  if (material === 'concrete') {
    ctx.lineWidth = originalLineWidth * 1.5;
  } else if (material === 'timber') {
    ctx.lineWidth = originalLineWidth * 1.2;
  }

  ctx.beginPath();
  ctx.moveTo(start.x + perpX, start.y - perpY);
  ctx.lineTo(end.x + perpX, end.y - perpY);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(start.x - perpX, start.y + perpY);
  ctx.lineTo(end.x - perpX, end.y + perpY);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(start.x + perpX, start.y - perpY);
  ctx.lineTo(start.x - perpX, start.y + perpY);
  ctx.moveTo(end.x + perpX, end.y - perpY);
  ctx.lineTo(end.x - perpX, end.y + perpY);
  ctx.stroke();

  if (shape.showCenterline) {
    ctx.save();
    ctx.setLineDash(renderCtx.getLineDash('dashdot'));
    ctx.strokeStyle = invertColors ? 'rgba(0, 0, 0, 0.4)' : 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = originalLineWidth * 0.5;
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
    ctx.restore();
  }

  if (shape.showLabel) {
    drawBeamLabel(renderCtx, shape, invertColors);
  }

  ctx.lineWidth = originalLineWidth;
}

/** Draw beam in side view (shows flange width as visible depth) */
function drawBeamSide(renderCtx: ShapeRenderContext, shape: BeamShape, invertColors: boolean): void {
  const ctx = renderCtx.ctx;
  const { start, end, flangeWidth, material } = shape;

  const depth = flangeWidth;
  const beamAngle = Math.atan2(end.y - start.y, end.x - start.x);
  const halfDepth = depth / 2;
  const perpX = Math.sin(beamAngle) * halfDepth;
  const perpY = Math.cos(beamAngle) * halfDepth;

  const originalLineWidth = ctx.lineWidth;
  if (material === 'concrete') {
    ctx.lineWidth = originalLineWidth * 1.5;
  } else if (material === 'timber') {
    ctx.lineWidth = originalLineWidth * 1.2;
  }

  ctx.beginPath();
  ctx.moveTo(start.x + perpX, start.y - perpY);
  ctx.lineTo(end.x + perpX, end.y - perpY);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(start.x - perpX, start.y + perpY);
  ctx.lineTo(end.x - perpX, end.y + perpY);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(start.x + perpX, start.y - perpY);
  ctx.lineTo(start.x - perpX, start.y + perpY);
  ctx.moveTo(end.x + perpX, end.y - perpY);
  ctx.lineTo(end.x - perpX, end.y + perpY);
  ctx.stroke();

  if (shape.showCenterline) {
    ctx.save();
    ctx.setLineDash(renderCtx.getLineDash('dashdot'));
    ctx.strokeStyle = invertColors ? 'rgba(0, 0, 0, 0.4)' : 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = originalLineWidth * 0.5;
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
    ctx.restore();
  }

  if (shape.showLabel) {
    drawBeamLabel(renderCtx, shape, invertColors);
  }

  ctx.lineWidth = originalLineWidth;
}

/** Beam dispatcher — picks the correct view mode renderer */
function drawBeam(renderCtx: ShapeRenderContext, shape: BeamShape, invertColors: boolean): void {
  const viewMode = shape.viewMode || 'plan';
  if (viewMode === 'section') {
    drawBeamSection(renderCtx, shape, invertColors);
  } else if (viewMode === 'elevation') {
    drawBeamElevation(renderCtx, shape, invertColors);
  } else if (viewMode === 'side') {
    drawBeamSide(renderCtx, shape, invertColors);
  } else {
    drawBeamPlan(renderCtx, shape, invertColors);
  }
}

// ---------------------------------------------------------------------------
// Gridline
// ---------------------------------------------------------------------------

function drawGridline(renderCtx: ShapeRenderContext, shape: GridlineShape, invertColors: boolean): void {
  const ctx = renderCtx.ctx;
  const { start, end, label, bubblePosition } = shape;

  const scaleFactor = LINE_DASH_REFERENCE_SCALE / renderCtx.drawingScale;
  const bubbleRadius = shape.bubbleRadius * scaleFactor;
  const fontSize = shape.fontSize * scaleFactor;

  const angle = Math.atan2(end.y - start.y, end.x - start.x);
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);

  const origLineWidth = ctx.lineWidth;
  const scaledLineWidth = origLineWidth * scaleFactor;

  // gridlineExtension is in paper-mm; multiply by LINE_DASH_REFERENCE_SCALE for
  // scale-independent paper size (constant mm on paper regardless of drawing scale)
  const ext = renderCtx.gridlineExtension * LINE_DASH_REFERENCE_SCALE;
  ctx.save();
  ctx.lineWidth = scaledLineWidth;
  ctx.setLineDash(renderCtx.getLineDash('dashdot'));
  ctx.beginPath();
  ctx.moveTo(start.x - dx * ext, start.y - dy * ext);
  ctx.lineTo(end.x + dx * ext, end.y + dy * ext);
  ctx.stroke();
  ctx.restore();

  ctx.setLineDash([]);
  ctx.lineWidth = scaledLineWidth;

  let textColor = shape.style.strokeColor;
  if (invertColors && textColor === '#ffffff') {
    textColor = '#000000';
  }

  const drawBubble = (cx: number, cy: number) => {
    ctx.beginPath();
    ctx.arc(cx, cy, bubbleRadius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.save();
    ctx.fillStyle = textColor;
    ctx.font = `${fontSize}px ${CAD_DEFAULT_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, cx, cy);
    ctx.restore();
  };

  if (bubblePosition === 'start' || bubblePosition === 'both') {
    drawBubble(start.x - dx * (ext + bubbleRadius), start.y - dy * (ext + bubbleRadius));
  }
  if (bubblePosition === 'end' || bubblePosition === 'both') {
    drawBubble(end.x + dx * (ext + bubbleRadius), end.y + dy * (ext + bubbleRadius));
  }
}

// ---------------------------------------------------------------------------
// Level
// ---------------------------------------------------------------------------

function drawLevel(renderCtx: ShapeRenderContext, shape: LevelShape, invertColors: boolean): void {
  const ctx = renderCtx.ctx;
  const { start, end, label } = shape;

  const scaleFactor = LINE_DASH_REFERENCE_SCALE / renderCtx.drawingScale;
  const bubbleRadius = shape.bubbleRadius * scaleFactor;
  const fontSize = shape.fontSize * scaleFactor;

  const angle = Math.atan2(end.y - start.y, end.x - start.x);
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);

  const origLineWidth = ctx.lineWidth;

  ctx.save();
  ctx.setLineDash(renderCtx.getLineDash('dashed'));
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();
  ctx.restore();

  ctx.setLineDash([]);
  ctx.lineWidth = origLineWidth;

  let textColor = shape.style.strokeColor;
  if (invertColors && textColor === '#ffffff') {
    textColor = '#000000';
  }

  // Triangle/arrow marker at the end of the line
  const sz = bubbleRadius * 0.7;
  const tipX = end.x;
  const tipY = end.y;
  const perpX = -dy;
  const perpY = dx;
  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(tipX + dx * sz + perpX * sz * 0.4, tipY + dy * sz + perpY * sz * 0.4);
  ctx.lineTo(tipX + dx * sz - perpX * sz * 0.4, tipY + dy * sz - perpY * sz * 0.4);
  ctx.closePath();
  ctx.fillStyle = textColor;
  ctx.fill();
  ctx.stroke();

  // Peil value text to the right of the marker
  const textX = end.x + dx * (sz * 1.5 + bubbleRadius * 0.3);
  const textY = end.y + dy * (sz * 1.5 + bubbleRadius * 0.3);

  ctx.save();
  ctx.fillStyle = textColor;
  ctx.font = `${fontSize}px ${CAD_DEFAULT_FONT}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';

  let displayText = label;
  if (renderCtx.seaLevelDatum !== 0) {
    const napElevationMM = (renderCtx.seaLevelDatum * 1000) + shape.elevation;
    const napPrecision = napElevationMM === Math.round(napElevationMM / 1000) * 1000 ? 1 : 2;
    const napStr = formatElevation(napElevationMM, renderCtx.unitSettings.numberFormat, napPrecision);
    displayText = `${label}  (NAP ${napStr} m)`;
  }
  ctx.fillText(displayText, textX, textY);

  if (shape.description) {
    const descFontSize = fontSize * 0.8;
    ctx.font = `${descFontSize}px ${CAD_DEFAULT_FONT}`;
    ctx.textBaseline = 'top';
    ctx.fillText(shape.description, textX, textY + fontSize * 0.1);
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Puntniveau
// ---------------------------------------------------------------------------

function drawPuntniveau(renderCtx: ShapeRenderContext, shape: PuntniveauShape, _invertColors: boolean): void {
  const ctx = renderCtx.ctx;
  const { points } = shape;

  if (points.length < 3) return;

  let strokeColor = shape.style.strokeColor;
  if (_invertColors && strokeColor === '#ffffff') {
    strokeColor = '#000000';
  }

  ctx.save();
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = renderCtx.getLineWidth(shape.style.strokeWidth);
  ctx.setLineDash(renderCtx.getLineDash('dashed'));
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Pile
// ---------------------------------------------------------------------------

/** Draw the outer contour shape for a pile symbol */
function drawPileContour(renderCtx: ShapeRenderContext, cx: number, cy: number, radius: number, contourType: string): void {
  const ctx = renderCtx.ctx;
  switch (contourType) {
    case 'circle':
      break;

    case 'square':
      break;

    case 'diamond': {
      const d = radius * 1.3;
      ctx.beginPath();
      ctx.moveTo(cx, cy - d);
      ctx.lineTo(cx + d, cy);
      ctx.lineTo(cx, cy + d);
      ctx.lineTo(cx - d, cy);
      ctx.closePath();
      ctx.stroke();
      break;
    }

    case 'diamond-circle': {
      const d = radius * 1.3;
      ctx.beginPath();
      ctx.moveTo(cx, cy - d);
      ctx.lineTo(cx + d, cy);
      ctx.lineTo(cx, cy + d);
      ctx.lineTo(cx - d, cy);
      ctx.closePath();
      ctx.stroke();
      break;
    }

    case 'double-circle': {
      const outerR = radius * 1.3;
      ctx.beginPath();
      ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }

    case 'triangle-circle': {
      const tSize = radius * 1.3;
      const topY = cy - tSize * 0.7;
      const botY = cy + tSize * 0.9;
      const halfBase = tSize * 0.95;
      ctx.beginPath();
      ctx.moveTo(cx - halfBase, topY);
      ctx.lineTo(cx + halfBase, topY);
      ctx.lineTo(cx, botY);
      ctx.closePath();
      ctx.stroke();
      break;
    }

    case 'octagon': {
      const octR = radius * 1.2;
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const angle = (Math.PI * 2 * i) / 8 - Math.PI / 8;
        const px = cx + octR * Math.cos(angle);
        const py = cy + octR * Math.sin(angle);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();
      break;
    }

    default:
      break;
  }
}

/** Draw a fill pattern inside the pile circle */
function drawPileFillPattern(renderCtx: ShapeRenderContext, cx: number, cy: number, R: number, pattern: number, contourType: string = 'circle'): void {
  const ctx = renderCtx.ctx;
  const fillColor = ctx.strokeStyle as string;
  const isSquare = contourType === 'square';

  const applyClip = () => {
    ctx.beginPath();
    if (isSquare) {
      ctx.rect(cx - R, cy - R, R * 2, R * 2);
    } else {
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
    }
    ctx.clip();
  };

  const pieSlicePath = (startDeg: number, endDeg: number) => {
    const toRad = (d: number) => (d * Math.PI) / 180;
    const x1 = cx + R * Math.cos(toRad(startDeg));
    const y1 = cy + R * Math.sin(toRad(startDeg));
    ctx.moveTo(cx, cy);
    ctx.lineTo(x1, y1);
    ctx.arc(cx, cy, R, toRad(startDeg), toRad(endDeg), false);
    ctx.lineTo(cx, cy);
  };

  const fillSlices = (slices: [number, number][]) => {
    ctx.save();
    applyClip();
    ctx.fillStyle = fillColor;
    ctx.beginPath();
    for (const [start, end] of slices) {
      pieSlicePath(start, end);
    }
    ctx.fill();
    ctx.restore();
  };

  const fillPolygonClipped = (points: [number, number][]) => {
    ctx.save();
    applyClip();
    ctx.fillStyle = fillColor;
    ctx.beginPath();
    for (let i = 0; i < points.length; i++) {
      if (i === 0) ctx.moveTo(points[i][0], points[i][1]);
      else ctx.lineTo(points[i][0], points[i][1]);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  };

  const fillRectClipped = (rx: number, ry: number, rw: number, rh: number) => {
    ctx.save();
    applyClip();
    ctx.fillStyle = fillColor;
    ctx.fillRect(rx, ry, rw, rh);
    ctx.restore();
  };

  switch (pattern) {
    case 1:
      fillSlices([[180, 270]]);
      break;

    case 2:
      fillSlices([[180, 360]]);
      break;

    case 3:
      fillSlices([[180, 270], [0, 90]]);
      break;

    case 4:
      ctx.save();
      ctx.fillStyle = fillColor;
      ctx.beginPath();
      if (isSquare) {
        ctx.rect(cx - R, cy - R, R * 2, R * 2);
      } else {
        ctx.arc(cx, cy, R, 0, Math.PI * 2);
      }
      ctx.fill();
      ctx.restore();
      break;

    case 5:
      fillSlices([[90, 360]]);
      break;

    case 6:
      break;

    case 7:
      fillSlices([[90, 270]]);
      break;

    case 8: {
      const stripW = R * 0.6;
      fillRectClipped(cx - stripW / 2, cy - R, stripW, R * 2);
      break;
    }

    case 9:
      fillSlices([[0, 90]]);
      break;

    case 10: {
      const stripW = R * 0.3;
      const gap = R * 0.15;
      fillRectClipped(cx - gap - stripW, cy - R, stripW, R * 2);
      fillRectClipped(cx + gap, cy - R, stripW, R * 2);
      break;
    }

    case 11:
      fillPolygonClipped([[cx, cy], [cx - R, cy], [cx, cy - R]]);
      break;

    case 12:
      fillPolygonClipped([[cx - R, cy - R], [cx, cy], [cx - R, cy + R]]);
      fillPolygonClipped([[cx + R, cy - R], [cx, cy], [cx + R, cy + R]]);
      break;

    case 13:
      fillPolygonClipped([[cx, cy], [cx - R * 0.5, cy - R], [cx + R * 0.5, cy - R]]);
      break;

    case 14:
      fillSlices([[270, 450]]);
      break;

    case 15:
      fillSlices([[0, 180]]);
      break;

    case 16:
      fillPolygonClipped([[cx, cy], [cx - R, cy], [cx, cy + R]]);
      break;

    case 17:
      fillSlices([[270, 450]]);
      break;

    case 18:
      fillSlices([[270, 360]]);
      break;

    case 19:
      fillSlices([[90, 180]]);
      break;

    default:
      break;
  }
}

/** Draw a pile shape using contourType + fillPattern */
function drawPile(renderCtx: ShapeRenderContext, shape: PileShape, invertColors: boolean): void {
  const ctx = renderCtx.ctx;
  const { position, diameter, label, fontSize } = shape;
  const radius = diameter / 2;
  const cx = position.x;
  const cy = position.y;
  const contourType = shape.contourType ?? 'circle';
  const fillPattern = shape.fillPattern ?? 6;

  drawPileFillPattern(renderCtx, cx, cy, radius, fillPattern, contourType);

  if (contourType === 'square') {
    ctx.beginPath();
    ctx.rect(cx - radius, cy - radius, radius * 2, radius * 2);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();

    drawPileContour(renderCtx, cx, cy, radius, contourType);
  }

  const outerExtent = contourType === 'circle' ? radius : contourType === 'square' ? radius : radius * 1.3;
  const crossExt = outerExtent * 1.25;
  ctx.beginPath();
  ctx.moveTo(cx - crossExt, cy);
  ctx.lineTo(cx + crossExt, cy);
  ctx.moveTo(cx, cy - crossExt);
  ctx.lineTo(cx, cy + crossExt);
  ctx.stroke();

  if (label) {
    let textColor = shape.style.strokeColor;
    if (invertColors && textColor === '#ffffff') {
      textColor = '#000000';
    }
    ctx.save();
    ctx.fillStyle = textColor;
    ctx.font = `${fontSize}px ${CAD_DEFAULT_FONT}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(label, cx + radius + fontSize * 0.2, cy - radius);
    ctx.restore();
  }
}

/**
 * Draw a pile preview symbol at given position (used during placement).
 * Exported so previewRenderers.ts can use it.
 */
export function drawPilePreviewSymbol(
  renderCtx: ShapeRenderContext,
  cx: number,
  cy: number,
  radius: number,
  contourType: string,
  fillPattern: number,
  label: string,
  fontSize: number,
): void {
  const ctx = renderCtx.ctx;

  drawPileFillPattern(renderCtx, cx, cy, radius, fillPattern, contourType);

  if (contourType === 'square') {
    ctx.beginPath();
    ctx.rect(cx - radius, cy - radius, radius * 2, radius * 2);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();

    drawPileContour(renderCtx, cx, cy, radius, contourType);
  }

  const outerExtent = contourType === 'circle' ? radius : contourType === 'square' ? radius : radius * 1.3;
  const crossExt = outerExtent * 1.25;
  ctx.beginPath();
  ctx.moveTo(cx - crossExt, cy);
  ctx.lineTo(cx + crossExt, cy);
  ctx.moveTo(cx, cy - crossExt);
  ctx.lineTo(cx, cy + crossExt);
  ctx.stroke();

  if (label) {
    ctx.save();
    ctx.fillStyle = ctx.strokeStyle as string;
    ctx.font = `${fontSize}px ${CAD_DEFAULT_FONT}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(label, cx + radius + fontSize * 0.2, cy - radius);
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------
// CPT
// ---------------------------------------------------------------------------

function drawCPT(renderCtx: ShapeRenderContext, shape: CPTShape, invertColors: boolean): void {
  const ctx = renderCtx.ctx;
  const { position, name, fontSize, markerSize } = shape;
  const sf = LINE_DASH_REFERENCE_SCALE / renderCtx.drawingScale;
  const ms = (markerSize || 300) * sf;

  ctx.beginPath();
  ctx.moveTo(position.x, position.y + ms * 0.6);
  ctx.lineTo(position.x - ms * 0.5, position.y - ms * 0.4);
  ctx.lineTo(position.x + ms * 0.5, position.y - ms * 0.4);
  ctx.closePath();
  ctx.stroke();

  if (shape.uitgevoerd) {
    ctx.save();
    ctx.fillStyle = '#000000';
    ctx.fill();
    ctx.restore();
  }

  let textColor = shape.style.strokeColor;
  if (invertColors && textColor === '#ffffff') {
    textColor = '#000000';
  }

  const labelFontSize = fontSize * sf;
  let labelY = position.y + ms * 0.6 + labelFontSize * 0.3;
  if (name) {
    ctx.save();
    ctx.fillStyle = textColor;
    ctx.font = `${labelFontSize}px ${CAD_DEFAULT_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(name, position.x, labelY);
    ctx.restore();
    labelY += labelFontSize * 1.2;
  }

  if (shape.kleefmeting) {
    const lineGap = ms * 0.08;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(position.x - ms * 0.5, position.y + ms * 0.6 + lineGap);
    ctx.lineTo(position.x + ms * 0.5, position.y + ms * 0.6 + lineGap);
    ctx.stroke();
    ctx.restore();
  }

  if (shape.waterspanning) {
    const tagFontSize = labelFontSize * 0.75;
    ctx.save();
    ctx.font = `${tagFontSize}px ${CAD_DEFAULT_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = invertColors ? '#555555' : '#aaaaaa';
    ctx.fillText('W', position.x, labelY);
    ctx.restore();
  }

  // Draw depth/qc profile graph when CPT data is present
  if (shape.cptData && shape.cptData.depth.length > 0) {
    drawCPTProfileGraph(ctx, shape, sf, invertColors);
  }
}

/**
 * Draw a mini depth/qc (and optionally fs) profile graph next to the CPT marker.
 *
 * The graph is drawn to the right of the marker position:
 * - Y axis = depth (increasing downward)
 * - X axis = cone resistance qc (MPa), with optional fs overlay
 * - Includes axis labels and a depth scale
 */
function drawCPTProfileGraph(
  ctx: CanvasRenderingContext2D,
  shape: CPTShape,
  sf: number,
  invertColors: boolean,
): void {
  const data = shape.cptData!;
  const { position, markerSize } = shape;
  const ms = (markerSize || 300) * sf;

  // Graph dimensions in drawing units (scaled)
  const graphWidth = ms * 3;
  const graphHeight = ms * 5;
  const graphLeft = position.x + ms * 0.8;
  const graphTop = position.y - ms * 0.4;
  const graphRight = graphLeft + graphWidth;
  const graphBottom = graphTop + graphHeight;

  // Data ranges
  const minDepth = Math.min(...data.depth);
  const maxDepth = Math.max(...data.depth);
  const maxQc = Math.max(...data.qc);
  const maxFs = data.fs.length > 0 ? Math.max(...data.fs) : 0;
  const rfArray = data.rf as number[] | undefined;
  const maxRf = rfArray && rfArray.length > 0 ? Math.max(...rfArray) : 0;
  const depthRange = maxDepth - minDepth || 1;
  const qcRange = maxQc || 1;
  const rfRange = maxRf || 1;

  // Mapping functions
  const mapDepthToY = (d: number) => graphTop + ((d - minDepth) / depthRange) * graphHeight;
  const mapQcToX = (q: number) => graphLeft + (q / qcRange) * graphWidth;
  const mapFsToX = (f: number) => graphLeft + (f / qcRange) * graphWidth;
  const mapRfToX = (r: number) => graphLeft + (r / rfRange) * graphWidth;

  const lineWidth = ms * 0.02;
  const axisColor = invertColors ? '#666666' : '#888888';
  const qcColor = invertColors ? '#0055aa' : '#4499ff';
  const fsColor = invertColors ? '#aa5500' : '#ff9944';
  const rfColor = invertColors ? '#008844' : '#44cc88';

  ctx.save();

  // Draw graph background (semi-transparent)
  ctx.fillStyle = invertColors ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
  ctx.fillRect(graphLeft, graphTop, graphWidth, graphHeight);

  // Draw axes
  ctx.strokeStyle = axisColor;
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  // Y axis (left edge)
  ctx.moveTo(graphLeft, graphTop);
  ctx.lineTo(graphLeft, graphBottom);
  // X axis (top edge)
  ctx.moveTo(graphLeft, graphTop);
  ctx.lineTo(graphRight, graphTop);
  ctx.stroke();

  // Draw depth grid lines and labels
  const axisFontSize = ms * 0.2;
  ctx.font = `${axisFontSize}px ${CAD_DEFAULT_FONT}`;
  ctx.fillStyle = axisColor;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'right';

  const depthStep = depthRange > 20 ? 5 : depthRange > 10 ? 2 : 1;
  const firstDepthTick = Math.ceil(minDepth / depthStep) * depthStep;
  for (let d = firstDepthTick; d <= maxDepth; d += depthStep) {
    const y = mapDepthToY(d);
    ctx.beginPath();
    ctx.setLineDash([lineWidth * 2, lineWidth * 4]);
    ctx.moveTo(graphLeft, y);
    ctx.lineTo(graphRight, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillText(`${d.toFixed(0)}`, graphLeft - ms * 0.1, y);
  }

  // Draw qc scale label at top
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillStyle = qcColor;
  ctx.fillText(`qc (${maxQc.toFixed(0)} MPa)`, graphLeft + graphWidth / 2, graphTop - ms * 0.05);

  // Draw depth axis label
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  ctx.fillStyle = axisColor;
  ctx.fillText('depth (m)', graphLeft - ms * 0.1, graphTop);

  // Draw qc profile line
  ctx.strokeStyle = qcColor;
  ctx.lineWidth = lineWidth * 1.5;
  ctx.beginPath();
  let started = false;
  for (let i = 0; i < data.depth.length; i++) {
    const x = mapQcToX(data.qc[i]);
    const y = mapDepthToY(data.depth[i]);
    if (!started) {
      ctx.moveTo(x, y);
      started = true;
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.stroke();

  // Draw fs profile line (if data has meaningful fs values)
  if (maxFs > 0) {
    ctx.strokeStyle = fsColor;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    started = false;
    for (let i = 0; i < data.depth.length; i++) {
      if (i >= data.fs.length) break;
      const x = mapFsToX(data.fs[i]);
      const y = mapDepthToY(data.depth[i]);
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();

    // fs legend
    ctx.fillStyle = fsColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('fs', graphRight + ms * 0.15, graphTop - ms * 0.05);
  }

  // Draw rf (friction ratio) profile line if data has meaningful rf values
  if (rfArray && maxRf > 0) {
    ctx.strokeStyle = rfColor;
    ctx.lineWidth = lineWidth;
    ctx.setLineDash([lineWidth * 3, lineWidth * 2]);
    ctx.beginPath();
    started = false;
    for (let i = 0; i < data.depth.length; i++) {
      if (i >= rfArray.length) break;
      const x = mapRfToX(rfArray[i]);
      const y = mapDepthToY(data.depth[i]);
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // rf legend
    ctx.fillStyle = rfColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(`Rf (${maxRf.toFixed(1)}%)`, graphRight + ms * 0.15, graphTop + axisFontSize * 1.2);
  }

  // Source file label at bottom
  if (data.sourceFile) {
    ctx.fillStyle = axisColor;
    ctx.font = `${axisFontSize * 0.8}px ${CAD_DEFAULT_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(data.sourceFile, graphLeft + graphWidth / 2, graphBottom + ms * 0.1);
  }

  ctx.restore();
}

// ---------------------------------------------------------------------------
// Foundation zone
// ---------------------------------------------------------------------------

function drawFoundationZone(renderCtx: ShapeRenderContext, shape: FoundationZoneShape, _invertColors: boolean): void {
  const ctx = renderCtx.ctx;
  const { contourPoints, fillColor, fillOpacity } = shape;
  if (contourPoints.length < 3) return;

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(contourPoints[0].x, contourPoints[0].y);
  for (let i = 1; i < contourPoints.length; i++) {
    ctx.lineTo(contourPoints[i].x, contourPoints[i].y);
  }
  ctx.closePath();

  const opacity = fillOpacity ?? 0.15;
  const color = fillColor || '#4488ff';
  ctx.fillStyle = color;
  ctx.globalAlpha = opacity;
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.setLineDash([50, 30]);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Spot elevation
// ---------------------------------------------------------------------------

function drawSpotElevation(renderCtx: ShapeRenderContext, shape: SpotElevationShape, invertColors: boolean): void {
  const ctx = renderCtx.ctx;
  const { position, elevation, labelPosition, showLeader, fontSize: rawFontSize, markerSize: rawMarkerSize } = shape;

  const scaleFactor = LINE_DASH_REFERENCE_SCALE / renderCtx.drawingScale;
  const markerSize = rawMarkerSize * scaleFactor;
  const fontSize = rawFontSize * scaleFactor;

  let textColor = shape.style.strokeColor;
  if (invertColors && textColor === '#ffffff') {
    textColor = '#000000';
  }

  ctx.beginPath();
  ctx.moveTo(position.x - markerSize, position.y);
  ctx.lineTo(position.x + markerSize, position.y);
  ctx.moveTo(position.x, position.y - markerSize);
  ctx.lineTo(position.x, position.y + markerSize);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(position.x, position.y, markerSize * 0.8, 0, Math.PI * 2);
  ctx.stroke();

  if (showLeader) {
    ctx.beginPath();
    ctx.moveTo(position.x, position.y);
    ctx.lineTo(labelPosition.x, labelPosition.y);
    ctx.stroke();
  }

  const label = formatElevation(elevation, renderCtx.unitSettings.numberFormat, 3);
  ctx.save();
  ctx.fillStyle = textColor;
  ctx.font = `${fontSize}px ${CAD_DEFAULT_FONT}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  ctx.fillText(label, labelPosition.x + markerSize * 0.3, labelPosition.y);
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Wall
// ---------------------------------------------------------------------------

/** Draw an arc wall shape (curved wall using bulge factor) */
function drawArcWall(renderCtx: ShapeRenderContext, shape: WallShape, invertColors: boolean): void {
  const ctx = renderCtx.ctx;
  const { start, end, thickness, showCenterline, justification } = shape;
  const bulge = shape.bulge!;

  const { center, radius, startAngle, endAngle, clockwise } = bulgeToArc(start, end, bulge);

  let innerR: number;
  let outerR: number;
  if (justification === 'left') {
    // "Left justified" = left face on draw line, wall extends to the right.
    // For arcs: right side is inward when center is to the right (!clockwise),
    // outward when center is to the left (clockwise).
    if (clockwise) {
      innerR = radius;
      outerR = radius + thickness;
    } else {
      innerR = radius - thickness;
      outerR = radius;
    }
  } else if (justification === 'right') {
    // "Right justified" = right face on draw line, wall extends to the left.
    if (clockwise) {
      innerR = radius - thickness;
      outerR = radius;
    } else {
      innerR = radius;
      outerR = radius + thickness;
    }
  } else {
    innerR = radius - thickness / 2;
    outerR = radius + thickness / 2;
  }
  if (innerR < 0) innerR = 0;

  const hasStartMiter = shape.startCap === 'miter';
  const hasEndMiter = shape.endCap === 'miter';

  const buildArcPath = () => {
    ctx.beginPath();
    ctx.arc(center.x, center.y, outerR, startAngle, endAngle, clockwise);
    ctx.lineTo(center.x + innerR * Math.cos(endAngle), center.y + innerR * Math.sin(endAngle));
    ctx.arc(center.x, center.y, innerR, endAngle, startAngle, !clockwise);
    ctx.closePath();
  };

  // Outer arc
  ctx.beginPath();
  ctx.arc(center.x, center.y, outerR, startAngle, endAngle, clockwise);
  ctx.stroke();

  // End cap
  if (!hasEndMiter) {
    ctx.beginPath();
    ctx.moveTo(center.x + outerR * Math.cos(endAngle), center.y + outerR * Math.sin(endAngle));
    ctx.lineTo(center.x + innerR * Math.cos(endAngle), center.y + innerR * Math.sin(endAngle));
    ctx.stroke();
  }

  // Inner arc
  ctx.beginPath();
  ctx.arc(center.x, center.y, innerR, endAngle, startAngle, !clockwise);
  ctx.stroke();

  // Start cap
  if (!hasStartMiter) {
    ctx.beginPath();
    ctx.moveTo(center.x + innerR * Math.cos(startAngle), center.y + innerR * Math.sin(startAngle));
    ctx.lineTo(center.x + outerR * Math.cos(startAngle), center.y + outerR * Math.sin(startAngle));
    ctx.stroke();
  }

  // Resolve hatch
  let effectiveHatchType: string = shape.hatchType || 'none';
  let effectiveHatchSpacing: number = shape.hatchSpacing || 50;
  let effectiveHatchColor: string | undefined = shape.hatchColor;
  let effectiveBackgroundColor: string | undefined;
  let effectivePatternId: string | undefined;

  if (shape.wallTypeId) {
    const wallType = renderCtx.wallTypes.find(wt => wt.id === shape.wallTypeId);
    if (wallType) {
      const matSetting = renderCtx.materialHatchSettings[wallType.name]
        || renderCtx.materialHatchSettings[wallType.material]
        || DEFAULT_MATERIAL_HATCH_SETTINGS[wallType.material];
      if (matSetting) {
        effectiveHatchType = matSetting.hatchType;
        effectiveHatchSpacing = matSetting.hatchSpacing;
        effectiveHatchColor = matSetting.hatchColor;
        effectivePatternId = matSetting.hatchPatternId;
        effectiveBackgroundColor = matSetting.backgroundColor;
      }
    }
  }

  // Hatch fill
  if ((effectiveHatchType && effectiveHatchType !== 'none') || effectivePatternId) {
    const strokeWidth = ctx.lineWidth;
    ctx.save();

    buildArcPath();
    ctx.clip();

    if (effectiveBackgroundColor) {
      ctx.fillStyle = effectiveBackgroundColor;
      buildArcPath();
      ctx.fill();
    }

    const hatchColor = effectiveHatchColor || ctx.strokeStyle;
    const spacing = effectiveHatchSpacing || 50;
    ctx.strokeStyle = hatchColor as string;
    ctx.lineWidth = strokeWidth * 0.5;
    ctx.setLineDash([]);

    const customPattern = effectivePatternId ? renderCtx.getPatternById(effectivePatternId) : undefined;
    if (customPattern && customPattern.lineFamilies.length > 0) {
      const bboxPad = outerR;
      const minX = center.x - bboxPad;
      const minY = center.y - bboxPad;
      const maxX = center.x + bboxPad;
      const maxY = center.y + bboxPad;
      const patternScale = spacing / 10;
      if (effectivePatternId === 'nen47-isolatie' || effectivePatternId === 'insulation') {
        renderCtx.drawInsulationZigzagArc(
          center, innerR, outerR,
          startAngle, endAngle, clockwise,
          hatchColor as string,
          strokeWidth,
        );
      } else {
        renderCtx.drawCustomPatternLines(
          customPattern.lineFamilies,
          minX, minY, maxX, maxY,
          patternScale,
          0,
          hatchColor as string,
          strokeWidth,
        );
      }
    } else if (customPattern && customPattern.lineFamilies.length === 0) {
      ctx.fillStyle = hatchColor as string;
      buildArcPath();
      ctx.fill();
    } else if (effectiveHatchType === 'solid') {
      ctx.fillStyle = hatchColor as string;
      buildArcPath();
      ctx.fill();
    } else {
      const angularStep = spacing / radius;
      const step = clockwise ? -angularStep : angularStep;
      const isInRange = (angle: number) => {
        if (!clockwise) {
          let normalizedAngle = angle - startAngle;
          let normalizedEnd = endAngle - startAngle;
          if (normalizedEnd < 0) normalizedEnd += Math.PI * 2;
          if (normalizedAngle < 0) normalizedAngle += Math.PI * 2;
          return normalizedAngle <= normalizedEnd + 0.0001;
        } else {
          let normalizedAngle = startAngle - angle;
          let normalizedEnd = startAngle - endAngle;
          if (normalizedEnd < 0) normalizedEnd += Math.PI * 2;
          if (normalizedAngle < 0) normalizedAngle += Math.PI * 2;
          return normalizedAngle <= normalizedEnd + 0.0001;
        }
      };

      ctx.beginPath();
      let a = startAngle + step;
      for (let i = 0; i < 10000; i++) {
        if (!isInRange(a)) break;
        ctx.moveTo(center.x + innerR * Math.cos(a), center.y + innerR * Math.sin(a));
        ctx.lineTo(center.x + outerR * Math.cos(a), center.y + outerR * Math.sin(a));
        a += step;
      }
      ctx.stroke();
    }

    ctx.restore();
  }

  // Draw dashed centerline arc
  if (showCenterline) {
    const origLineWidth = ctx.lineWidth;
    ctx.save();
    ctx.setLineDash(renderCtx.getLineDash('dashdot'));
    let centerColor = 'rgba(255, 255, 255, 0.4)';
    if (invertColors) {
      centerColor = 'rgba(0, 0, 0, 0.4)';
    }
    ctx.strokeStyle = centerColor;
    ctx.lineWidth = origLineWidth * 0.5;
    ctx.beginPath();
    ctx.arc(center.x, center.y, radius, startAngle, endAngle, clockwise);
    ctx.stroke();
    ctx.restore();
  }
}

/** Draw a wall with a multi-layered wall system */
function drawWallSystem(renderCtx: ShapeRenderContext, shape: WallShape, system: WallSystemType, invertColors: boolean): void {
  const ctx = renderCtx.ctx;
  const { start, end, showCenterline } = shape;

  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const wallAngle = Math.atan2(dy, dx);
  const wallLength = Math.sqrt(dx * dx + dy * dy);

  const perpX = Math.sin(wallAngle);
  const perpY = -Math.cos(wallAngle);
  const dirX = Math.cos(wallAngle);
  const dirY = Math.sin(wallAngle);

  const layers = calculateLayerOffsets(system);
  const totalThickness = layers.reduce((sum, l) => sum + l.thickness, 0);
  const halfTotal = totalThickness / 2;

  const strokeWidth = ctx.lineWidth;

  // Draw layers as colored bands
  let accumulatedOffset = -halfTotal;
  for (const layer of layers) {
    const layerStart = accumulatedOffset;
    const layerEnd = accumulatedOffset + layer.thickness;
    accumulatedOffset = layerEnd;

    if (layer.thickness < 1 && renderCtx.currentZoom < 0.5) continue;

    const sl = { x: start.x + perpX * layerStart, y: start.y + perpY * layerStart };
    const sr = { x: start.x + perpX * layerEnd, y: start.y + perpY * layerEnd };
    const el = { x: end.x + perpX * layerStart, y: end.y + perpY * layerStart };
    const er = { x: end.x + perpX * layerEnd, y: end.y + perpY * layerEnd };

    ctx.save();
    ctx.fillStyle = invertColors ? '#ffffff' : layer.color;
    ctx.globalAlpha = layer.function === 'air-gap' ? 0.15 : 0.5;
    ctx.beginPath();
    ctx.moveTo(sl.x, sl.y);
    ctx.lineTo(el.x, el.y);
    ctx.lineTo(er.x, er.y);
    ctx.lineTo(sr.x, sr.y);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();

    ctx.beginPath();
    ctx.moveTo(sl.x, sl.y);
    ctx.lineTo(el.x, el.y);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(sr.x, sr.y);
    ctx.lineTo(er.x, er.y);
    ctx.stroke();
  }

  // End caps
  const outerStart1 = { x: start.x + perpX * (-halfTotal), y: start.y + perpY * (-halfTotal) };
  const outerStart2 = { x: start.x + perpX * halfTotal, y: start.y + perpY * halfTotal };
  const outerEnd1 = { x: end.x + perpX * (-halfTotal), y: end.y + perpY * (-halfTotal) };
  const outerEnd2 = { x: end.x + perpX * halfTotal, y: end.y + perpY * halfTotal };

  // Always draw end caps (closed outline)
  ctx.beginPath();
  ctx.moveTo(outerStart1.x, outerStart1.y);
  ctx.lineTo(outerStart2.x, outerStart2.y);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(outerEnd1.x, outerEnd1.y);
  ctx.lineTo(outerEnd2.x, outerEnd2.y);
  ctx.stroke();

  // Draw studs at grid positions
  const gridData = generateWallSystemGrid(shape, system);

  const structuralLayer = layers.find(l => l.function === 'structure');
  const structStart = structuralLayer ? structuralLayer.offset - structuralLayer.thickness / 2 : -halfTotal;
  const structEnd = structuralLayer ? structuralLayer.offset + structuralLayer.thickness / 2 : halfTotal;

  for (const studPos of gridData.studs) {
    if (studPos.positionAlongWall <= 0 || studPos.positionAlongWall >= wallLength) continue;

    const stud = studPos.stud;
    const halfW = stud.width / 2;

    const scx = studPos.worldPosition.x;
    const scy = studPos.worldPosition.y;

    const studPerpStart = structStart;
    const studPerpEnd = structEnd;

    const c1 = { x: scx - dirX * halfW + perpX * studPerpStart, y: scy - dirY * halfW + perpY * studPerpStart };
    const c2 = { x: scx + dirX * halfW + perpX * studPerpStart, y: scy + dirY * halfW + perpY * studPerpStart };
    const c3 = { x: scx + dirX * halfW + perpX * studPerpEnd, y: scy + dirY * halfW + perpY * studPerpEnd };
    const c4 = { x: scx - dirX * halfW + perpX * studPerpEnd, y: scy - dirY * halfW + perpY * studPerpEnd };

    const isSelected = renderCtx.selectedWallSubElement?.wallId === shape.id
      && renderCtx.selectedWallSubElement?.type === 'stud'
      && renderCtx.selectedWallSubElement?.key === studPos.key;

    ctx.save();
    ctx.fillStyle = isSelected ? '#00ff88' : (invertColors ? '#333333' : stud.color);
    ctx.globalAlpha = isSelected ? 0.7 : 0.6;
    ctx.beginPath();
    ctx.moveTo(c1.x, c1.y);
    ctx.lineTo(c2.x, c2.y);
    ctx.lineTo(c3.x, c3.y);
    ctx.lineTo(c4.x, c4.y);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.strokeStyle = isSelected ? '#00ff88' : ctx.strokeStyle;
    ctx.lineWidth = strokeWidth * 0.5;
    ctx.stroke();
    ctx.restore();
  }

  // Panel highlights for selected panels
  if (renderCtx.selectedWallSubElement?.wallId === shape.id && renderCtx.selectedWallSubElement?.type === 'panel') {
    for (const panelPos of gridData.panels) {
      if (panelPos.key !== renderCtx.selectedWallSubElement.key) continue;

      const halfLen = (panelPos.endAlongWall - panelPos.startAlongWall) / 2;
      const pcx = panelPos.worldCenter.x;
      const pcy = panelPos.worldCenter.y;

      const c1 = { x: pcx - dirX * halfLen + perpX * structStart, y: pcy - dirY * halfLen + perpY * structStart };
      const c2 = { x: pcx + dirX * halfLen + perpX * structStart, y: pcy + dirY * halfLen + perpY * structStart };
      const c3 = { x: pcx + dirX * halfLen + perpX * structEnd, y: pcy + dirY * halfLen + perpY * structEnd };
      const c4 = { x: pcx - dirX * halfLen + perpX * structEnd, y: pcy - dirY * halfLen + perpY * structEnd };

      ctx.save();
      ctx.fillStyle = '#00ff88';
      ctx.globalAlpha = 0.3;
      ctx.beginPath();
      ctx.moveTo(c1.x, c1.y);
      ctx.lineTo(c2.x, c2.y);
      ctx.lineTo(c3.x, c3.y);
      ctx.lineTo(c4.x, c4.y);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#00ff88';
      ctx.lineWidth = strokeWidth * 0.8;
      ctx.stroke();
      ctx.restore();
    }
  }

  // Draw openings
  if (shape.wallSystemOpenings) {
    for (const opening of shape.wallSystemOpenings) {
      const openingPos = opening.positionType === 'fraction'
        ? opening.position * wallLength
        : opening.position;
      const halfOpenW = opening.width / 2;

      const o1 = {
        x: start.x + dirX * (openingPos - halfOpenW) + perpX * (-halfTotal),
        y: start.y + dirY * (openingPos - halfOpenW) + perpY * (-halfTotal),
      };
      const o2 = {
        x: start.x + dirX * (openingPos + halfOpenW) + perpX * (-halfTotal),
        y: start.y + dirY * (openingPos + halfOpenW) + perpY * (-halfTotal),
      };
      const o3 = {
        x: start.x + dirX * (openingPos + halfOpenW) + perpX * halfTotal,
        y: start.y + dirY * (openingPos + halfOpenW) + perpY * halfTotal,
      };
      const o4 = {
        x: start.x + dirX * (openingPos - halfOpenW) + perpX * halfTotal,
        y: start.y + dirY * (openingPos - halfOpenW) + perpY * halfTotal,
      };

      ctx.save();
      ctx.fillStyle = invertColors ? '#ffffff' : '#1a1a2e';
      ctx.beginPath();
      ctx.moveTo(o1.x, o1.y);
      ctx.lineTo(o2.x, o2.y);
      ctx.lineTo(o3.x, o3.y);
      ctx.lineTo(o4.x, o4.y);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = invertColors ? '#333333' : '#ffffff';
      ctx.lineWidth = strokeWidth * 0.5;
      ctx.beginPath();
      ctx.moveTo(o1.x, o1.y);
      ctx.lineTo(o4.x, o4.y);
      ctx.moveTo(o2.x, o2.y);
      ctx.lineTo(o3.x, o3.y);
      ctx.stroke();
      ctx.restore();
    }
  }

  // Draw centerline (dashed)
  if (showCenterline) {
    const origLineWidth = ctx.lineWidth;
    ctx.save();
    ctx.setLineDash(renderCtx.getLineDash('dashdot'));
    const centerColor = invertColors ? 'rgba(0, 0, 0, 0.4)' : 'rgba(255, 255, 255, 0.4)';
    ctx.strokeStyle = centerColor;
    ctx.lineWidth = origLineWidth * 0.5;
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
    ctx.restore();
  }
}

/** Draw a wall shape (rectangular plan view + optional centerline) */
function drawWall(renderCtx: ShapeRenderContext, shape: WallShape, invertColors: boolean): void {
  if (shape.bulge && Math.abs(shape.bulge) > 0.0001) {
    drawArcWall(renderCtx, shape, invertColors);
    return;
  }

  if (shape.wallSystemId) {
    const wallSystem = renderCtx.wallSystemTypes.find(ws => ws.id === shape.wallSystemId);
    if (wallSystem) {
      drawWallSystem(renderCtx, shape, wallSystem, invertColors);
      return;
    }
  }

  const ctx = renderCtx.ctx;
  const { start, end, showCenterline } = shape;

  const wallAngle = Math.atan2(end.y - start.y, end.x - start.x);

  const corners = computeWallCorners(shape);

  const hasStartMiter = shape.startCap === 'miter';
  const hasEndMiter = shape.endCap === 'miter';

  // Collect opening gaps along the wall (as fractions 0..1 of edge length)
  const allShapes = useAppStore.getState().shapes;
  const wallLen = Math.sqrt((end.x - start.x) ** 2 + (end.y - start.y) ** 2);
  const openingGaps: { t0: number; t1: number }[] = [];
  if (wallLen > 0.001) {
    const openings = allShapes.filter((s: any) => s.type === 'wall-opening' && s.hostWallId === shape.id);
    for (const opening of openings) {
      const wo = opening as any;
      const halfW = wo.width / 2;
      const t0 = Math.max(0, (wo.positionAlongWall - halfW) / wallLen);
      const t1 = Math.min(1, (wo.positionAlongWall + halfW) / wallLen);
      if (t1 > t0) openingGaps.push({ t0, t1 });
    }
    openingGaps.sort((a, b) => a.t0 - b.t0);
  }

  // Helper: draw a line between two corners, skipping opening gap intervals
  const drawEdgeWithGaps = (
    p0: { x: number; y: number },
    p1: { x: number; y: number },
    gaps: { t0: number; t1: number }[],
  ) => {
    if (gaps.length === 0) {
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.stroke();
      return;
    }
    let tCur = 0;
    for (const gap of gaps) {
      if (gap.t0 > tCur) {
        ctx.beginPath();
        ctx.moveTo(p0.x + (p1.x - p0.x) * tCur, p0.y + (p1.y - p0.y) * tCur);
        ctx.lineTo(p0.x + (p1.x - p0.x) * gap.t0, p0.y + (p1.y - p0.y) * gap.t0);
        ctx.stroke();
      }
      tCur = gap.t1;
    }
    if (tCur < 1) {
      ctx.beginPath();
      ctx.moveTo(p0.x + (p1.x - p0.x) * tCur, p0.y + (p1.y - p0.y) * tCur);
      ctx.lineTo(p1.x, p1.y);
      ctx.stroke();
    }
  };

  // Left side edge (corners[0] -> corners[1]) with opening gaps
  drawEdgeWithGaps(corners[0], corners[1], openingGaps);

  // End cap edge (always draw — corners already account for miter angle)
  ctx.beginPath();
  ctx.moveTo(corners[1].x, corners[1].y);
  ctx.lineTo(corners[2].x, corners[2].y);
  ctx.stroke();

  // Right side edge (corners[2] -> corners[3]) — reversed direction, so reverse gaps
  const reversedGaps = openingGaps.map(g => ({ t0: 1 - g.t1, t1: 1 - g.t0 })).sort((a, b) => a.t0 - b.t0);
  drawEdgeWithGaps(corners[2], corners[3], reversedGaps);

  // Start cap edge (always draw)
  ctx.beginPath();
  ctx.moveTo(corners[3].x, corners[3].y);
  ctx.lineTo(corners[0].x, corners[0].y);
  ctx.stroke();

  // Resolve hatch settings
  let effectiveHatchType: string = shape.hatchType || 'none';
  let effectiveHatchAngle: number = shape.hatchAngle || 45;
  let effectiveHatchSpacing: number = shape.hatchSpacing || 50;
  let effectiveHatchColor: string | undefined = shape.hatchColor;
  let effectivePatternId: string | undefined;
  let effectiveBackgroundColor: string | undefined;

  if (shape.wallTypeId) {
    const wallType = renderCtx.wallTypes.find(wt => wt.id === shape.wallTypeId);
    if (wallType) {
      const matSetting = renderCtx.materialHatchSettings[wallType.name]
        || renderCtx.materialHatchSettings[wallType.material]
        || DEFAULT_MATERIAL_HATCH_SETTINGS[wallType.material];
      if (matSetting) {
        effectiveHatchType = matSetting.hatchType;
        effectiveHatchAngle = matSetting.hatchAngle;
        effectiveHatchSpacing = matSetting.hatchSpacing;
        effectiveHatchColor = matSetting.hatchColor;
        effectivePatternId = matSetting.hatchPatternId;
        effectiveBackgroundColor = matSetting.backgroundColor;
      }
    }
  }

  // Hatch fill
  if ((effectiveHatchType && effectiveHatchType !== 'none') || effectivePatternId) {
    const strokeWidth = ctx.lineWidth;
    ctx.save();
    // Clip to wall polygon, excluding opening rectangles (evenodd rule)
    ctx.beginPath();
    ctx.moveTo(corners[0].x, corners[0].y);
    ctx.lineTo(corners[1].x, corners[1].y);
    ctx.lineTo(corners[2].x, corners[2].y);
    ctx.lineTo(corners[3].x, corners[3].y);
    ctx.closePath();
    // Cut out opening rectangles from the clip region
    if (openingGaps.length > 0 && wallLen > 0.001) {
      const hDirX = (end.x - start.x) / wallLen;
      const hDirY = (end.y - start.y) / wallLen;
      const hPerpX = -hDirY;
      const hPerpY = hDirX;
      let hLeftThick: number, hRightThick: number;
      if (shape.justification === 'left') { hLeftThick = 0; hRightThick = shape.thickness; }
      else if (shape.justification === 'right') { hLeftThick = shape.thickness; hRightThick = 0; }
      else { hLeftThick = shape.thickness / 2; hRightThick = shape.thickness / 2; }
      for (const gap of openingGaps) {
        const gStart = gap.t0 * wallLen;
        const gEnd = gap.t1 * wallLen;
        const oc0 = { x: start.x + hDirX * gStart + hPerpX * hLeftThick, y: start.y + hDirY * gStart + hPerpY * hLeftThick };
        const oc1 = { x: start.x + hDirX * gEnd + hPerpX * hLeftThick, y: start.y + hDirY * gEnd + hPerpY * hLeftThick };
        const oc2 = { x: start.x + hDirX * gEnd - hPerpX * hRightThick, y: start.y + hDirY * gEnd - hPerpY * hRightThick };
        const oc3 = { x: start.x + hDirX * gStart - hPerpX * hRightThick, y: start.y + hDirY * gStart - hPerpY * hRightThick };
        // Wind counter-clockwise (opposite to outer) for evenodd subtraction
        ctx.moveTo(oc0.x, oc0.y);
        ctx.lineTo(oc3.x, oc3.y);
        ctx.lineTo(oc2.x, oc2.y);
        ctx.lineTo(oc1.x, oc1.y);
        ctx.closePath();
      }
    }
    (ctx as any).clip('evenodd');

    if (effectiveBackgroundColor) {
      ctx.fillStyle = effectiveBackgroundColor;
      ctx.beginPath();
      ctx.moveTo(corners[0].x, corners[0].y);
      ctx.lineTo(corners[1].x, corners[1].y);
      ctx.lineTo(corners[2].x, corners[2].y);
      ctx.lineTo(corners[3].x, corners[3].y);
      ctx.closePath();
      ctx.fill();
    }

    const hatchColor = effectiveHatchColor || ctx.strokeStyle;
    const spacing = effectiveHatchSpacing || 50;
    ctx.strokeStyle = hatchColor as string;
    ctx.lineWidth = strokeWidth * 0.5;
    ctx.setLineDash([]);

    const minX = Math.min(...corners.map(c => c.x));
    const minY = Math.min(...corners.map(c => c.y));
    const maxX = Math.max(...corners.map(c => c.x));
    const maxY = Math.max(...corners.map(c => c.y));

    const wallAngleDeg = wallAngle * 180 / Math.PI;

    const customPattern = effectivePatternId ? renderCtx.getPatternById(effectivePatternId) : undefined;
    if (customPattern && customPattern.lineFamilies.length > 0) {
      if (effectivePatternId === 'nen47-isolatie' || effectivePatternId === 'insulation') {
        const patternScale = spacing / 10;
        renderCtx.drawInsulationZigzag(
          minX, minY, maxX, maxY,
          patternScale,
          wallAngleDeg,
          hatchColor as string,
          strokeWidth,
          shape.thickness,
        );
      } else {
        const patternScale = spacing / 10;
        renderCtx.drawCustomPatternLines(
          customPattern.lineFamilies,
          minX, minY, maxX, maxY,
          patternScale,
          wallAngleDeg,
          hatchColor as string,
          strokeWidth,
        );
      }
    } else if (customPattern && customPattern.lineFamilies.length === 0) {
      ctx.fillStyle = hatchColor as string;
      ctx.beginPath();
      ctx.moveTo(corners[0].x, corners[0].y);
      ctx.lineTo(corners[1].x, corners[1].y);
      ctx.lineTo(corners[2].x, corners[2].y);
      ctx.lineTo(corners[3].x, corners[3].y);
      ctx.closePath();
      ctx.fill();
    } else {
      const baseAngle = (effectiveHatchAngle || 45) + wallAngleDeg;

      if (effectiveHatchType === 'solid') {
        ctx.fillStyle = hatchColor as string;
        ctx.beginPath();
        ctx.moveTo(corners[0].x, corners[0].y);
        ctx.lineTo(corners[1].x, corners[1].y);
        ctx.lineTo(corners[2].x, corners[2].y);
        ctx.lineTo(corners[3].x, corners[3].y);
        ctx.closePath();
        ctx.fill();
      } else if (effectiveHatchType === 'diagonal') {
        renderCtx.drawLineFamilySimple(baseAngle, spacing, minX, minY, maxX, maxY);
      } else if (effectiveHatchType === 'crosshatch') {
        renderCtx.drawLineFamilySimple(baseAngle, spacing, minX, minY, maxX, maxY);
        renderCtx.drawLineFamilySimple(baseAngle + 90, spacing, minX, minY, maxX, maxY);
      } else if (effectiveHatchType === 'horizontal') {
        renderCtx.drawLineFamilySimple(wallAngleDeg + 90, spacing, minX, minY, maxX, maxY);
      }
    }

    ctx.restore();
  }

  // Draw centerline (dashed)
  if (showCenterline) {
    const origLineWidth = ctx.lineWidth;
    ctx.save();
    ctx.setLineDash(renderCtx.getLineDash('dashdot'));
    let centerColor = 'rgba(255, 255, 255, 0.4)';
    if (invertColors) {
      centerColor = 'rgba(0, 0, 0, 0.4)';
    }
    ctx.strokeStyle = centerColor;
    ctx.lineWidth = origLineWidth * 0.5;
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
    ctx.restore();
  }

  // (Opening gaps in wall edges are handled above via drawEdgeWithGaps)
}

// ---------------------------------------------------------------------------
// Wall Opening (hosted in a wall)
// ---------------------------------------------------------------------------

function drawWallOpening(renderCtx: ShapeRenderContext, shape: any, invertColors: boolean): void {
  const ctx = renderCtx.ctx;
  const wo = shape as { hostWallId: string; positionAlongWall: number; width: number; height: number; sillHeight: number; style: any };

  // Find the host wall
  const allShapes = useAppStore.getState().shapes;
  const hostWall = allShapes.find(s => s.id === wo.hostWallId) as WallShape | undefined;
  if (!hostWall) return;

  const dx = hostWall.end.x - hostWall.start.x;
  const dy = hostWall.end.y - hostWall.start.y;
  const wallLength = Math.sqrt(dx * dx + dy * dy);
  if (wallLength < 0.001) return;

  // Wall direction and perpendicular
  const dirX = dx / wallLength;
  const dirY = dy / wallLength;
  const perpX = -dirY;
  const perpY = dirX;

  // Half-thickness offsets based on wall justification
  let leftThick: number;
  let rightThick: number;
  if (hostWall.justification === 'left') {
    leftThick = 0;
    rightThick = hostWall.thickness;
  } else if (hostWall.justification === 'right') {
    leftThick = hostWall.thickness;
    rightThick = 0;
  } else {
    leftThick = hostWall.thickness / 2;
    rightThick = hostWall.thickness / 2;
  }

  // Opening corners along wall centerline
  const halfW = wo.width / 2;
  const startAlong = wo.positionAlongWall - halfW;
  const endAlong = wo.positionAlongWall + halfW;

  // Four corners of the opening rectangle (in world coordinates)
  const c0 = { x: hostWall.start.x + dirX * startAlong + perpX * leftThick, y: hostWall.start.y + dirY * startAlong + perpY * leftThick };
  const c1 = { x: hostWall.start.x + dirX * endAlong + perpX * leftThick, y: hostWall.start.y + dirY * endAlong + perpY * leftThick };
  const c2 = { x: hostWall.start.x + dirX * endAlong - perpX * rightThick, y: hostWall.start.y + dirY * endAlong - perpY * rightThick };
  const c3 = { x: hostWall.start.x + dirX * startAlong - perpX * rightThick, y: hostWall.start.y + dirY * startAlong - perpY * rightThick };

  let strokeColor = shape.style?.strokeColor || '#ffffff';
  if (invertColors && strokeColor === '#ffffff') strokeColor = '#000000';

  ctx.save();
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = shape.style?.strokeWidth || 1;
  ctx.setLineDash([]);

  // Draw outline rectangle
  ctx.beginPath();
  ctx.moveTo(c0.x, c0.y);
  ctx.lineTo(c1.x, c1.y);
  ctx.lineTo(c2.x, c2.y);
  ctx.lineTo(c3.x, c3.y);
  ctx.closePath();
  ctx.stroke();

  // Draw X (cross) inside
  ctx.beginPath();
  ctx.moveTo(c0.x, c0.y);
  ctx.lineTo(c2.x, c2.y);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(c1.x, c1.y);
  ctx.lineTo(c3.x, c3.y);
  ctx.stroke();

  ctx.restore();
}

// ---------------------------------------------------------------------------
// Slab
// ---------------------------------------------------------------------------

function drawSlab(renderCtx: ShapeRenderContext, shape: SlabShape, invertColors: boolean): void {
  const ctx = renderCtx.ctx;
  const { points } = shape;

  if (points.length < 3) return;

  const matSetting = renderCtx.materialHatchSettings[shape.material] || DEFAULT_MATERIAL_HATCH_SETTINGS[shape.material] || DEFAULT_MATERIAL_HATCH_SETTINGS.generic;
  const effectiveHatchType = matSetting.hatchType || 'none';
  const effectiveHatchAngle = matSetting.hatchAngle ?? 45;
  const effectiveHatchSpacing = matSetting.hatchSpacing || 100;
  const effectiveHatchColor = matSetting.hatchColor;
  const effectivePatternId = matSetting.hatchPatternId;
  const effectiveBackgroundColor = matSetting.backgroundColor;

  // Helper: trace the outer boundary and all inner contours into the current path
  // using evenodd fill rule so inner contours become holes
  const traceSlabPath = () => {
    ctx.beginPath();
    // Outer boundary (clockwise)
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.closePath();
    // Inner contours (holes)
    if (shape.innerContours) {
      for (const contour of shape.innerContours) {
        if (contour.length < 3) continue;
        ctx.moveTo(contour[0].x, contour[0].y);
        for (let i = 1; i < contour.length; i++) {
          ctx.lineTo(contour[i].x, contour[i].y);
        }
        ctx.closePath();
      }
    }
  };

  // Draw slab outline (outer boundary + inner contour outlines)
  traceSlabPath();
  ctx.stroke();

  // Hatch fill — skip when slab surface pattern is disabled (e.g. Structural Plan drawing standard)
  if (renderCtx.slabSurfacePatternEnabled !== false && ((effectiveHatchType && effectiveHatchType !== 'none') || effectivePatternId)) {
    const strokeWidth = ctx.lineWidth;
    ctx.save();

    // Clip to outer boundary minus inner contours using evenodd
    traceSlabPath();
    ctx.clip('evenodd');

    if (effectiveBackgroundColor) {
      ctx.fillStyle = effectiveBackgroundColor;
      ctx.fill();
    }

    let hatchColor: string | CanvasGradient | CanvasPattern = effectiveHatchColor || ctx.strokeStyle;
    if (invertColors && hatchColor === '#ffffff') {
      hatchColor = '#000000';
    }

    const spacing = effectiveHatchSpacing;
    ctx.strokeStyle = hatchColor;
    ctx.lineWidth = strokeWidth * 0.5;
    ctx.setLineDash([]);

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of points) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }

    const customPattern = effectivePatternId ? renderCtx.getPatternById(effectivePatternId) : undefined;
    if (customPattern && customPattern.lineFamilies.length > 0) {
      const patternScale = spacing / 10;
      if (effectivePatternId === 'nen47-isolatie' || effectivePatternId === 'insulation') {
        renderCtx.drawInsulationZigzag(
          minX, minY, maxX, maxY,
          patternScale,
          0,
          hatchColor as string,
          strokeWidth,
        );
      } else {
        renderCtx.drawCustomPatternLines(
          customPattern.lineFamilies,
          minX, minY, maxX, maxY,
          patternScale,
          0,
          hatchColor as string,
          strokeWidth,
        );
      }
    } else if (customPattern && customPattern.lineFamilies.length === 0) {
      ctx.fillStyle = hatchColor;
      ctx.fill();
    } else {
      const hatchAngle = effectiveHatchAngle;

      if (effectiveHatchType === 'solid') {
        ctx.fillStyle = hatchColor;
        ctx.fill();
      } else if (effectiveHatchType === 'diagonal') {
        renderCtx.drawLineFamilySimple(hatchAngle, spacing, minX, minY, maxX, maxY);
      } else if (effectiveHatchType === 'crosshatch') {
        renderCtx.drawLineFamilySimple(hatchAngle, spacing, minX, minY, maxX, maxY);
        renderCtx.drawLineFamilySimple(hatchAngle + 90, spacing, minX, minY, maxX, maxY);
      } else if (effectiveHatchType === 'horizontal') {
        renderCtx.drawLineFamilySimple(0, spacing, minX, minY, maxX, maxY);
      } else if (effectiveHatchType === 'vertical') {
        renderCtx.drawLineFamilySimple(90, spacing, minX, minY, maxX, maxY);
      } else if (effectiveHatchType === 'dots') {
        renderCtx.drawLineFamilySimple(hatchAngle, spacing, minX, minY, maxX, maxY);
      }
    }

    ctx.restore();
  }

  // Draw span direction arrows if spanDirection is set
  if (shape.spanDirection !== undefined && shape.spanDirection !== null) {
    let arrowColor = shape.style.strokeColor;
    if (invertColors && arrowColor === '#ffffff') {
      arrowColor = '#000000';
    }

    // Calculate centroid
    let cx = 0, cy = 0;
    for (const p of points) {
      cx += p.x;
      cy += p.y;
    }
    cx /= points.length;
    cy /= points.length;

    // Calculate bounding box to determine arrow length
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of points) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }

    const spanAngleRad = (shape.spanDirection * Math.PI) / 180;
    const bboxWidth = maxX - minX;
    const bboxHeight = maxY - minY;

    // Arrow length: 60% of dimension along span direction
    const diagProjection = Math.abs(bboxWidth * Math.cos(spanAngleRad)) + Math.abs(bboxHeight * Math.sin(spanAngleRad));
    const arrowLen = Math.max(diagProjection * 0.5, 200);
    const halfLen = arrowLen / 2;

    // Arrowhead size
    const arrowHeadLen = Math.min(halfLen * 0.2, 80);
    const arrowHeadWidth = arrowHeadLen * 0.5;

    // Two parallel arrows offset from the centroid
    const perpAngle = spanAngleRad + Math.PI / 2;
    const arrowSpacing = Math.min(bboxWidth, bboxHeight) * 0.15;
    const lineWidth = ctx.lineWidth;

    ctx.save();
    ctx.strokeStyle = arrowColor;
    ctx.fillStyle = arrowColor;
    ctx.lineWidth = lineWidth * 0.8;
    ctx.setLineDash([]);

    for (const offset of [-arrowSpacing, arrowSpacing]) {
      const ocx = cx + Math.cos(perpAngle) * offset;
      const ocy = cy + Math.sin(perpAngle) * offset;

      const dx = Math.cos(spanAngleRad);
      const dy = Math.sin(spanAngleRad);

      const startX = ocx - dx * halfLen;
      const startY = ocy - dy * halfLen;
      const endX = ocx + dx * halfLen;
      const endY = ocy + dy * halfLen;

      // Draw arrow shaft
      ctx.beginPath();
      ctx.moveTo(startX + dx * arrowHeadLen, startY + dy * arrowHeadLen);
      ctx.lineTo(endX - dx * arrowHeadLen, endY - dy * arrowHeadLen);
      ctx.stroke();

      // Start arrowhead (pointing toward start)
      const perpX = -dy;
      const perpY = dx;
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(startX + dx * arrowHeadLen + perpX * arrowHeadWidth, startY + dy * arrowHeadLen + perpY * arrowHeadWidth);
      ctx.lineTo(startX + dx * arrowHeadLen - perpX * arrowHeadWidth, startY + dy * arrowHeadLen - perpY * arrowHeadWidth);
      ctx.closePath();
      ctx.fill();

      // End arrowhead (pointing toward end)
      ctx.beginPath();
      ctx.moveTo(endX, endY);
      ctx.lineTo(endX - dx * arrowHeadLen + perpX * arrowHeadWidth, endY - dy * arrowHeadLen + perpY * arrowHeadWidth);
      ctx.lineTo(endX - dx * arrowHeadLen - perpX * arrowHeadWidth, endY - dy * arrowHeadLen - perpY * arrowHeadWidth);
      ctx.closePath();
      ctx.fill();
    }

    ctx.restore();
  }

  // Draw label if present
  if (shape.label) {
    let textColor = shape.style.strokeColor;
    if (invertColors && textColor === '#ffffff') {
      textColor = '#000000';
    }

    let cx = 0, cy = 0;
    for (const p of points) {
      cx += p.x;
      cy += p.y;
    }
    cx /= points.length;
    cy /= points.length;

    const fontSize = Math.max(80, effectiveHatchSpacing * 0.8);
    ctx.save();
    ctx.fillStyle = textColor;
    ctx.font = `${fontSize}px ${CAD_DEFAULT_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(shape.label, cx, cy);
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------
// Space
// ---------------------------------------------------------------------------

function drawSpace(renderCtx: ShapeRenderContext, shape: SpaceShape, _invertColors: boolean): void {
  const ctx = renderCtx.ctx;
  const { contourPoints, name, number: spaceNumber, area, labelPosition, fillColor, fillOpacity } = shape;

  if (contourPoints.length < 3) return;

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(contourPoints[0].x, contourPoints[0].y);
  for (let i = 1; i < contourPoints.length; i++) {
    ctx.lineTo(contourPoints[i].x, contourPoints[i].y);
  }
  ctx.closePath();

  ctx.globalAlpha = fillOpacity ?? 0.1;
  ctx.fillStyle = fillColor || '#00ff00';
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.setLineDash([100, 50]);
  ctx.lineWidth = renderCtx.getLineWidth(1);
  ctx.strokeStyle = fillColor || '#00ff00';
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  ctx.save();
  const scaleFactor = LINE_DASH_REFERENCE_SCALE / renderCtx.drawingScale;
  const fontSize = 150 * scaleFactor;

  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${fontSize}px ${CAD_DEFAULT_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  let labelText = name;
  if (spaceNumber) {
    labelText = `${spaceNumber} - ${labelText}`;
  }
  ctx.fillText(labelText, labelPosition.x, labelPosition.y);

  if (area !== undefined) {
    const areaFontSize = fontSize * 0.7;
    ctx.font = `${areaFontSize}px ${CAD_DEFAULT_FONT}`;
    ctx.fillText(`${formatNumber(area, 2, renderCtx.unitSettings.numberFormat)} m\u00B2`, labelPosition.x, labelPosition.y + fontSize * 1.2);
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Plate system
// ---------------------------------------------------------------------------

function drawPlateSystem(renderCtx: ShapeRenderContext, shape: PlateSystemShape, _invertColors: boolean): void {
  const ctx = renderCtx.ctx;
  const { contourPoints, contourBulges, mainProfile, edgeProfile, layers, fillColor, fillOpacity, name } = shape;

  if (contourPoints.length < 3) return;

  const hasChildBeams = shape.childShapeIds && shape.childShapeIds.length > 0;
  const dpr = window.devicePixelRatio || 1;

  const buildContourPath = () => {
    ctx.moveTo(contourPoints[0].x, contourPoints[0].y);
    for (let i = 0; i < contourPoints.length; i++) {
      const j = (i + 1) % contourPoints.length;
      const b = contourBulges?.[i] ?? 0;
      if (b !== 0 && Math.abs(b) > 0.0001) {
        const arc = bulgeToArc(contourPoints[i], contourPoints[j], b);
        ctx.arc(arc.center.x, arc.center.y, arc.radius, arc.startAngle, arc.endAngle, arc.clockwise);
      } else if (j !== 0) {
        ctx.lineTo(contourPoints[j].x, contourPoints[j].y);
      } else {
        ctx.closePath();
      }
    }
  };

  // 1. Draw the contour boundary (thick line)
  ctx.save();
  const savedLW = ctx.lineWidth;
  ctx.lineWidth = savedLW * 1.5;
  ctx.beginPath();
  buildContourPath();
  ctx.stroke();
  ctx.lineWidth = savedLW;

  // 2. Fill contour with light color
  if (fillColor) {
    ctx.globalAlpha = fillOpacity ?? 0.15;
    ctx.fillStyle = fillColor;
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // If child beams exist, skip internal joist/edge rendering
  if (!hasChildBeams) {
    // 3. Clip to the contour for internal drawing
    ctx.beginPath();
    buildContourPath();
    ctx.clip();

    // 4. Draw edge profiles along the contour boundary (legacy)
    if (edgeProfile) {
      const edgeW = edgeProfile.width;
      ctx.strokeStyle = ctx.strokeStyle;
      ctx.lineWidth = savedLW * 0.5;
      ctx.setLineDash([]);

      for (let i = 0; i < contourPoints.length; i++) {
        const j = (i + 1) % contourPoints.length;
        const p1 = contourPoints[i];
        const p2 = contourPoints[j];
        const edgeAngle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
        const nx = Math.sin(edgeAngle);
        const ny = -Math.cos(edgeAngle);

        ctx.beginPath();
        ctx.moveTo(p1.x + nx * edgeW, p1.y + ny * edgeW);
        ctx.lineTo(p2.x + nx * edgeW, p2.y + ny * edgeW);
        ctx.stroke();
      }
    }

    // 5. Draw main profiles (joists) as parallel lines within the contour (legacy)
    const dir = mainProfile.direction;
    const spacing = mainProfile.spacing;
    const joistWidth = mainProfile.width;
    const cosD = Math.cos(dir);
    const sinD = Math.sin(dir);

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of contourPoints) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }

    const diag = Math.sqrt((maxX - minX) ** 2 + (maxY - minY) ** 2);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;

    const norm = { x: -sinD, y: cosD };
    const numLines = Math.ceil(diag / spacing) + 1;

    const halfW = joistWidth / 2;
    ctx.setLineDash([]);

    const joistFillColor = mainProfile.material === 'timber' ? 'rgba(210, 180, 130, 0.3)'
      : mainProfile.material === 'steel' ? 'rgba(180, 190, 200, 0.3)'
      : 'rgba(200, 200, 200, 0.2)';

    for (let i = -numLines; i <= numLines; i++) {
      const offset = i * spacing;
      const ox = cx + norm.x * offset;
      const oy = cy + norm.y * offset;

      const p1x = ox - cosD * diag;
      const p1y = oy - sinD * diag;
      const p2x = ox + cosD * diag;
      const p2y = oy + sinD * diag;

      ctx.fillStyle = joistFillColor;
      ctx.beginPath();
      ctx.moveTo(p1x + norm.x * halfW, p1y + norm.y * halfW);
      ctx.lineTo(p2x + norm.x * halfW, p2y + norm.y * halfW);
      ctx.lineTo(p2x - norm.x * halfW, p2y - norm.y * halfW);
      ctx.lineTo(p1x - norm.x * halfW, p1y - norm.y * halfW);
      ctx.closePath();
      ctx.fill();

      ctx.lineWidth = savedLW * 0.4;
      ctx.beginPath();
      ctx.moveTo(p1x + norm.x * halfW, p1y + norm.y * halfW);
      ctx.lineTo(p2x + norm.x * halfW, p2y + norm.y * halfW);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(p1x - norm.x * halfW, p1y - norm.y * halfW);
      ctx.lineTo(p2x - norm.x * halfW, p2y - norm.y * halfW);
      ctx.stroke();
    }
  }

  // 6. Draw layer indicators
  if (layers && layers.length > 0) {
    if (hasChildBeams) {
      ctx.beginPath();
      buildContourPath();
      ctx.clip();
    }

    const layerColors: Record<string, string> = {
      timber: 'rgba(180, 140, 80, 0.5)',
      gypsum: 'rgba(220, 220, 220, 0.5)',
      steel: 'rgba(160, 170, 180, 0.5)',
      insulation: 'rgba(255, 220, 100, 0.4)',
      generic: 'rgba(200, 200, 200, 0.4)',
    };
    let layerOffset = 0;
    for (const layer of layers) {
      layerOffset += layer.thickness;
      ctx.strokeStyle = layerColors[layer.material] || layerColors.generic;
      ctx.lineWidth = Math.max(layer.thickness * 0.5, savedLW * 0.3);
      ctx.setLineDash([]);
      const sign = layer.position === 'top' ? 1 : -1;
      const off = sign * layerOffset;
      ctx.beginPath();
      for (let i = 0; i < contourPoints.length; i++) {
        const j = (i + 1) % contourPoints.length;
        const p1 = contourPoints[i];
        const p2 = contourPoints[j];
        const edgeAngle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
        const nx = Math.sin(edgeAngle) * off;
        const ny = -Math.cos(edgeAngle) * off;
        if (i === 0) {
          ctx.moveTo(p1.x + nx, p1.y + ny);
        }
        ctx.lineTo(p2.x + nx, p2.y + ny);
      }
      ctx.closePath();
      ctx.stroke();
    }
  }

  ctx.restore();

  // 7. Draw label (system name) at centroid
  if (name) {
    let labelCx = 0, labelCy = 0;
    for (const p of contourPoints) {
      labelCx += p.x;
      labelCy += p.y;
    }
    labelCx /= contourPoints.length;
    labelCy /= contourPoints.length;

    const scaleFactor = LINE_DASH_REFERENCE_SCALE / renderCtx.drawingScale;
    const fontSize = 120 * scaleFactor;
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${fontSize}px ${CAD_DEFAULT_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, labelCx, labelCy);

    const typeFontSize = fontSize * 0.7;
    ctx.font = `${typeFontSize}px ${CAD_DEFAULT_FONT}`;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.fillText(shape.systemType, labelCx, labelCy + fontSize * 1.2);
    ctx.restore();
  }

  // 8. Draw openings (sparingen) as dashed rectangles
  if (shape.openings && shape.openings.length > 0) {
    const store = useAppStore.getState();
    const isEditMode = store.plateSystemEditMode && store.editingPlateSystemId === shape.id;
    const selectedOpeningId = store.selectedOpeningId;
    const zoom = ctx.getTransform().a / dpr;

    for (const opening of shape.openings) {
      ctx.save();
      ctx.translate(opening.position.x, opening.position.y);
      if (opening.rotation) {
        ctx.rotate(opening.rotation);
      }

      const hw = opening.width / 2;
      const hh = opening.height / 2;

      ctx.fillStyle = 'rgba(40, 20, 20, 0.35)';
      ctx.fillRect(-hw, -hh, opening.width, opening.height);

      const isSelected = isEditMode && selectedOpeningId === opening.id;
      ctx.strokeStyle = isSelected ? 'rgba(0, 220, 255, 1.0)' : 'rgba(255, 100, 80, 0.8)';
      ctx.lineWidth = isSelected ? 2 / zoom : 1.5 / zoom;
      ctx.setLineDash([6 / zoom, 3 / zoom]);
      ctx.strokeRect(-hw, -hh, opening.width, opening.height);
      ctx.setLineDash([]);

      ctx.strokeStyle = isSelected ? 'rgba(0, 200, 255, 0.5)' : 'rgba(255, 100, 80, 0.3)';
      ctx.lineWidth = 0.8 / zoom;
      ctx.beginPath();
      ctx.moveTo(-hw, -hh);
      ctx.lineTo(hw, hh);
      ctx.moveTo(hw, -hh);
      ctx.lineTo(-hw, hh);
      ctx.stroke();

      if (isEditMode && isSelected) {
        const gripSize = 4 / zoom;
        ctx.fillStyle = 'rgba(0, 220, 255, 1.0)';
        const gripPositions = [
          { x: -hw, y: -hh }, { x: hw, y: -hh },
          { x: hw, y: hh }, { x: -hw, y: hh },
          { x: 0, y: -hh }, { x: hw, y: 0 },
          { x: 0, y: hh }, { x: -hw, y: 0 },
        ];
        for (const gp of gripPositions) {
          ctx.fillRect(gp.x - gripSize / 2, gp.y - gripSize / 2, gripSize, gripSize);
        }
      }

      if (isEditMode) {
        const dimFontSize = 10 / zoom;
        ctx.font = `${dimFontSize}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillStyle = 'rgba(255, 180, 160, 0.9)';
        ctx.fillText(`${opening.width} x ${opening.height}`, 0, hh + 4 / zoom);
      }

      ctx.restore();
    }
  }
}

/** Draw a dashed cyan border and edit mode label around a plate system in edit mode */
function drawPlateSystemEditModeIndicator(renderCtx: ShapeRenderContext, shape: PlateSystemShape): void {
  const ctx = renderCtx.ctx;
  const { contourPoints, contourBulges } = shape;
  if (contourPoints.length < 3) return;

  const dpr = window.devicePixelRatio || 1;
  const zoom = ctx.getTransform().a / dpr;
  const store = useAppStore.getState();
  const openingMode = store.plateSystemOpeningMode;

  ctx.save();

  ctx.strokeStyle = 'rgba(0, 200, 255, 0.7)';
  ctx.lineWidth = 2 / zoom;
  ctx.setLineDash([8 / zoom, 4 / zoom]);

  ctx.beginPath();
  ctx.moveTo(contourPoints[0].x, contourPoints[0].y);
  for (let i = 0; i < contourPoints.length; i++) {
    const j = (i + 1) % contourPoints.length;
    const b = contourBulges?.[i] ?? 0;
    if (b !== 0 && Math.abs(b) > 0.0001) {
      const arc = bulgeToArc(contourPoints[i], contourPoints[j], b);
      ctx.arc(arc.center.x, arc.center.y, arc.radius, arc.startAngle, arc.endAngle, arc.clockwise);
    } else if (j !== 0) {
      ctx.lineTo(contourPoints[j].x, contourPoints[j].y);
    } else {
      ctx.closePath();
    }
  }
  ctx.stroke();
  ctx.setLineDash([]);

  if (openingMode) {
    let labelCx = 0;
    let minYForHint = Infinity;
    for (const p of contourPoints) {
      labelCx += p.x;
      if (p.y < minYForHint) minYForHint = p.y;
    }
    labelCx /= contourPoints.length;

    const hintFontSize = 10 / zoom;
    ctx.font = `${hintFontSize}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = 'rgba(255, 180, 100, 0.9)';
    ctx.fillText('Click to place opening', labelCx, minYForHint - 50 / zoom);
  }

  ctx.restore();
}

/** Draw a subtle "Tab to edit" hint below a plate system when selected but not in edit mode */
function drawPlateSystemTabHint(renderCtx: ShapeRenderContext, shape: PlateSystemShape): void {
  const ctx = renderCtx.ctx;
  const { contourPoints } = shape;
  if (contourPoints.length < 3) return;

  const dpr = window.devicePixelRatio || 1;
  const zoom = ctx.getTransform().a / dpr;

  ctx.save();

  let maxY = -Infinity;
  let labelCx = 0;
  for (const p of contourPoints) {
    if (p.y > maxY) maxY = p.y;
    labelCx += p.x;
  }
  labelCx /= contourPoints.length;

  const labelFontSize = 10 / zoom;
  ctx.font = `${labelFontSize}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  const hintText = 'TAB to edit';
  const labelY = maxY + 10 / zoom;

  const metrics = ctx.measureText(hintText);
  const pad = 3 / zoom;
  ctx.fillStyle = 'rgba(40, 40, 60, 0.75)';
  const rx = labelCx - metrics.width / 2 - pad;
  const ry = labelY - pad;
  const rw = metrics.width + pad * 2;
  const rh = labelFontSize + pad * 2;
  ctx.beginPath();
  ctx.roundRect(rx, ry, rw, rh, 2 / zoom);
  ctx.fill();

  ctx.fillStyle = 'rgba(200, 200, 220, 0.85)';
  ctx.fillText(hintText, labelCx, labelY);

  ctx.restore();
}

// ---------------------------------------------------------------------------
// Section callout
// ---------------------------------------------------------------------------

function drawSectionCallout(renderCtx: ShapeRenderContext, shape: SectionCalloutShape, invertColors: boolean): void {
  const ctx = renderCtx.ctx;
  const { start, end, label, flipDirection } = shape;

  const scaleFactor = LINE_DASH_REFERENCE_SCALE / renderCtx.drawingScale;
  const bubbleRadius = shape.bubbleRadius * scaleFactor;
  const fontSize = shape.fontSize * scaleFactor;

  const angle = Math.atan2(end.y - start.y, end.x - start.x);
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);

  const perpSign = flipDirection ? 1 : -1;
  const perpX = -dy * perpSign;
  const perpY = dx * perpSign;

  const origLineWidth = ctx.lineWidth;

  let textColor = shape.style.strokeColor;
  if (invertColors && textColor === '#ffffff') {
    textColor = '#000000';
  }

  // Draw view depth area
  const viewDepth = shape.viewDepth ?? 5000;
  if (viewDepth > 0) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.lineTo(end.x + perpX * viewDepth, end.y + perpY * viewDepth);
    ctx.lineTo(start.x + perpX * viewDepth, start.y + perpY * viewDepth);
    ctx.closePath();
    ctx.fillStyle = 'rgba(100, 180, 255, 0.08)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(100, 180, 255, 0.4)';
    ctx.lineWidth = origLineWidth;
    ctx.setLineDash([bubbleRadius * 0.15, bubbleRadius * 0.1]);
    ctx.beginPath();
    ctx.moveTo(start.x + perpX * viewDepth, start.y + perpY * viewDepth);
    ctx.lineTo(end.x + perpX * viewDepth, end.y + perpY * viewDepth);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  // Draw the cut line
  ctx.save();
  ctx.lineWidth = origLineWidth * 2;
  ctx.setLineDash([bubbleRadius * 0.3, bubbleRadius * 0.15, bubbleRadius * 0.05, bubbleRadius * 0.15]);
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();
  ctx.restore();

  ctx.setLineDash([]);
  ctx.lineWidth = origLineWidth;

  // Draw simple text labels at each endpoint
  const labelOffset = bubbleRadius * 1.2;
  const drawSectionLabel = (px: number, py: number, offsetDx: number, offsetDy: number) => {
    ctx.save();
    const lx = px + offsetDx * labelOffset;
    const ly = py + offsetDy * labelOffset;
    ctx.fillStyle = textColor;
    ctx.font = `bold ${fontSize * 1.4}px ${CAD_DEFAULT_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, lx, ly);
    ctx.restore();
  };

  const showStart = !shape.hideStartHead;
  const showEnd = !shape.hideEndHead;

  if (showStart) drawSectionLabel(start.x, start.y, -dx, -dy);
  if (showEnd) drawSectionLabel(end.x, end.y, dx, dy);

  // Draw direction arrows at each endpoint
  const arrowLen = bubbleRadius * 1.5;
  ctx.lineWidth = origLineWidth * 1.5;

  ctx.beginPath();
  if (showStart) {
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(start.x + perpX * arrowLen, start.y + perpY * arrowLen);
  }
  if (showEnd) {
    ctx.moveTo(end.x, end.y);
    ctx.lineTo(end.x + perpX * arrowLen, end.y + perpY * arrowLen);
  }
  ctx.stroke();

  // Filled arrowheads
  const arrowHeadSize = bubbleRadius * 0.5;
  const drawArrowHead = (tipX: number, tipY: number, adx: number, ady: number) => {
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(tipX - adx * arrowHeadSize + ady * arrowHeadSize * 0.4, tipY - ady * arrowHeadSize - adx * arrowHeadSize * 0.4);
    ctx.lineTo(tipX - adx * arrowHeadSize - ady * arrowHeadSize * 0.4, tipY - ady * arrowHeadSize + adx * arrowHeadSize * 0.4);
    ctx.closePath();
    ctx.fillStyle = textColor;
    ctx.fill();
  };

  if (showStart) drawArrowHead(start.x + perpX * arrowLen, start.y + perpY * arrowLen, perpX, perpY);
  if (showEnd) drawArrowHead(end.x + perpX * arrowLen, end.y + perpY * arrowLen, perpX, perpY);

  ctx.lineWidth = origLineWidth;
}

// ---------------------------------------------------------------------------
// Slab Opening
// ---------------------------------------------------------------------------

function drawSlabOpening(renderCtx: ShapeRenderContext, shape: SlabOpeningShape, invertColors: boolean): void {
  const ctx = renderCtx.ctx;
  const { points } = shape;

  if (points.length < 3) return;

  let strokeColor = shape.style.strokeColor;
  if (invertColors && strokeColor === '#ffffff') {
    strokeColor = '#000000';
  }

  // Draw the outline polygon
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.closePath();
  ctx.stroke();

  // Determine display style: use shape override, then drawing standard, default 'cross'
  const displayStyle = shape.displayStyle || renderCtx.openingDisplayStyle || 'cross';

  if (displayStyle === 'outline') {
    // Outline only — no interior cross lines
    return;
  }

  // Compute bounding box of the polygon
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }

  // Save state and clip to the polygon boundary
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.closePath();
  ctx.clip();

  if (displayStyle === 'cross') {
    // Draw an X from bounding box corners
    ctx.beginPath();
    ctx.moveTo(minX, minY);
    ctx.lineTo(maxX, maxY);
    ctx.moveTo(maxX, minY);
    ctx.lineTo(minX, maxY);
    ctx.stroke();
  } else if (displayStyle === 'diagonal') {
    // Draw diagonal lines at 45 degrees across the opening
    const size = Math.max(maxX - minX, maxY - minY);
    const spacing = size / 8;  // Roughly 8 diagonal lines
    if (spacing > 0) {
      ctx.beginPath();
      const diag = (maxX - minX) + (maxY - minY);
      for (let d = -diag; d <= diag; d += spacing) {
        ctx.moveTo(minX + d, minY);
        ctx.lineTo(minX + d + (maxY - minY), maxY);
      }
      ctx.stroke();
    }
  }

  ctx.restore();
}

// ---------------------------------------------------------------------------
// Slab Label
// ---------------------------------------------------------------------------

function drawSlabLabel(renderCtx: ShapeRenderContext, shape: SlabLabelShape, invertColors: boolean): void {
  const ctx = renderCtx.ctx;
  const { position, floorType, customTypeName, thickness, spanDirection, fontSize, arrowLength } = shape;

  let textColor = shape.style.strokeColor;
  if (invertColors && textColor === '#ffffff') {
    textColor = '#000000';
  }

  // Resolve display name
  const ftInfo = STRUCTURAL_FLOOR_TYPES.find(ft => ft.value === floorType);
  const typeName = floorType === 'custom'
    ? (customTypeName || 'Custom')
    : (ftInfo?.label || floorType);

  const spanAngleRad = (spanDirection * Math.PI) / 180;

  ctx.save();
  ctx.translate(position.x, position.y);

  // --- Draw span direction arrows (two parallel double-headed arrows) ---
  const halfLen = arrowLength / 2;
  const arrowHeadLen = Math.min(halfLen * 0.2, fontSize * 1.0);
  const arrowHeadWidth = arrowHeadLen * 0.5;
  const arrowSpacing = fontSize * 1.5;

  ctx.strokeStyle = textColor;
  ctx.fillStyle = textColor;
  ctx.lineWidth = renderCtx.getLineWidth ? renderCtx.getLineWidth(shape.style.strokeWidth) : shape.style.strokeWidth;
  ctx.setLineDash([]);

  const dx = Math.cos(spanAngleRad);
  const dy = Math.sin(spanAngleRad);
  const perpX = -dy;
  const perpY = dx;

  for (const offset of [-arrowSpacing, arrowSpacing]) {
    const ocx = perpX * offset;
    const ocy = perpY * offset;

    const startX = ocx - dx * halfLen;
    const startY = ocy - dy * halfLen;
    const endX = ocx + dx * halfLen;
    const endY = ocy + dy * halfLen;

    // Arrow shaft
    ctx.beginPath();
    ctx.moveTo(startX + dx * arrowHeadLen, startY + dy * arrowHeadLen);
    ctx.lineTo(endX - dx * arrowHeadLen, endY - dy * arrowHeadLen);
    ctx.stroke();

    // Start arrowhead
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(startX + dx * arrowHeadLen + perpX * arrowHeadWidth, startY + dy * arrowHeadLen + perpY * arrowHeadWidth);
    ctx.lineTo(startX + dx * arrowHeadLen - perpX * arrowHeadWidth, startY + dy * arrowHeadLen - perpY * arrowHeadWidth);
    ctx.closePath();
    ctx.fill();

    // End arrowhead
    ctx.beginPath();
    ctx.moveTo(endX, endY);
    ctx.lineTo(endX - dx * arrowHeadLen + perpX * arrowHeadWidth, endY - dy * arrowHeadLen + perpY * arrowHeadWidth);
    ctx.lineTo(endX - dx * arrowHeadLen - perpX * arrowHeadWidth, endY - dy * arrowHeadLen - perpY * arrowHeadWidth);
    ctx.closePath();
    ctx.fill();
  }

  // --- Draw label text (type name + thickness) centered between arrows ---
  const fontStyle = `${fontSize}px ${CAD_DEFAULT_FONT}`;
  ctx.font = fontStyle;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = textColor;

  const line1 = typeName;
  const line2 = `${thickness} mm`;
  const lineSpacing = fontSize * 1.3;

  // Background mask behind text
  const bgPadding = fontSize * 0.3;
  const maxTextWidth = Math.max(ctx.measureText(line1).width, ctx.measureText(line2).width);
  const bgWidth = maxTextWidth + bgPadding * 2;
  const bgHeight = lineSpacing * 2 + bgPadding * 2;

  let bgColor = '#1a1a2e';
  if (invertColors) bgColor = '#ffffff';
  ctx.fillStyle = bgColor;
  ctx.fillRect(-bgWidth / 2, -bgHeight / 2, bgWidth, bgHeight);

  // Border around background
  ctx.strokeStyle = textColor;
  ctx.lineWidth = shape.style.strokeWidth * 0.5;
  ctx.strokeRect(-bgWidth / 2, -bgHeight / 2, bgWidth, bgHeight);

  // Text lines
  ctx.fillStyle = textColor;
  ctx.fillText(line1, 0, -lineSpacing * 0.5);
  ctx.fillText(line2, 0, lineSpacing * 0.5);

  ctx.restore();
}

// ===========================================================================
// Column rendering
// ===========================================================================

/** Draw a column shape in plan view as a filled rectangle with material-specific hatch */
function drawColumn(renderCtx: ShapeRenderContext, shape: ColumnShape, invertColors: boolean): void {
  const ctx = renderCtx.ctx;
  const { position, width, depth, rotation, material } = shape;

  const halfW = width / 2;
  const halfD = depth / 2;

  ctx.save();
  ctx.translate(position.x, position.y);
  if (rotation) ctx.rotate(rotation);

  const strokeColor = invertColors ? '#000000' : (shape.style.strokeColor || '#ffffff');
  const lineWidth = renderCtx.getLineWidth ? renderCtx.getLineWidth(shape.style.strokeWidth) : shape.style.strokeWidth;

  // Fill background
  let fillColor: string;
  if (material === 'concrete') {
    fillColor = invertColors ? '#e8e8e8' : '#3a3a4a';
  } else if (material === 'steel') {
    fillColor = invertColors ? '#d8dce8' : '#2a3040';
  } else {
    // timber
    fillColor = invertColors ? '#f0e8d8' : '#3a3020';
  }

  ctx.fillStyle = fillColor;
  ctx.fillRect(-halfW, -halfD, width, depth);

  // Draw material hatch pattern
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = lineWidth * 0.5;

  if (material === 'concrete') {
    // Diagonal hatch pattern
    ctx.beginPath();
    const spacing = Math.min(width, depth) * 0.15;
    const diagLen = Math.sqrt(width * width + depth * depth);
    const count = Math.ceil(diagLen / spacing);
    ctx.save();
    ctx.rect(-halfW, -halfD, width, depth);
    ctx.clip();
    for (let i = -count; i <= count; i++) {
      const offset = i * spacing;
      ctx.moveTo(-halfW + offset, -halfD);
      ctx.lineTo(-halfW + offset + depth, -halfD + depth);
    }
    ctx.stroke();
    ctx.restore();
  } else if (material === 'steel') {
    // Centerline cross pattern
    ctx.beginPath();
    ctx.moveTo(-halfW, 0);
    ctx.lineTo(halfW, 0);
    ctx.moveTo(0, -halfD);
    ctx.lineTo(0, halfD);
    ctx.stroke();

    // Diagonal cross
    ctx.beginPath();
    const crossSize = Math.min(halfW, halfD) * 0.4;
    ctx.moveTo(-crossSize, -crossSize);
    ctx.lineTo(crossSize, crossSize);
    ctx.moveTo(crossSize, -crossSize);
    ctx.lineTo(-crossSize, crossSize);
    ctx.stroke();
  }
  // timber: no hatch, just fill

  // Outline
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = lineWidth;
  ctx.setLineDash([]);
  ctx.strokeRect(-halfW, -halfD, width, depth);

  ctx.restore();
}

// ---------------------------------------------------------------------------
// Rebar (IfcReinforcingBar)
// ---------------------------------------------------------------------------

function drawRebar(renderCtx: ShapeRenderContext, shape: RebarShape, invertColors: boolean): void {
  const ctx = renderCtx.ctx;
  const { position, diameter, barMark, viewMode, endPoint, count, spacing } = shape;

  const strokeColor = invertColors ? '#000000' : (shape.style.strokeColor || '#ffffff');
  const fillColor = invertColors ? '#555555' : '#4a7a4a';
  const lineWidth = renderCtx.getLineWidth ? renderCtx.getLineWidth(shape.style.strokeWidth) : shape.style.strokeWidth;

  if (viewMode === 'longitudinal' && endPoint) {
    // Longitudinal view: draw as line with end hooks
    const r = diameter / 2;
    const hookLen = diameter * 3;

    ctx.save();
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = Math.max(lineWidth, diameter * 0.3);
    ctx.setLineDash([]);

    // Main bar
    ctx.beginPath();
    ctx.moveTo(position.x, position.y);
    ctx.lineTo(endPoint.x, endPoint.y);
    ctx.stroke();

    // End hooks (90-degree bends)
    const dx = endPoint.x - position.x;
    const dy = endPoint.y - position.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len > 0) {
      const dirX = dx / len;
      const dirY = dy / len;
      const perpX = -dirY;
      const perpY = dirX;

      // Start hook
      ctx.beginPath();
      ctx.moveTo(position.x, position.y);
      ctx.lineTo(position.x + perpX * hookLen, position.y + perpY * hookLen);
      ctx.stroke();

      // End hook
      ctx.beginPath();
      ctx.moveTo(endPoint.x, endPoint.y);
      ctx.lineTo(endPoint.x + perpX * hookLen, endPoint.y + perpY * hookLen);
      ctx.stroke();
    }

    // Label
    const midX = (position.x + endPoint.x) / 2;
    const midY = (position.y + endPoint.y) / 2;
    const labelSize = Math.max(diameter * 3, 80);
    ctx.font = `${labelSize}px ${CAD_DEFAULT_FONT}`;
    ctx.fillStyle = strokeColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    const label = count && spacing
      ? `${count}-\u00d8${diameter} c.t.c. ${spacing}`
      : count
      ? `${count}-\u00d8${diameter}`
      : `\u00d8${diameter}`;
    ctx.fillText(`${barMark}: ${label}`, midX, midY - diameter);

    ctx.restore();
  } else {
    // Cross-section view: draw as filled circle
    const r = diameter / 2;
    const drawRadius = Math.max(r, 20); // Minimum visual radius

    ctx.save();

    // Filled circle
    ctx.beginPath();
    ctx.arc(position.x, position.y, drawRadius, 0, Math.PI * 2);
    ctx.fillStyle = fillColor;
    ctx.fill();
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = lineWidth;
    ctx.setLineDash([]);
    ctx.stroke();

    // Label next to bar
    const labelSize = Math.max(diameter * 2.5, 60);
    ctx.font = `${labelSize}px ${CAD_DEFAULT_FONT}`;
    ctx.fillStyle = strokeColor;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const label = count && spacing
      ? `${barMark}: ${count}-\u00d8${diameter} c.t.c. ${spacing}`
      : count
      ? `${barMark}: ${count}-\u00d8${diameter}`
      : `${barMark}: \u00d8${diameter}`;
    ctx.fillText(label, position.x + drawRadius + labelSize * 0.3, position.y);

    ctx.restore();
  }
}

// ===========================================================================
// Registry: register / unregister all AEC shape renderers
// ===========================================================================

const SHAPE_TYPES = [
  'beam', 'gridline', 'level', 'puntniveau', 'pile', 'column', 'cpt',
  'foundation-zone', 'spot-elevation', 'wall', 'wall-opening', 'slab', 'slab-opening', 'slab-label', 'space',
  'plate-system', 'section-callout', 'rebar',
] as const;

export function registerRenderers(): void {
  // --- beam ---
  shapeRendererRegistry.register('beam', (_ctx, shape, _isSelected, _isHovered, invertColors, renderCtx) => {
    if (!renderCtx) return;
    drawBeam(renderCtx, shape as BeamShape, invertColors);
  });
  shapeRendererRegistry.registerSimple('beam', (_ctx, shape, invertColors, renderCtx) => {
    if (!renderCtx) return;
    drawBeam(renderCtx, shape as BeamShape, invertColors);
  });

  // --- gridline ---
  shapeRendererRegistry.register('gridline', (_ctx, shape, _isSelected, _isHovered, invertColors, renderCtx) => {
    if (!renderCtx) return;
    drawGridline(renderCtx, shape as GridlineShape, invertColors);
  });
  shapeRendererRegistry.registerSimple('gridline', (_ctx, shape, invertColors, renderCtx) => {
    if (!renderCtx) return;
    drawGridline(renderCtx, shape as GridlineShape, invertColors);
  });

  // --- level ---
  shapeRendererRegistry.register('level', (_ctx, shape, _isSelected, _isHovered, invertColors, renderCtx) => {
    if (!renderCtx) return;
    drawLevel(renderCtx, shape as LevelShape, invertColors);
  });
  shapeRendererRegistry.registerSimple('level', (_ctx, shape, invertColors, renderCtx) => {
    if (!renderCtx) return;
    drawLevel(renderCtx, shape as LevelShape, invertColors);
  });

  // --- puntniveau ---
  shapeRendererRegistry.register('puntniveau', (_ctx, shape, _isSelected, _isHovered, invertColors, renderCtx) => {
    if (!renderCtx) return;
    drawPuntniveau(renderCtx, shape as PuntniveauShape, invertColors);
  });
  shapeRendererRegistry.registerSimple('puntniveau', (_ctx, shape, invertColors, renderCtx) => {
    if (!renderCtx) return;
    drawPuntniveau(renderCtx, shape as PuntniveauShape, invertColors);
  });

  // --- pile ---
  shapeRendererRegistry.register('pile', (_ctx, shape, _isSelected, _isHovered, invertColors, renderCtx) => {
    if (!renderCtx) return;
    drawPile(renderCtx, shape as PileShape, invertColors);
  });
  shapeRendererRegistry.registerSimple('pile', (_ctx, shape, invertColors, renderCtx) => {
    if (!renderCtx) return;
    drawPile(renderCtx, shape as PileShape, invertColors);
  });

  // --- column ---
  shapeRendererRegistry.register('column', (_ctx, shape, _isSelected, _isHovered, invertColors, renderCtx) => {
    if (!renderCtx) return;
    drawColumn(renderCtx, shape as ColumnShape, invertColors);
  });
  shapeRendererRegistry.registerSimple('column', (_ctx, shape, invertColors, renderCtx) => {
    if (!renderCtx) return;
    drawColumn(renderCtx, shape as ColumnShape, invertColors);
  });

  // --- cpt ---
  shapeRendererRegistry.register('cpt', (_ctx, shape, _isSelected, _isHovered, invertColors, renderCtx) => {
    if (!renderCtx) return;
    drawCPT(renderCtx, shape as CPTShape, invertColors);
  });
  shapeRendererRegistry.registerSimple('cpt', (_ctx, shape, invertColors, renderCtx) => {
    if (!renderCtx) return;
    drawCPT(renderCtx, shape as CPTShape, invertColors);
  });

  // --- foundation-zone ---
  shapeRendererRegistry.register('foundation-zone', (_ctx, shape, _isSelected, _isHovered, invertColors, renderCtx) => {
    if (!renderCtx) return;
    drawFoundationZone(renderCtx, shape as FoundationZoneShape, invertColors);
  });
  shapeRendererRegistry.registerSimple('foundation-zone', (_ctx, shape, invertColors, renderCtx) => {
    if (!renderCtx) return;
    drawFoundationZone(renderCtx, shape as FoundationZoneShape, invertColors);
  });

  // --- spot-elevation ---
  shapeRendererRegistry.register('spot-elevation', (_ctx, shape, _isSelected, _isHovered, invertColors, renderCtx) => {
    if (!renderCtx) return;
    drawSpotElevation(renderCtx, shape as SpotElevationShape, invertColors);
  });
  shapeRendererRegistry.registerSimple('spot-elevation', (_ctx, shape, invertColors, renderCtx) => {
    if (!renderCtx) return;
    drawSpotElevation(renderCtx, shape as SpotElevationShape, invertColors);
  });

  // --- wall ---
  shapeRendererRegistry.register('wall', (_ctx, shape, _isSelected, _isHovered, invertColors, renderCtx) => {
    if (!renderCtx) return;
    drawWall(renderCtx, shape as WallShape, invertColors);
  });
  shapeRendererRegistry.registerSimple('wall', (_ctx, shape, invertColors, renderCtx) => {
    if (!renderCtx) return;
    drawWall(renderCtx, shape as WallShape, invertColors);
  });

  // --- wall-opening ---
  shapeRendererRegistry.register('wall-opening', (_ctx, shape, _isSelected, _isHovered, invertColors, renderCtx) => {
    if (!renderCtx) return;
    drawWallOpening(renderCtx, shape, invertColors);
  });
  shapeRendererRegistry.registerSimple('wall-opening', (_ctx, shape, invertColors, renderCtx) => {
    if (!renderCtx) return;
    drawWallOpening(renderCtx, shape, invertColors);
  });

  // --- slab ---
  shapeRendererRegistry.register('slab', (_ctx, shape, _isSelected, _isHovered, invertColors, renderCtx) => {
    if (!renderCtx) return;
    drawSlab(renderCtx, shape as SlabShape, invertColors);
  });
  shapeRendererRegistry.registerSimple('slab', (_ctx, shape, invertColors, renderCtx) => {
    if (!renderCtx) return;
    drawSlab(renderCtx, shape as SlabShape, invertColors);
  });

  // --- slab-opening ---
  shapeRendererRegistry.register('slab-opening', (_ctx, shape, _isSelected, _isHovered, invertColors, renderCtx) => {
    if (!renderCtx) return;
    drawSlabOpening(renderCtx, shape as SlabOpeningShape, invertColors);
  });
  shapeRendererRegistry.registerSimple('slab-opening', (_ctx, shape, invertColors, renderCtx) => {
    if (!renderCtx) return;
    drawSlabOpening(renderCtx, shape as SlabOpeningShape, invertColors);
  });

  // --- slab-label ---
  shapeRendererRegistry.register('slab-label', (_ctx, shape, _isSelected, _isHovered, invertColors, renderCtx) => {
    if (!renderCtx) return;
    drawSlabLabel(renderCtx, shape as SlabLabelShape, invertColors);
  });
  shapeRendererRegistry.registerSimple('slab-label', (_ctx, shape, invertColors, renderCtx) => {
    if (!renderCtx) return;
    drawSlabLabel(renderCtx, shape as SlabLabelShape, invertColors);
  });

  // --- space ---
  shapeRendererRegistry.register('space', (_ctx, shape, _isSelected, _isHovered, invertColors, renderCtx) => {
    if (!renderCtx) return;
    drawSpace(renderCtx, shape as SpaceShape, invertColors);
  });
  shapeRendererRegistry.registerSimple('space', (_ctx, shape, invertColors, renderCtx) => {
    if (!renderCtx) return;
    drawSpace(renderCtx, shape as SpaceShape, invertColors);
  });

  // --- plate-system (includes post-draw edit mode logic) ---
  shapeRendererRegistry.register('plate-system', (_ctx, shape, isSelected, _isHovered, invertColors, renderCtx) => {
    if (!renderCtx) return;
    drawPlateSystem(renderCtx, shape as PlateSystemShape, invertColors);
    // Post-draw: plate system edit mode indicator / tab hint
    const store = useAppStore.getState();
    if (store.plateSystemEditMode && store.editingPlateSystemId === shape.id) {
      drawPlateSystemEditModeIndicator(renderCtx, shape as PlateSystemShape);
    } else if (isSelected) {
      drawPlateSystemTabHint(renderCtx, shape as PlateSystemShape);
    }
  });
  shapeRendererRegistry.registerSimple('plate-system', (_ctx, shape, invertColors, renderCtx) => {
    if (!renderCtx) return;
    drawPlateSystem(renderCtx, shape as PlateSystemShape, invertColors);
  });

  // --- section-callout ---
  shapeRendererRegistry.register('section-callout', (_ctx, shape, _isSelected, _isHovered, invertColors, renderCtx) => {
    if (!renderCtx) return;
    drawSectionCallout(renderCtx, shape as SectionCalloutShape, invertColors);
  });
  shapeRendererRegistry.registerSimple('section-callout', (_ctx, shape, invertColors, renderCtx) => {
    if (!renderCtx) return;
    drawSectionCallout(renderCtx, shape as SectionCalloutShape, invertColors);
  });

  // --- rebar ---
  shapeRendererRegistry.register('rebar', (_ctx, shape, _isSelected, _isHovered, invertColors, renderCtx) => {
    if (!renderCtx) return;
    drawRebar(renderCtx, shape as RebarShape, invertColors);
  });
  shapeRendererRegistry.registerSimple('rebar', (_ctx, shape, invertColors, renderCtx) => {
    if (!renderCtx) return;
    drawRebar(renderCtx, shape as RebarShape, invertColors);
  });
}

export function unregisterRenderers(): void {
  for (const type of SHAPE_TYPES) {
    shapeRendererRegistry.unregister(type);
  }
}
