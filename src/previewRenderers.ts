/**
 * AEC Shape Preview Renderers -- standalone draw functions extracted from
 * ShapeRenderer.drawPreview().
 *
 * Each function takes a ShapeRenderContext instead of operating on `this`.
 * Registered via shapePreviewRegistry so they are available when the
 * extension is activated.
 */

import type { ShapeRenderContext } from 'open-2d-studio';
import { shapePreviewRegistry, bulgeToArc, CAD_DEFAULT_FONT, DEFAULT_MATERIAL_HATCH_SETTINGS, LINE_DASH_REFERENCE_SCALE, COLORS, formatElevation } from 'open-2d-studio';
import { drawPilePreviewSymbol } from './renderers';

// ---------------------------------------------------------------------------
// Helper: compute strokeColor from style + invertColors
// ---------------------------------------------------------------------------

function resolveStrokeColor(style: any, invertColors: boolean): string {
  let strokeColor = style?.strokeColor || '#ffffff';
  if (invertColors && strokeColor === '#ffffff') {
    strokeColor = '#000000';
  }
  return strokeColor;
}

// ---------------------------------------------------------------------------
// 1. Beam preview
// ---------------------------------------------------------------------------

function drawBeamPreview(
  renderCtx: ShapeRenderContext,
  ctx: CanvasRenderingContext2D,
  preview: any,
  _style: any,
  _invertColors: boolean,
): void {
  const { start, end, flangeWidth, showCenterline } = preview;

  // Arc beam preview
  if (preview.bulge && Math.abs(preview.bulge) > 0.0001) {
    const bArc = bulgeToArc(start, end, preview.bulge);
    const bHalfW = flangeWidth / 2;
    const bInnerR = Math.max(0, bArc.radius - bHalfW);
    const bOuterR = bArc.radius + bHalfW;

    // Draw arc beam outline
    ctx.beginPath();
    ctx.arc(bArc.center.x, bArc.center.y, bOuterR, bArc.startAngle, bArc.endAngle, bArc.clockwise);
    ctx.lineTo(bArc.center.x + bInnerR * Math.cos(bArc.endAngle), bArc.center.y + bInnerR * Math.sin(bArc.endAngle));
    ctx.arc(bArc.center.x, bArc.center.y, bInnerR, bArc.endAngle, bArc.startAngle, !bArc.clockwise);
    ctx.closePath();
    ctx.stroke();

    // Draw centerline arc (dashed)
    if (showCenterline) {
      ctx.save();
      ctx.setLineDash(renderCtx.getLineDash('dashdot'));
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.beginPath();
      ctx.arc(bArc.center.x, bArc.center.y, bArc.radius, bArc.startAngle, bArc.endAngle, bArc.clockwise);
      ctx.stroke();
      ctx.restore();
    }
    return;
  }

  const beamAngle = Math.atan2(end.y - start.y, end.x - start.x);
  const halfWidth = flangeWidth / 2;
  const perpX = Math.sin(beamAngle) * halfWidth;
  const perpY = Math.cos(beamAngle) * halfWidth;

  // Draw beam outline (rectangle in plan view)
  ctx.beginPath();
  ctx.moveTo(start.x + perpX, start.y - perpY);
  ctx.lineTo(end.x + perpX, end.y - perpY);
  ctx.lineTo(end.x - perpX, end.y + perpY);
  ctx.lineTo(start.x - perpX, start.y + perpY);
  ctx.closePath();
  ctx.stroke();

  // Draw centerline (dashed)
  if (showCenterline) {
    ctx.save();
    ctx.setLineDash(renderCtx.getLineDash('dashdot'));
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
    ctx.restore();
  }

  // Draw end lines (perpendicular at start and end)
  ctx.beginPath();
  ctx.moveTo(start.x + perpX, start.y - perpY);
  ctx.lineTo(start.x - perpX, start.y + perpY);
  ctx.moveTo(end.x + perpX, end.y - perpY);
  ctx.lineTo(end.x - perpX, end.y + perpY);
  ctx.stroke();
}

// ---------------------------------------------------------------------------
// 2. Gridline preview
// ---------------------------------------------------------------------------

function drawGridlinePreview(
  renderCtx: ShapeRenderContext,
  ctx: CanvasRenderingContext2D,
  preview: any,
  style: any,
  invertColors: boolean,
): void {
  const strokeColor = resolveStrokeColor(style, invertColors);
  const { start: glStart, end: glEnd, label: glLabel, bubblePosition: glBubblePos, bubbleRadius: glRadiusRaw } = preview;
  const glScaleFactor = LINE_DASH_REFERENCE_SCALE / renderCtx.drawingScale;
  const glRadius = glRadiusRaw * glScaleFactor;
  const glAngle = Math.atan2(glEnd.y - glStart.y, glEnd.x - glStart.x);
  const glDx = Math.cos(glAngle);
  const glDy = Math.sin(glAngle);

  // gridlineExtension is in paper-mm; multiply by LINE_DASH_REFERENCE_SCALE for
  // scale-independent paper size (constant mm on paper regardless of drawing scale)
  const glExt = renderCtx.gridlineExtension * LINE_DASH_REFERENCE_SCALE;
  const glScaledLineWidth = ctx.lineWidth * glScaleFactor;

  // Draw dash-dot line with scale-aware pattern (matching actual gridline)
  ctx.save();
  ctx.lineWidth = glScaledLineWidth;
  ctx.setLineDash(renderCtx.getLineDash('dashdot'));
  ctx.beginPath();
  ctx.moveTo(glStart.x - glDx * glExt, glStart.y - glDy * glExt);
  ctx.lineTo(glEnd.x + glDx * glExt, glEnd.y + glDy * glExt);
  ctx.stroke();
  ctx.restore();

  // Draw bubbles at correct offset (extension + bubbleRadius from endpoint)
  ctx.lineWidth = glScaledLineWidth;
  ctx.setLineDash([]);
  const drawBubble = (cx: number, cy: number) => {
    ctx.beginPath();
    ctx.arc(cx, cy, glRadius, 0, Math.PI * 2);
    ctx.stroke();
    // Label text
    const fSize = glRadius * 1.2;
    ctx.save();
    ctx.fillStyle = strokeColor;
    ctx.font = `${fSize}px ${CAD_DEFAULT_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(glLabel, cx, cy);
    ctx.restore();
  };

  if (glBubblePos === 'start' || glBubblePos === 'both') {
    drawBubble(glStart.x - glDx * (glExt + glRadius), glStart.y - glDy * (glExt + glRadius));
  }
  if (glBubblePos === 'end' || glBubblePos === 'both') {
    drawBubble(glEnd.x + glDx * (glExt + glRadius), glEnd.y + glDy * (glExt + glRadius));
  }
}

// ---------------------------------------------------------------------------
// 3. Level preview
// ---------------------------------------------------------------------------

function drawLevelPreview(
  renderCtx: ShapeRenderContext,
  ctx: CanvasRenderingContext2D,
  preview: any,
  style: any,
  invertColors: boolean,
): void {
  const strokeColor = resolveStrokeColor(style, invertColors);
  const { start: lvStart, end: lvEnd, label: lvLabel, bubbleRadius: lvRadiusRaw } = preview;
  const lvScaleFactor = LINE_DASH_REFERENCE_SCALE / renderCtx.drawingScale;
  const lvRadius = lvRadiusRaw * lvScaleFactor;
  const lvAngle = Math.atan2(lvEnd.y - lvStart.y, lvEnd.x - lvStart.x);
  const lvDx = Math.cos(lvAngle);
  const lvDy = Math.sin(lvAngle);

  ctx.save();
  ctx.setLineDash(renderCtx.getLineDash('dashed'));
  ctx.beginPath();
  ctx.moveTo(lvStart.x, lvStart.y);
  ctx.lineTo(lvEnd.x, lvEnd.y);
  ctx.stroke();
  ctx.restore();

  ctx.setLineDash([]);
  // Right-side (end) triangle marker only
  const lvSz = lvRadius * 0.7;
  const lvTipX = lvEnd.x;
  const lvTipY = lvEnd.y;
  const lvPerpX = -lvDy;
  const lvPerpY = lvDx;
  ctx.beginPath();
  ctx.moveTo(lvTipX, lvTipY);
  ctx.lineTo(lvTipX + lvDx * lvSz + lvPerpX * lvSz * 0.4, lvTipY + lvDy * lvSz + lvPerpY * lvSz * 0.4);
  ctx.lineTo(lvTipX + lvDx * lvSz - lvPerpX * lvSz * 0.4, lvTipY + lvDy * lvSz - lvPerpY * lvSz * 0.4);
  ctx.closePath();
  ctx.fillStyle = strokeColor;
  ctx.fill();
  ctx.stroke();

  // Peil label text to the right
  const lvFSize = lvRadius * 1.0;
  const lvTextX = lvEnd.x + lvDx * (lvSz * 1.5 + lvRadius * 0.3);
  const lvTextY = lvEnd.y + lvDy * (lvSz * 1.5 + lvRadius * 0.3);
  ctx.save();
  ctx.fillStyle = strokeColor;
  ctx.font = `${lvFSize}px ${CAD_DEFAULT_FONT}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  ctx.fillText(lvLabel, lvTextX, lvTextY);
  ctx.restore();
}

// ---------------------------------------------------------------------------
// 4. Puntniveau preview
// ---------------------------------------------------------------------------

function drawPuntniveauPreview(
  renderCtx: ShapeRenderContext,
  ctx: CanvasRenderingContext2D,
  preview: any,
  _style: any,
  _invertColors: boolean,
): void {
  const pnPts = preview.points;
  const pnCurrent = preview.currentPoint;
  const allPnPts = [...pnPts, pnCurrent];

  if (allPnPts.length >= 2) {
    ctx.save();
    ctx.setLineDash(renderCtx.getLineDash('dashed'));
    ctx.beginPath();
    ctx.moveTo(allPnPts[0].x, allPnPts[0].y);
    for (let pi = 1; pi < allPnPts.length; pi++) {
      ctx.lineTo(allPnPts[pi].x, allPnPts[pi].y);
    }
    ctx.lineTo(allPnPts[0].x, allPnPts[0].y);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------
// 5. Pile preview
// ---------------------------------------------------------------------------

function drawPilePreview(
  renderCtx: ShapeRenderContext,
  _ctx: CanvasRenderingContext2D,
  preview: any,
  _style: any,
  _invertColors: boolean,
): void {
  const { position: pilePos, diameter: pileDiam, label: pileLabel, fontSize: pileFontSize, contourType: pileContour = 'circle', fillPattern: pileFill = 6 } = preview;
  const pileRadius = pileDiam / 2;

  drawPilePreviewSymbol(
    renderCtx,
    pilePos.x, pilePos.y, pileRadius,
    pileContour, pileFill,
    pileLabel, pileFontSize,
  );
}

// ---------------------------------------------------------------------------
// 6. CPT preview
// ---------------------------------------------------------------------------

function drawCptPreview(
  renderCtx: ShapeRenderContext,
  ctx: CanvasRenderingContext2D,
  preview: any,
  style: any,
  invertColors: boolean,
): void {
  const strokeColor = resolveStrokeColor(style, invertColors);
  const { position: cptPos, name: cptName, fontSize: cptFontSize, markerSize: cptMarkerSize } = preview;
  const cptSf = LINE_DASH_REFERENCE_SCALE / renderCtx.drawingScale;
  const ms = cptMarkerSize * cptSf;

  // Draw inverted triangle marker
  ctx.beginPath();
  ctx.moveTo(cptPos.x, cptPos.y - ms * 0.6);
  ctx.lineTo(cptPos.x - ms * 0.5, cptPos.y + ms * 0.4);
  ctx.lineTo(cptPos.x + ms * 0.5, cptPos.y + ms * 0.4);
  ctx.closePath();
  ctx.stroke();

  // Draw name below
  if (cptName) {
    ctx.save();
    ctx.fillStyle = strokeColor;
    ctx.font = `${cptFontSize * cptSf}px ${CAD_DEFAULT_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(cptName, cptPos.x, cptPos.y + ms * 0.4 + cptFontSize * cptSf * 0.3);
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------
// 7. Wall preview (straight + arc + hatch)
// ---------------------------------------------------------------------------

function drawWallPreview(
  renderCtx: ShapeRenderContext,
  ctx: CanvasRenderingContext2D,
  preview: any,
  _style: any,
  _invertColors: boolean,
): void {
  const { start: wStart, end: wEnd, thickness: wThick, showCenterline: wShowCL } = preview;

  // Arc wall preview
  if (preview.bulge && Math.abs(preview.bulge) > 0.0001) {
    const wArc = bulgeToArc(wStart, wEnd, preview.bulge);
    const wArcJust = ('justification' in preview ? preview.justification : undefined) || 'center';
    let wArcInnerR: number;
    let wArcOuterR: number;
    if (wArcJust === 'left') {
      // "Left justified" = left face on draw line, wall extends to the right.
      if (wArc.clockwise) {
        wArcInnerR = wArc.radius;
        wArcOuterR = wArc.radius + wThick;
      } else {
        wArcInnerR = wArc.radius - wThick;
        wArcOuterR = wArc.radius;
      }
    } else if (wArcJust === 'right') {
      // "Right justified" = right face on draw line, wall extends to the left.
      if (wArc.clockwise) {
        wArcInnerR = wArc.radius - wThick;
        wArcOuterR = wArc.radius;
      } else {
        wArcInnerR = wArc.radius;
        wArcOuterR = wArc.radius + wThick;
      }
    } else {
      wArcInnerR = wArc.radius - wThick / 2;
      wArcOuterR = wArc.radius + wThick / 2;
    }
    if (wArcInnerR < 0) wArcInnerR = 0;

    // Draw arc wall outline
    ctx.beginPath();
    ctx.arc(wArc.center.x, wArc.center.y, wArcOuterR, wArc.startAngle, wArc.endAngle, wArc.clockwise);
    ctx.lineTo(wArc.center.x + wArcInnerR * Math.cos(wArc.endAngle), wArc.center.y + wArcInnerR * Math.sin(wArc.endAngle));
    ctx.arc(wArc.center.x, wArc.center.y, wArcInnerR, wArc.endAngle, wArc.startAngle, !wArc.clockwise);
    ctx.closePath();
    ctx.stroke();

    // Hatch fill preview
    {
      let previewMatSetting = renderCtx.materialHatchSettings['concrete'] || DEFAULT_MATERIAL_HATCH_SETTINGS['concrete'];
      if (preview.wallTypeId) {
        const previewWallType = renderCtx.wallTypes.find(wt => wt.id === preview.wallTypeId);
        if (previewWallType) {
          previewMatSetting = renderCtx.materialHatchSettings[previewWallType.name]
            || renderCtx.materialHatchSettings[previewWallType.material]
            || DEFAULT_MATERIAL_HATCH_SETTINGS[previewWallType.material]
            || previewMatSetting;
        }
      }
      const previewHatch = previewMatSetting;
      if ((previewHatch.hatchType && previewHatch.hatchType !== 'none') || previewHatch.hatchPatternId) {
        const previewStrokeWidth = ctx.lineWidth;
        ctx.save();
        // Clip to arc wall path
        ctx.beginPath();
        ctx.arc(wArc.center.x, wArc.center.y, wArcOuterR, wArc.startAngle, wArc.endAngle, wArc.clockwise);
        ctx.lineTo(wArc.center.x + wArcInnerR * Math.cos(wArc.endAngle), wArc.center.y + wArcInnerR * Math.sin(wArc.endAngle));
        ctx.arc(wArc.center.x, wArc.center.y, wArcInnerR, wArc.endAngle, wArc.startAngle, !wArc.clockwise);
        ctx.closePath();
        ctx.clip();

        ctx.lineWidth = previewStrokeWidth * 0.4;
        ctx.setLineDash([]);

        if (previewHatch.backgroundColor) {
          ctx.fillStyle = previewHatch.backgroundColor;
          ctx.beginPath();
          ctx.arc(wArc.center.x, wArc.center.y, wArcOuterR, wArc.startAngle, wArc.endAngle, wArc.clockwise);
          ctx.lineTo(wArc.center.x + wArcInnerR * Math.cos(wArc.endAngle), wArc.center.y + wArcInnerR * Math.sin(wArc.endAngle));
          ctx.arc(wArc.center.x, wArc.center.y, wArcInnerR, wArc.endAngle, wArc.startAngle, !wArc.clockwise);
          ctx.closePath();
          ctx.fill();
        }

        const wArcSpacing = previewHatch.hatchSpacing || 50;
        const wArcHatchColor = previewHatch.hatchColor || (ctx.strokeStyle as string);
        ctx.strokeStyle = wArcHatchColor;

        // Check for insulation pattern (NEN standard zigzag)
        const wArcPreviewPattern = previewHatch.hatchPatternId ? renderCtx.getPatternById(previewHatch.hatchPatternId) : undefined;
        if (wArcPreviewPattern && (previewHatch.hatchPatternId === 'nen47-isolatie' || previewHatch.hatchPatternId === 'insulation')) {
          renderCtx.drawInsulationZigzagArc(
            wArc.center, wArcInnerR, wArcOuterR,
            wArc.startAngle, wArc.endAngle, wArc.clockwise,
            wArcHatchColor,
            previewStrokeWidth
          );
        } else if (previewHatch.hatchType === 'solid') {
          ctx.fillStyle = wArcHatchColor;
          ctx.beginPath();
          ctx.arc(wArc.center.x, wArc.center.y, wArcOuterR, wArc.startAngle, wArc.endAngle, wArc.clockwise);
          ctx.lineTo(wArc.center.x + wArcInnerR * Math.cos(wArc.endAngle), wArc.center.y + wArcInnerR * Math.sin(wArc.endAngle));
          ctx.arc(wArc.center.x, wArc.center.y, wArcInnerR, wArc.endAngle, wArc.startAngle, !wArc.clockwise);
          ctx.closePath();
          ctx.fill();
        } else {
          // Radial hatch lines for arc wall preview
          const wArcAngularStep = wArcSpacing / wArc.radius;
          const wArcStep = wArc.clockwise ? -wArcAngularStep : wArcAngularStep;
          ctx.beginPath();
          let wA = wArc.startAngle + wArcStep;
          for (let wi = 0; wi < 10000; wi++) {
            // Check if angle is still in range
            const wNorm = wArc.clockwise
              ? ((wArc.startAngle - wA + Math.PI * 4) % (Math.PI * 2))
              : ((wA - wArc.startAngle + Math.PI * 4) % (Math.PI * 2));
            const wEndNorm = wArc.clockwise
              ? ((wArc.startAngle - wArc.endAngle + Math.PI * 4) % (Math.PI * 2))
              : ((wArc.endAngle - wArc.startAngle + Math.PI * 4) % (Math.PI * 2));
            if (wNorm > wEndNorm + 0.0001) break;
            ctx.moveTo(wArc.center.x + wArcInnerR * Math.cos(wA), wArc.center.y + wArcInnerR * Math.sin(wA));
            ctx.lineTo(wArc.center.x + wArcOuterR * Math.cos(wA), wArc.center.y + wArcOuterR * Math.sin(wA));
            wA += wArcStep;
          }
          ctx.stroke();
        }

        ctx.restore();
      }
    }

    // Draw centerline arc (dashed)
    if (wShowCL) {
      ctx.save();
      ctx.setLineDash(renderCtx.getLineDash('dashdot'));
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.beginPath();
      ctx.arc(wArc.center.x, wArc.center.y, wArc.radius, wArc.startAngle, wArc.endAngle, wArc.clockwise);
      ctx.stroke();
      ctx.restore();
    }
    return;
  }

  const wallAngle = Math.atan2(wEnd.y - wStart.y, wEnd.x - wStart.x);

  // Determine asymmetric offsets based on justification
  const wJust = ('justification' in preview ? preview.justification : undefined) || 'center';
  let wLeftThick: number;
  let wRightThick: number;
  if (wJust === 'left') {
    // "Left justified" = left face on draw line, wall extends to the right
    wLeftThick = 0;
    wRightThick = wThick;
  } else if (wJust === 'right') {
    // "Right justified" = right face on draw line, wall extends to the left
    wLeftThick = wThick;
    wRightThick = 0;
  } else {
    wLeftThick = wThick / 2;
    wRightThick = wThick / 2;
  }

  const wPerpUnitX = Math.sin(wallAngle);
  const wPerpUnitY = Math.cos(wallAngle);

  const wCorners = [
    { x: wStart.x + wPerpUnitX * wLeftThick, y: wStart.y - wPerpUnitY * wLeftThick },
    { x: wEnd.x + wPerpUnitX * wLeftThick, y: wEnd.y - wPerpUnitY * wLeftThick },
    { x: wEnd.x - wPerpUnitX * wRightThick, y: wEnd.y + wPerpUnitY * wRightThick },
    { x: wStart.x - wPerpUnitX * wRightThick, y: wStart.y + wPerpUnitY * wRightThick },
  ];

  // Draw wall outline
  ctx.beginPath();
  ctx.moveTo(wCorners[0].x, wCorners[0].y);
  ctx.lineTo(wCorners[1].x, wCorners[1].y);
  ctx.lineTo(wCorners[2].x, wCorners[2].y);
  ctx.lineTo(wCorners[3].x, wCorners[3].y);
  ctx.closePath();
  ctx.stroke();

  // Hatch fill preview - use materialHatchSettings (resolve from wall type or default to concrete)
  {
    // Resolve the material from the pending wall type, falling back to concrete
    let previewMatSetting = renderCtx.materialHatchSettings['concrete'] || DEFAULT_MATERIAL_HATCH_SETTINGS['concrete'];
    if (preview.wallTypeId) {
      const previewWallType = renderCtx.wallTypes.find(wt => wt.id === preview.wallTypeId);
      if (previewWallType) {
        previewMatSetting = renderCtx.materialHatchSettings[previewWallType.name]
          || renderCtx.materialHatchSettings[previewWallType.material]
          || DEFAULT_MATERIAL_HATCH_SETTINGS[previewWallType.material]
          || previewMatSetting;
      }
    }
    const previewHatch = previewMatSetting;
    if ((previewHatch.hatchType && previewHatch.hatchType !== 'none') || previewHatch.hatchPatternId) {
      const previewStrokeWidth = ctx.lineWidth;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(wCorners[0].x, wCorners[0].y);
      ctx.lineTo(wCorners[1].x, wCorners[1].y);
      ctx.lineTo(wCorners[2].x, wCorners[2].y);
      ctx.lineTo(wCorners[3].x, wCorners[3].y);
      ctx.closePath();
      ctx.clip();

      ctx.lineWidth = previewStrokeWidth * 0.4;
      ctx.setLineDash([]);

      // Fill solid background color first (under hatch lines)
      if (previewHatch.backgroundColor) {
        ctx.fillStyle = previewHatch.backgroundColor;
        ctx.beginPath();
        ctx.moveTo(wCorners[0].x, wCorners[0].y);
        ctx.lineTo(wCorners[1].x, wCorners[1].y);
        ctx.lineTo(wCorners[2].x, wCorners[2].y);
        ctx.lineTo(wCorners[3].x, wCorners[3].y);
        ctx.closePath();
        ctx.fill();
      }

      const wMinX = Math.min(...wCorners.map(c => c.x));
      const wMinY = Math.min(...wCorners.map(c => c.y));
      const wMaxX = Math.max(...wCorners.map(c => c.x));
      const wMaxY = Math.max(...wCorners.map(c => c.y));

      const wSpacing = previewHatch.hatchSpacing || 50;
      const wHatchColor = previewHatch.hatchColor || (ctx.strokeStyle as string);
      ctx.strokeStyle = wHatchColor;
      // Make hatch perpendicular to wall direction
      const wAngleDeg = wallAngle * 180 / Math.PI;

      const previewPattern = previewHatch.hatchPatternId ? renderCtx.getPatternById(previewHatch.hatchPatternId) : undefined;
      if (previewPattern && previewPattern.lineFamilies.length > 0) {
        const pScale = wSpacing / 10;
        // Special case: insulation patterns get zigzag rendering (NEN standard)
        if (previewHatch.hatchPatternId === 'nen47-isolatie' || previewHatch.hatchPatternId === 'insulation') {
          renderCtx.drawInsulationZigzag(wMinX, wMinY, wMaxX, wMaxY, pScale, wAngleDeg, wHatchColor, previewStrokeWidth, wThick);
        } else {
          renderCtx.drawCustomPatternLines(previewPattern.lineFamilies, wMinX, wMinY, wMaxX, wMaxY, pScale, wAngleDeg, wHatchColor, previewStrokeWidth);
        }
      } else if (previewPattern && previewPattern.lineFamilies.length === 0) {
        ctx.fillStyle = wHatchColor;
        ctx.beginPath();
        ctx.moveTo(wCorners[0].x, wCorners[0].y);
        ctx.lineTo(wCorners[1].x, wCorners[1].y);
        ctx.lineTo(wCorners[2].x, wCorners[2].y);
        ctx.lineTo(wCorners[3].x, wCorners[3].y);
        ctx.closePath();
        ctx.fill();
      } else {
        const wBaseAngle = (previewHatch.hatchAngle || 45) + wAngleDeg;
        if (previewHatch.hatchType === 'solid') {
          ctx.fillStyle = wHatchColor;
          ctx.beginPath();
          ctx.moveTo(wCorners[0].x, wCorners[0].y);
          ctx.lineTo(wCorners[1].x, wCorners[1].y);
          ctx.lineTo(wCorners[2].x, wCorners[2].y);
          ctx.lineTo(wCorners[3].x, wCorners[3].y);
          ctx.closePath();
          ctx.fill();
        } else if (previewHatch.hatchType === 'diagonal') {
          renderCtx.drawLineFamilySimple(wBaseAngle, wSpacing, wMinX, wMinY, wMaxX, wMaxY);
        } else if (previewHatch.hatchType === 'crosshatch') {
          renderCtx.drawLineFamilySimple(wBaseAngle, wSpacing, wMinX, wMinY, wMaxX, wMaxY);
          renderCtx.drawLineFamilySimple(wBaseAngle + 90, wSpacing, wMinX, wMinY, wMaxX, wMaxY);
        } else if (previewHatch.hatchType === 'horizontal') {
          renderCtx.drawLineFamilySimple(wAngleDeg + 90, wSpacing, wMinX, wMinY, wMaxX, wMaxY);
        }
      }

      ctx.restore();
    }
  }

  // Draw centerline (dashed)
  if (wShowCL) {
    ctx.save();
    ctx.setLineDash(renderCtx.getLineDash('dashdot'));
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.beginPath();
    ctx.moveTo(wStart.x, wStart.y);
    ctx.lineTo(wEnd.x, wEnd.y);
    ctx.stroke();
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------
// 8. Wall-rectangle preview
// ---------------------------------------------------------------------------

function drawWallRectanglePreview(
  renderCtx: ShapeRenderContext,
  ctx: CanvasRenderingContext2D,
  preview: any,
  _style: any,
  _invertColors: boolean,
): void {
  const { corner1: wrC1, corner2: wrC2, thickness: wrThick, showCenterline: wrShowCL } = preview;
  // Derive corners (axis-aligned rectangle)
  const wrCorners = [
    wrC1,
    { x: wrC2.x, y: wrC1.y },
    wrC2,
    { x: wrC1.x, y: wrC2.y },
  ];

  const wrJust = ('justification' in preview ? preview.justification : undefined) || 'center';

  // Draw 4 wall segments as rectangles (with thickness)
  for (let i = 0; i < 4; i++) {
    const wrs = wrCorners[i];
    const wre = wrCorners[(i + 1) % 4];
    const wrAngle = Math.atan2(wre.y - wrs.y, wre.x - wrs.x);

    let wrLeft: number, wrRight: number;
    if (wrJust === 'left') { wrLeft = 0; wrRight = wrThick; }
    else if (wrJust === 'right') { wrLeft = wrThick; wrRight = 0; }
    else { wrLeft = wrThick / 2; wrRight = wrThick / 2; }

    const wrPx = Math.sin(wrAngle);
    const wrPy = Math.cos(wrAngle);

    const wrSegCorners = [
      { x: wrs.x + wrPx * wrLeft, y: wrs.y - wrPy * wrLeft },
      { x: wre.x + wrPx * wrLeft, y: wre.y - wrPy * wrLeft },
      { x: wre.x - wrPx * wrRight, y: wre.y + wrPy * wrRight },
      { x: wrs.x - wrPx * wrRight, y: wrs.y + wrPy * wrRight },
    ];

    ctx.beginPath();
    ctx.moveTo(wrSegCorners[0].x, wrSegCorners[0].y);
    ctx.lineTo(wrSegCorners[1].x, wrSegCorners[1].y);
    ctx.lineTo(wrSegCorners[2].x, wrSegCorners[2].y);
    ctx.lineTo(wrSegCorners[3].x, wrSegCorners[3].y);
    ctx.closePath();
    ctx.stroke();

    // Centerline
    if (wrShowCL) {
      ctx.save();
      ctx.setLineDash(renderCtx.getLineDash('dashdot'));
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.beginPath();
      ctx.moveTo(wrs.x, wrs.y);
      ctx.lineTo(wre.x, wre.y);
      ctx.stroke();
      ctx.restore();
    }
  }
}

// ---------------------------------------------------------------------------
// 9. Beam-rectangle preview
// ---------------------------------------------------------------------------

function drawBeamRectanglePreview(
  renderCtx: ShapeRenderContext,
  ctx: CanvasRenderingContext2D,
  preview: any,
  _style: any,
  _invertColors: boolean,
): void {
  const { corner1: brC1, corner2: brC2, flangeWidth: brFW, showCenterline: brShowCL } = preview;
  const brCorners = [
    brC1,
    { x: brC2.x, y: brC1.y },
    brC2,
    { x: brC1.x, y: brC2.y },
  ];

  const brHalfW = brFW / 2;
  for (let i = 0; i < 4; i++) {
    const brs = brCorners[i];
    const bre = brCorners[(i + 1) % 4];
    const brAngle = Math.atan2(bre.y - brs.y, bre.x - brs.x);
    const brPx = Math.sin(brAngle);
    const brPy = Math.cos(brAngle);

    const brSegCorners = [
      { x: brs.x + brPx * brHalfW, y: brs.y - brPy * brHalfW },
      { x: bre.x + brPx * brHalfW, y: bre.y - brPy * brHalfW },
      { x: bre.x - brPx * brHalfW, y: bre.y + brPy * brHalfW },
      { x: brs.x - brPx * brHalfW, y: brs.y + brPy * brHalfW },
    ];

    ctx.beginPath();
    ctx.moveTo(brSegCorners[0].x, brSegCorners[0].y);
    ctx.lineTo(brSegCorners[1].x, brSegCorners[1].y);
    ctx.lineTo(brSegCorners[2].x, brSegCorners[2].y);
    ctx.lineTo(brSegCorners[3].x, brSegCorners[3].y);
    ctx.closePath();
    ctx.stroke();

    // Centerline
    if (brShowCL) {
      ctx.save();
      ctx.setLineDash(renderCtx.getLineDash('dashdot'));
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.beginPath();
      ctx.moveTo(brs.x, brs.y);
      ctx.lineTo(bre.x, bre.y);
      ctx.stroke();
      ctx.restore();
    }
  }
}

// ---------------------------------------------------------------------------
// 10. Wall-circle preview
// ---------------------------------------------------------------------------

function drawWallCirclePreview(
  renderCtx: ShapeRenderContext,
  ctx: CanvasRenderingContext2D,
  preview: any,
  _style: any,
  _invertColors: boolean,
): void {
  const { center: wcCenter, radius: wcRadius, thickness: wcThick, showCenterline: wcShowCL } = preview;
  const wcJust = ('justification' in preview ? preview.justification : undefined) || 'center';

  let wcInnerR: number, wcOuterR: number;
  if (wcJust === 'left') {
    // "Left justified" = left face on draw line, wall extends to the right
    wcInnerR = wcRadius - wcThick;
    wcOuterR = wcRadius;
  } else if (wcJust === 'right') {
    // "Right justified" = right face on draw line, wall extends to the left
    wcInnerR = wcRadius;
    wcOuterR = wcRadius + wcThick;
  } else {
    wcInnerR = wcRadius - wcThick / 2;
    wcOuterR = wcRadius + wcThick / 2;
  }
  if (wcInnerR < 0) wcInnerR = 0;

  // Outer circle
  ctx.beginPath();
  ctx.arc(wcCenter.x, wcCenter.y, wcOuterR, 0, Math.PI * 2);
  ctx.stroke();

  // Inner circle
  if (wcInnerR > 0) {
    ctx.beginPath();
    ctx.arc(wcCenter.x, wcCenter.y, wcInnerR, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Centerline circle
  if (wcShowCL) {
    ctx.save();
    ctx.setLineDash(renderCtx.getLineDash('dashdot'));
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.beginPath();
    ctx.arc(wcCenter.x, wcCenter.y, wcRadius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // Cross at center
  const wcCrossSize = Math.max(20, wcRadius * 0.05);
  ctx.beginPath();
  ctx.moveTo(wcCenter.x - wcCrossSize, wcCenter.y);
  ctx.lineTo(wcCenter.x + wcCrossSize, wcCenter.y);
  ctx.moveTo(wcCenter.x, wcCenter.y - wcCrossSize);
  ctx.lineTo(wcCenter.x, wcCenter.y + wcCrossSize);
  ctx.stroke();
}

// ---------------------------------------------------------------------------
// 11. Beam-circle preview
// ---------------------------------------------------------------------------

function drawBeamCirclePreview(
  renderCtx: ShapeRenderContext,
  ctx: CanvasRenderingContext2D,
  preview: any,
  _style: any,
  _invertColors: boolean,
): void {
  const { center: bcCenter, radius: bcRadius, flangeWidth: bcFW, showCenterline: bcShowCL } = preview;
  const bcHalfW = bcFW / 2;
  const bcInnerR = Math.max(0, bcRadius - bcHalfW);
  const bcOuterR = bcRadius + bcHalfW;

  // Outer circle
  ctx.beginPath();
  ctx.arc(bcCenter.x, bcCenter.y, bcOuterR, 0, Math.PI * 2);
  ctx.stroke();

  // Inner circle
  if (bcInnerR > 0) {
    ctx.beginPath();
    ctx.arc(bcCenter.x, bcCenter.y, bcInnerR, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Centerline circle
  if (bcShowCL) {
    ctx.save();
    ctx.setLineDash(renderCtx.getLineDash('dashdot'));
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.beginPath();
    ctx.arc(bcCenter.x, bcCenter.y, bcRadius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // Cross at center
  const bcCrossSize = Math.max(20, bcRadius * 0.05);
  ctx.beginPath();
  ctx.moveTo(bcCenter.x - bcCrossSize, bcCenter.y);
  ctx.lineTo(bcCenter.x + bcCrossSize, bcCenter.y);
  ctx.moveTo(bcCenter.x, bcCenter.y - bcCrossSize);
  ctx.lineTo(bcCenter.x, bcCenter.y + bcCrossSize);
  ctx.stroke();
}

// ---------------------------------------------------------------------------
// 12. Slab preview
// ---------------------------------------------------------------------------

function drawSlabPreview(
  renderCtx: ShapeRenderContext,
  ctx: CanvasRenderingContext2D,
  preview: any,
  _style: any,
  _invertColors: boolean,
): void {
  const slabPts = preview.points;
  const slabCurrent = preview.currentPoint;
  const allSlabPts = [...slabPts, slabCurrent];

  if (allSlabPts.length >= 2) {
    ctx.beginPath();
    ctx.moveTo(allSlabPts[0].x, allSlabPts[0].y);
    for (let si = 1; si < allSlabPts.length; si++) {
      ctx.lineTo(allSlabPts[si].x, allSlabPts[si].y);
    }
    ctx.lineTo(allSlabPts[0].x, allSlabPts[0].y);
    ctx.closePath();
    ctx.stroke();

    // Slab preview: outline only, no fill/hatch during placement

    for (const pt of slabPts) {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 3 / renderCtx.currentZoom, 0, Math.PI * 2);
      ctx.fillStyle = COLORS.commandPreview;
      ctx.fill();
    }
  }
}

// ---------------------------------------------------------------------------
// 12b. Slab-opening preview
// ---------------------------------------------------------------------------

function drawSlabOpeningPreview(
  renderCtx: ShapeRenderContext,
  ctx: CanvasRenderingContext2D,
  preview: any,
  _style: any,
  _invertColors: boolean,
): void {
  const soPts = preview.points;
  const soCurrent = preview.currentPoint;
  const allSoPts = [...soPts, soCurrent];

  if (allSoPts.length >= 2) {
    // Draw closed outline
    ctx.beginPath();
    ctx.moveTo(allSoPts[0].x, allSoPts[0].y);
    for (let si = 1; si < allSoPts.length; si++) {
      ctx.lineTo(allSoPts[si].x, allSoPts[si].y);
    }
    ctx.lineTo(allSoPts[0].x, allSoPts[0].y);
    ctx.closePath();
    ctx.stroke();

    // Draw cross from bounding box corners (preview)
    if (allSoPts.length >= 3) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const p of allSoPts) {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      }
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(allSoPts[0].x, allSoPts[0].y);
      for (let si = 1; si < allSoPts.length; si++) {
        ctx.lineTo(allSoPts[si].x, allSoPts[si].y);
      }
      ctx.closePath();
      ctx.clip();
      ctx.beginPath();
      ctx.moveTo(minX, minY);
      ctx.lineTo(maxX, maxY);
      ctx.moveTo(maxX, minY);
      ctx.lineTo(minX, maxY);
      ctx.stroke();
      ctx.restore();
    }

    // Draw vertex dots
    for (const pt of soPts) {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 3 / renderCtx.currentZoom, 0, Math.PI * 2);
      ctx.fillStyle = COLORS.commandPreview;
      ctx.fill();
    }
  }
}

// ---------------------------------------------------------------------------
// 13. Plate-system preview
// ---------------------------------------------------------------------------

function drawPlateSystemPreview(
  renderCtx: ShapeRenderContext,
  ctx: CanvasRenderingContext2D,
  preview: any,
  _style: any,
  _invertColors: boolean,
): void {
  const psPts = preview.points;
  const psCurrent = preview.currentPoint;
  const psBulges = preview.bulges;
  const psCurrentBulge = preview.currentBulge ?? 0;
  const psArcThrough = preview.arcThroughPoint;
  const allPsPts = [...psPts, psCurrent];

  // Helper to build the preview contour path with bulge arcs
  const buildPsPreviewPath = () => {
    ctx.moveTo(allPsPts[0].x, allPsPts[0].y);
    for (let si = 0; si < allPsPts.length; si++) {
      const sj = (si + 1) % allPsPts.length;
      // Determine bulge for this segment
      let b = 0;
      if (si < psPts.length - 1) {
        // Confirmed segment between two placed vertices
        b = psBulges?.[si] ?? 0;
      } else if (si === psPts.length - 1 && si < allPsPts.length - 1) {
        // Live edge: from last placed vertex to current mouse position
        b = psCurrentBulge;
      }
      // Closing segment back to first vertex (sj === 0 when si === allPsPts.length - 1)
      // stays straight (b = 0)

      if (b !== 0 && Math.abs(b) > 0.0001) {
        const arc = bulgeToArc(allPsPts[si], allPsPts[sj], b);
        ctx.arc(arc.center.x, arc.center.y, arc.radius, arc.startAngle, arc.endAngle, arc.clockwise);
      } else if (sj !== 0) {
        ctx.lineTo(allPsPts[sj].x, allPsPts[sj].y);
      } else {
        ctx.closePath();
      }
    }
  };

  if (allPsPts.length >= 2) {
    // Draw the contour polygon outline (with arc segments)
    ctx.beginPath();
    buildPsPreviewPath();
    ctx.stroke();

    // Light fill
    if (allPsPts.length >= 3) {
      ctx.save();
      ctx.fillStyle = 'rgba(253, 244, 227, 0.15)';
      ctx.beginPath();
      buildPsPreviewPath();
      ctx.fill();

      // Clip to contour and draw joist preview lines
      ctx.beginPath();
      buildPsPreviewPath();
      ctx.clip();

      const psDir = preview.mainProfile.direction;
      const psSpacing = preview.mainProfile.spacing;
      const psCosD = Math.cos(psDir);
      const psSinD = Math.sin(psDir);

      // Get bounding box
      let psMinX = Infinity, psMinY = Infinity, psMaxX = -Infinity, psMaxY = -Infinity;
      for (const p of allPsPts) {
        if (p.x < psMinX) psMinX = p.x;
        if (p.y < psMinY) psMinY = p.y;
        if (p.x > psMaxX) psMaxX = p.x;
        if (p.y > psMaxY) psMaxY = p.y;
      }

      const psDiag = Math.sqrt((psMaxX - psMinX) ** 2 + (psMaxY - psMinY) ** 2);
      const psCx = (psMinX + psMaxX) / 2;
      const psCy = (psMinY + psMaxY) / 2;
      const psNorm = { x: -psSinD, y: psCosD };
      const psNumLines = Math.ceil(psDiag / psSpacing) + 1;

      ctx.strokeStyle = 'rgba(200, 160, 80, 0.6)';
      ctx.lineWidth = preview.mainProfile.width * 0.15;
      ctx.setLineDash([]);

      for (let i = -psNumLines; i <= psNumLines; i++) {
        const offset = i * psSpacing;
        const ox = psCx + psNorm.x * offset;
        const oy = psCy + psNorm.y * offset;
        ctx.beginPath();
        ctx.moveTo(ox - psCosD * psDiag, oy - psSinD * psDiag);
        ctx.lineTo(ox + psCosD * psDiag, oy + psSinD * psDiag);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Closing line to first point (dashed)
    if (psPts.length >= 2) {
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.globalAlpha = 0.4;
      ctx.beginPath();
      ctx.moveTo(psCurrent.x, psCurrent.y);
      ctx.lineTo(psPts[0].x, psPts[0].y);
      ctx.stroke();
      ctx.restore();
    }

    // Draw arc through-point indicator (small diamond)
    if (psArcThrough) {
      const sz = 4 / renderCtx.currentZoom;
      ctx.save();
      ctx.fillStyle = '#ff8800';
      ctx.beginPath();
      ctx.moveTo(psArcThrough.x, psArcThrough.y - sz);
      ctx.lineTo(psArcThrough.x + sz, psArcThrough.y);
      ctx.lineTo(psArcThrough.x, psArcThrough.y + sz);
      ctx.lineTo(psArcThrough.x - sz, psArcThrough.y);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // Draw vertex dots
    for (const pt of psPts) {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 3 / renderCtx.currentZoom, 0, Math.PI * 2);
      ctx.fillStyle = COLORS.commandPreview;
      ctx.fill();
    }
  }
}

// ---------------------------------------------------------------------------
// 14. Section-callout preview
// ---------------------------------------------------------------------------

function drawSectionCalloutPreview(
  renderCtx: ShapeRenderContext,
  ctx: CanvasRenderingContext2D,
  preview: any,
  style: any,
  invertColors: boolean,
): void {
  const strokeColor = resolveStrokeColor(style, invertColors);
  const { start: scStart, end: scEnd, label: scLabel, bubbleRadius: scRadiusRaw, flipDirection: scFlip } = preview;
  const scScaleFactor = LINE_DASH_REFERENCE_SCALE / renderCtx.drawingScale;
  const scRadius = scRadiusRaw * scScaleFactor;
  const scAngle = Math.atan2(scEnd.y - scStart.y, scEnd.x - scStart.x);
  const scDx = Math.cos(scAngle);
  const scDy = Math.sin(scAngle);

  // Perpendicular direction for arrows (viewing direction, negated so default points correct way)
  const perpSign = scFlip ? 1 : -1;
  const scPerpX = -scDy * perpSign;
  const scPerpY = scDx * perpSign;

  // Draw view depth area preview
  const scViewDepth = preview.viewDepth ?? 5000;
  if (scViewDepth > 0) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(scStart.x, scStart.y);
    ctx.lineTo(scEnd.x, scEnd.y);
    ctx.lineTo(scEnd.x + scPerpX * scViewDepth, scEnd.y + scPerpY * scViewDepth);
    ctx.lineTo(scStart.x + scPerpX * scViewDepth, scStart.y + scPerpY * scViewDepth);
    ctx.closePath();
    ctx.fillStyle = 'rgba(100, 180, 255, 0.08)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(100, 180, 255, 0.4)';
    ctx.lineWidth = ctx.lineWidth || 1;
    ctx.setLineDash([scRadius * 0.15, scRadius * 0.1]);
    ctx.beginPath();
    ctx.moveTo(scStart.x + scPerpX * scViewDepth, scStart.y + scPerpY * scViewDepth);
    ctx.lineTo(scEnd.x + scPerpX * scViewDepth, scEnd.y + scPerpY * scViewDepth);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  // Draw the cut line: thick dash pattern (long-dash, short-dash, long-dash)
  ctx.save();
  ctx.lineWidth = ctx.lineWidth * 2;
  ctx.setLineDash([scRadius * 0.3, scRadius * 0.15, scRadius * 0.05, scRadius * 0.15]);
  ctx.beginPath();
  ctx.moveTo(scStart.x, scStart.y);
  ctx.lineTo(scEnd.x, scEnd.y);
  ctx.stroke();
  ctx.restore();

  // Draw simple text labels at endpoints (NO circles/bubbles)
  ctx.setLineDash([]);
  const scLabelOffset = scRadius * 1.2;
  const drawSCLabel = (px: number, py: number, offsetDx: number, offsetDy: number) => {
    const lx = px + offsetDx * scLabelOffset;
    const ly = py + offsetDy * scLabelOffset;
    const fSize = scRadius * 1.7;
    ctx.save();
    ctx.fillStyle = strokeColor;
    ctx.font = `bold ${fSize}px ${CAD_DEFAULT_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(scLabel, lx, ly);
    ctx.restore();
  };

  // Labels at both endpoints (offset outward along line direction)
  drawSCLabel(scStart.x, scStart.y, -scDx, -scDy);
  drawSCLabel(scEnd.x, scEnd.y, scDx, scDy);

  // Direction arrows at each endpoint - short perpendicular lines showing viewing direction
  const arrowLen = scRadius * 1.5;
  ctx.lineWidth = ctx.lineWidth || 1;
  ctx.beginPath();
  // Arrow at start endpoint
  ctx.moveTo(scStart.x, scStart.y);
  ctx.lineTo(scStart.x + scPerpX * arrowLen, scStart.y + scPerpY * arrowLen);
  // Arrow at end endpoint
  ctx.moveTo(scEnd.x, scEnd.y);
  ctx.lineTo(scEnd.x + scPerpX * arrowLen, scEnd.y + scPerpY * arrowLen);
  ctx.stroke();

  // Draw arrowheads on the perpendicular lines
  const arrowHeadSize = scRadius * 0.5;
  const drawArrowHead = (tipX: number, tipY: number, dirX: number, dirY: number) => {
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(tipX - dirX * arrowHeadSize + dirY * arrowHeadSize * 0.4, tipY - dirY * arrowHeadSize - dirX * arrowHeadSize * 0.4);
    ctx.lineTo(tipX - dirX * arrowHeadSize - dirY * arrowHeadSize * 0.4, tipY - dirY * arrowHeadSize + dirX * arrowHeadSize * 0.4);
    ctx.closePath();
    ctx.fillStyle = strokeColor;
    ctx.fill();
  };

  drawArrowHead(scStart.x + scPerpX * arrowLen, scStart.y + scPerpY * arrowLen, scPerpX, scPerpY);
  drawArrowHead(scEnd.x + scPerpX * arrowLen, scEnd.y + scPerpY * arrowLen, scPerpX, scPerpY);
}

// ---------------------------------------------------------------------------
// 15. Spot-elevation preview
// ---------------------------------------------------------------------------

function drawSpotElevationPreview(
  renderCtx: ShapeRenderContext,
  ctx: CanvasRenderingContext2D,
  preview: any,
  style: any,
  invertColors: boolean,
): void {
  const strokeColor = resolveStrokeColor(style, invertColors);
  const { position: sePos, elevation: seElev, labelPosition: seLabelPos, showLeader: seShowLeader } = preview;
  const seScaleFactor = LINE_DASH_REFERENCE_SCALE / renderCtx.drawingScale;
  const seMarkerSize = 150 * seScaleFactor;
  const seFontSize = 250 * seScaleFactor;

  // Draw cross marker
  ctx.beginPath();
  ctx.moveTo(sePos.x - seMarkerSize, sePos.y);
  ctx.lineTo(sePos.x + seMarkerSize, sePos.y);
  ctx.moveTo(sePos.x, sePos.y - seMarkerSize);
  ctx.lineTo(sePos.x, sePos.y + seMarkerSize);
  ctx.stroke();
  // Draw circle around cross
  ctx.beginPath();
  ctx.arc(sePos.x, sePos.y, seMarkerSize * 0.8, 0, Math.PI * 2);
  ctx.stroke();
  // Draw leader line
  if (seShowLeader) {
    ctx.beginPath();
    ctx.moveTo(sePos.x, sePos.y);
    ctx.lineTo(seLabelPos.x, seLabelPos.y);
    ctx.stroke();
  }
  // Draw elevation text
  const seLabel = formatElevation(seElev, renderCtx.unitSettings.numberFormat, 3);
  ctx.save();
  ctx.fillStyle = strokeColor;
  ctx.font = `${seFontSize}px ${CAD_DEFAULT_FONT}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  ctx.fillText(seLabel, seLabelPos.x + seMarkerSize * 0.3, seLabelPos.y);
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Slab Label preview
// ---------------------------------------------------------------------------

function drawSlabLabelPreview(
  renderCtx: ShapeRenderContext,
  ctx: CanvasRenderingContext2D,
  preview: any,
  _style: any,
  invertColors: boolean,
): void {
  const { position, floorType, customTypeName, thickness, spanDirection, fontSize, arrowLength } = preview;
  if (!position) return;

  let textColor = _style?.strokeColor || '#ffffff';
  if (invertColors && textColor === '#ffffff') textColor = '#000000';

  // Resolve display name
  const FLOOR_TYPES: Record<string, string> = {
    'kanaalplaatvloer': 'Kanaalplaatvloer',
    'breedplaatvloer': 'Breedplaatvloer',
    'ribcassettevloer': 'Ribcassettevloer',
    'staalplaatbetonvloer': 'Staalplaatbetonvloer',
    'massieve-vloer': 'Massieve vloer',
    'houten-vloer': 'Houten vloer',
    'predallen': 'Predallen',
    'custom': 'Overig',
  };
  const typeName = floorType === 'custom'
    ? (customTypeName || 'Custom')
    : (FLOOR_TYPES[floorType] || floorType);

  const spanAngleRad = ((spanDirection ?? 0) * Math.PI) / 180;
  const fs = fontSize || 150;
  const aLen = arrowLength || 1000;

  ctx.save();
  ctx.translate(position.x, position.y);
  ctx.globalAlpha = 0.6;

  // --- Span direction arrows ---
  const halfLen = aLen / 2;
  const arrowHeadLen = Math.min(halfLen * 0.2, fs * 1.0);
  const arrowHeadWidth = arrowHeadLen * 0.5;
  const arrowSpacing = fs * 1.5;

  ctx.strokeStyle = textColor;
  ctx.fillStyle = textColor;
  ctx.lineWidth = renderCtx.getLineWidth ? renderCtx.getLineWidth(1) : 1;
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

  // --- Label text ---
  const fontStyle = `${fs}px ${CAD_DEFAULT_FONT}`;
  ctx.font = fontStyle;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const line1 = typeName;
  const line2 = `${thickness} mm`;
  const lineSpacing = fs * 1.3;

  const bgPadding = fs * 0.3;
  const maxTextWidth = Math.max(ctx.measureText(line1).width, ctx.measureText(line2).width);
  const bgWidth = maxTextWidth + bgPadding * 2;
  const bgHeight = lineSpacing * 2 + bgPadding * 2;

  let bgColor = '#1a1a2e';
  if (invertColors) bgColor = '#ffffff';
  ctx.fillStyle = bgColor;
  ctx.globalAlpha = 0.4;
  ctx.fillRect(-bgWidth / 2, -bgHeight / 2, bgWidth, bgHeight);

  ctx.globalAlpha = 0.6;
  ctx.strokeStyle = textColor;
  ctx.lineWidth = 1;
  ctx.strokeRect(-bgWidth / 2, -bgHeight / 2, bgWidth, bgHeight);

  ctx.fillStyle = textColor;
  ctx.fillText(line1, 0, -lineSpacing * 0.5);
  ctx.fillText(line2, 0, lineSpacing * 0.5);

  ctx.restore();
}

// ===========================================================================
// Registry registrations
// ===========================================================================

const PREVIEW_TYPES = [
  'beam', 'gridline', 'level', 'puntniveau', 'pile', 'cpt',
  'wall', 'wall-rectangle', 'beam-rectangle', 'wall-circle',
  'beam-circle', 'slab', 'slab-opening', 'slab-label', 'plate-system', 'section-callout', 'spot-elevation',
] as const;

export function registerPreviewRenderers(): void {
  shapePreviewRegistry.register('beam', (ctx, preview, style, _viewport, invertColors, renderCtx) => {
    if (!renderCtx) return;
    drawBeamPreview(renderCtx, ctx, preview, style, invertColors);
  });

  shapePreviewRegistry.register('gridline', (ctx, preview, style, _viewport, invertColors, renderCtx) => {
    if (!renderCtx) return;
    drawGridlinePreview(renderCtx, ctx, preview, style, invertColors);
  });

  shapePreviewRegistry.register('level', (ctx, preview, style, _viewport, invertColors, renderCtx) => {
    if (!renderCtx) return;
    drawLevelPreview(renderCtx, ctx, preview, style, invertColors);
  });

  shapePreviewRegistry.register('puntniveau', (ctx, preview, style, _viewport, invertColors, renderCtx) => {
    if (!renderCtx) return;
    drawPuntniveauPreview(renderCtx, ctx, preview, style, invertColors);
  });

  shapePreviewRegistry.register('pile', (ctx, preview, style, _viewport, invertColors, renderCtx) => {
    if (!renderCtx) return;
    drawPilePreview(renderCtx, ctx, preview, style, invertColors);
  });

  shapePreviewRegistry.register('cpt', (ctx, preview, style, _viewport, invertColors, renderCtx) => {
    if (!renderCtx) return;
    drawCptPreview(renderCtx, ctx, preview, style, invertColors);
  });

  shapePreviewRegistry.register('wall', (ctx, preview, style, _viewport, invertColors, renderCtx) => {
    if (!renderCtx) return;
    drawWallPreview(renderCtx, ctx, preview, style, invertColors);
  });

  shapePreviewRegistry.register('wall-rectangle', (ctx, preview, style, _viewport, invertColors, renderCtx) => {
    if (!renderCtx) return;
    drawWallRectanglePreview(renderCtx, ctx, preview, style, invertColors);
  });

  shapePreviewRegistry.register('beam-rectangle', (ctx, preview, style, _viewport, invertColors, renderCtx) => {
    if (!renderCtx) return;
    drawBeamRectanglePreview(renderCtx, ctx, preview, style, invertColors);
  });

  shapePreviewRegistry.register('wall-circle', (ctx, preview, style, _viewport, invertColors, renderCtx) => {
    if (!renderCtx) return;
    drawWallCirclePreview(renderCtx, ctx, preview, style, invertColors);
  });

  shapePreviewRegistry.register('beam-circle', (ctx, preview, style, _viewport, invertColors, renderCtx) => {
    if (!renderCtx) return;
    drawBeamCirclePreview(renderCtx, ctx, preview, style, invertColors);
  });

  shapePreviewRegistry.register('slab', (ctx, preview, style, _viewport, invertColors, renderCtx) => {
    if (!renderCtx) return;
    drawSlabPreview(renderCtx, ctx, preview, style, invertColors);
  });

  shapePreviewRegistry.register('slab-opening', (ctx, preview, style, _viewport, invertColors, renderCtx) => {
    if (!renderCtx) return;
    drawSlabOpeningPreview(renderCtx, ctx, preview, style, invertColors);
  });

  shapePreviewRegistry.register('slab-label', (ctx, preview, style, _viewport, invertColors, renderCtx) => {
    if (!renderCtx) return;
    drawSlabLabelPreview(renderCtx, ctx, preview, style, invertColors);
  });

  shapePreviewRegistry.register('plate-system', (ctx, preview, style, _viewport, invertColors, renderCtx) => {
    if (!renderCtx) return;
    drawPlateSystemPreview(renderCtx, ctx, preview, style, invertColors);
  });

  shapePreviewRegistry.register('section-callout', (ctx, preview, style, _viewport, invertColors, renderCtx) => {
    if (!renderCtx) return;
    drawSectionCalloutPreview(renderCtx, ctx, preview, style, invertColors);
  });

  shapePreviewRegistry.register('spot-elevation', (ctx, preview, style, _viewport, invertColors, renderCtx) => {
    if (!renderCtx) return;
    drawSpotElevationPreview(renderCtx, ctx, preview, style, invertColors);
  });
}

export function unregisterPreviewRenderers(): void {
  for (const type of PREVIEW_TYPES) {
    shapePreviewRegistry.unregister(type);
  }
}
