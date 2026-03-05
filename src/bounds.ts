import type {
  BeamShape, GridlineShape, LevelShape, PileShape, WallShape,
  SlabShape, PuntniveauShape, SpaceShape, PlateSystemShape,
  SectionCalloutShape, SpotElevationShape, CPTShape, FoundationZoneShape,
  ShapeBounds,
} from 'open-2d-studio';
import { annotationScaleFactor, bulgeArcBounds, boundsRegistry } from 'open-2d-studio';

function getBeamBounds(shape: any, _drawingScale?: number): ShapeBounds | null {
  const { start, end, flangeWidth } = shape as BeamShape;
  const halfWidth = flangeWidth / 2;

  if (shape.bulge && Math.abs(shape.bulge) > 0.0001) {
    const ab = bulgeArcBounds(start, end, shape.bulge);
    return {
      minX: ab.minX - halfWidth,
      minY: ab.minY - halfWidth,
      maxX: ab.maxX + halfWidth,
      maxY: ab.maxY + halfWidth,
    };
  }

  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.sqrt(dx * dx + dy * dy);
  if (length === 0) return null;

  const px = -dy / length;
  const py = dx / length;

  const corners = [
    { x: start.x + px * halfWidth, y: start.y + py * halfWidth },
    { x: end.x + px * halfWidth, y: end.y + py * halfWidth },
    { x: end.x - px * halfWidth, y: end.y - py * halfWidth },
    { x: start.x - px * halfWidth, y: start.y - py * halfWidth },
  ];

  const bxs = corners.map(c => c.x);
  const bys = corners.map(c => c.y);
  return {
    minX: Math.min(...bxs),
    minY: Math.min(...bys),
    maxX: Math.max(...bxs),
    maxY: Math.max(...bys),
  };
}

function getGridlineBounds(shape: any, drawingScale?: number): ShapeBounds | null {
  const glShape = shape as GridlineShape;
  const glSf = annotationScaleFactor(drawingScale);
  const r = (glShape.bubbleRadius || 0) * glSf;
  const glExt = 500 * glSf;
  return {
    minX: Math.min(glShape.start.x, glShape.end.x) - r - glExt,
    minY: Math.min(glShape.start.y, glShape.end.y) - r - glExt,
    maxX: Math.max(glShape.start.x, glShape.end.x) + r + glExt,
    maxY: Math.max(glShape.start.y, glShape.end.y) + r + glExt,
  };
}

function getLevelBounds(shape: any, drawingScale?: number): ShapeBounds | null {
  const lvShape = shape as LevelShape;
  const lvSf = annotationScaleFactor(drawingScale);
  const lvR = (lvShape.bubbleRadius || 0) * lvSf;
  return {
    minX: Math.min(lvShape.start.x, lvShape.end.x) - lvR,
    minY: Math.min(lvShape.start.y, lvShape.end.y) - lvR,
    maxX: Math.max(lvShape.start.x, lvShape.end.x) + lvR,
    maxY: Math.max(lvShape.start.y, lvShape.end.y) + lvR,
  };
}

function getPileBounds(shape: any): ShapeBounds | null {
  const pileShape = shape as PileShape;
  const pileR = pileShape.diameter / 2;
  return {
    minX: pileShape.position.x - pileR,
    minY: pileShape.position.y - pileR,
    maxX: pileShape.position.x + pileR,
    maxY: pileShape.position.y + pileR + pileShape.fontSize * 1.5,
  };
}

function getCptBounds(shape: any, drawingScale?: number): ShapeBounds | null {
  const cptShape = shape as CPTShape;
  const cptSf = annotationScaleFactor(drawingScale);
  const cptMs = (cptShape.markerSize || 300) * cptSf;
  const cptLabelH = cptShape.fontSize * cptSf * 1.5;
  return {
    minX: cptShape.position.x - cptMs * 0.6,
    minY: cptShape.position.y - cptMs * 0.7,
    maxX: cptShape.position.x + cptMs * 0.6,
    maxY: cptShape.position.y + cptMs * 0.7 + cptLabelH,
  };
}

function getFoundationZoneBounds(shape: any): ShapeBounds | null {
  const fzShape = shape as FoundationZoneShape;
  if (fzShape.contourPoints.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  const fzXs = fzShape.contourPoints.map(p => p.x);
  const fzYs = fzShape.contourPoints.map(p => p.y);
  return {
    minX: Math.min(...fzXs),
    minY: Math.min(...fzYs),
    maxX: Math.max(...fzXs),
    maxY: Math.max(...fzYs),
  };
}

function getWallBounds(shape: any): ShapeBounds | null {
  const wallShape = shape as WallShape;
  if (wallShape.bulge && Math.abs(wallShape.bulge) > 0.0001) {
    const ab = bulgeArcBounds(wallShape.start, wallShape.end, wallShape.bulge);
    const halfT = wallShape.thickness / 2;
    return {
      minX: ab.minX - halfT,
      minY: ab.minY - halfT,
      maxX: ab.maxX + halfT,
      maxY: ab.maxY + halfT,
    };
  }
  const wdx = wallShape.end.x - wallShape.start.x;
  const wdy = wallShape.end.y - wallShape.start.y;
  const wLen = Math.sqrt(wdx * wdx + wdy * wdy);
  if (wLen === 0) return null;
  const wpx = -wdy / wLen;
  const wpy = wdx / wLen;
  let wLeftThick: number;
  let wRightThick: number;
  if (wallShape.justification === 'left') {
    wLeftThick = 0;
    wRightThick = wallShape.thickness;
  } else if (wallShape.justification === 'right') {
    wLeftThick = wallShape.thickness;
    wRightThick = 0;
  } else {
    wLeftThick = wallShape.thickness / 2;
    wRightThick = wallShape.thickness / 2;
  }
  const wCorners = [
    { x: wallShape.start.x + wpx * wLeftThick, y: wallShape.start.y + wpy * wLeftThick },
    { x: wallShape.end.x + wpx * wLeftThick, y: wallShape.end.y + wpy * wLeftThick },
    { x: wallShape.end.x - wpx * wRightThick, y: wallShape.end.y - wpy * wRightThick },
    { x: wallShape.start.x - wpx * wRightThick, y: wallShape.start.y - wpy * wRightThick },
  ];
  const wxs = wCorners.map(c => c.x);
  const wys = wCorners.map(c => c.y);
  return {
    minX: Math.min(...wxs),
    minY: Math.min(...wys),
    maxX: Math.max(...wxs),
    maxY: Math.max(...wys),
  };
}

function getSlabBounds(shape: any): ShapeBounds | null {
  const slabShape = shape as SlabShape;
  if (slabShape.points.length === 0) return null;
  const sxs = slabShape.points.map(p => p.x);
  const sys = slabShape.points.map(p => p.y);
  return {
    minX: Math.min(...sxs),
    minY: Math.min(...sys),
    maxX: Math.max(...sxs),
    maxY: Math.max(...sys),
  };
}

function getPuntniveauBounds(shape: any): ShapeBounds | null {
  const pnShape = shape as PuntniveauShape;
  if (pnShape.points.length === 0) return null;
  const pnxs = pnShape.points.map(p => p.x);
  const pnys = pnShape.points.map(p => p.y);
  return {
    minX: Math.min(...pnxs),
    minY: Math.min(...pnys),
    maxX: Math.max(...pnxs),
    maxY: Math.max(...pnys),
  };
}

function getSpaceBounds(shape: any): ShapeBounds | null {
  const spaceShape = shape as SpaceShape;
  if (spaceShape.contourPoints.length === 0) return null;
  const spxs = spaceShape.contourPoints.map(p => p.x);
  const spys = spaceShape.contourPoints.map(p => p.y);
  return {
    minX: Math.min(...spxs),
    minY: Math.min(...spys),
    maxX: Math.max(...spxs),
    maxY: Math.max(...spys),
  };
}

function getPlateSystemBounds(shape: any): ShapeBounds | null {
  const psShape = shape as PlateSystemShape;
  if (psShape.contourPoints.length === 0) return null;
  let psMinX = Infinity, psMinY = Infinity, psMaxX = -Infinity, psMaxY = -Infinity;
  for (const p of psShape.contourPoints) {
    if (p.x < psMinX) psMinX = p.x;
    if (p.y < psMinY) psMinY = p.y;
    if (p.x > psMaxX) psMaxX = p.x;
    if (p.y > psMaxY) psMaxY = p.y;
  }
  if (psShape.contourBulges) {
    for (let i = 0; i < psShape.contourPoints.length; i++) {
      const b = psShape.contourBulges[i] ?? 0;
      if (b !== 0 && Math.abs(b) > 0.0001) {
        const j = (i + 1) % psShape.contourPoints.length;
        const ab = bulgeArcBounds(psShape.contourPoints[i], psShape.contourPoints[j], b);
        if (ab.minX < psMinX) psMinX = ab.minX;
        if (ab.minY < psMinY) psMinY = ab.minY;
        if (ab.maxX > psMaxX) psMaxX = ab.maxX;
        if (ab.maxY > psMaxY) psMaxY = ab.maxY;
      }
    }
  }
  return { minX: psMinX, minY: psMinY, maxX: psMaxX, maxY: psMaxY };
}

function getSectionCalloutBounds(shape: any, drawingScale?: number): ShapeBounds | null {
  const scShape = shape as SectionCalloutShape;
  const scSf = annotationScaleFactor(drawingScale);
  const scR = (scShape.bubbleRadius || 0) * scSf;
  const scArrowLen = scR * 1.5;
  return {
    minX: Math.min(scShape.start.x, scShape.end.x) - scR - scArrowLen,
    minY: Math.min(scShape.start.y, scShape.end.y) - scR - scArrowLen,
    maxX: Math.max(scShape.start.x, scShape.end.x) + scR + scArrowLen,
    maxY: Math.max(scShape.start.y, scShape.end.y) + scR + scArrowLen,
  };
}

function getSpotElevationBounds(shape: any, drawingScale?: number): ShapeBounds | null {
  const seShape = shape as SpotElevationShape;
  const seSf = annotationScaleFactor(drawingScale);
  const seMs = (seShape.markerSize || 200) * seSf;
  return {
    minX: Math.min(seShape.position.x, seShape.labelPosition.x) - seMs,
    minY: Math.min(seShape.position.y, seShape.labelPosition.y) - seMs,
    maxX: Math.max(seShape.position.x, seShape.labelPosition.x) + seMs * 4,
    maxY: Math.max(seShape.position.y, seShape.labelPosition.y) + seMs,
  };
}

const SHAPE_TYPES = [
  'beam', 'gridline', 'level', 'pile', 'cpt', 'foundation-zone',
  'wall', 'slab', 'puntniveau', 'space', 'plate-system',
  'section-callout', 'spot-elevation',
] as const;

const handlers: Record<string, (shape: any, drawingScale?: number) => ShapeBounds | null> = {
  'beam': getBeamBounds,
  'gridline': getGridlineBounds,
  'level': getLevelBounds,
  'pile': getPileBounds,
  'cpt': getCptBounds,
  'foundation-zone': getFoundationZoneBounds,
  'wall': getWallBounds,
  'slab': getSlabBounds,
  'puntniveau': getPuntniveauBounds,
  'space': getSpaceBounds,
  'plate-system': getPlateSystemBounds,
  'section-callout': getSectionCalloutBounds,
  'spot-elevation': getSpotElevationBounds,
};

export function registerBounds(): void {
  for (const type of SHAPE_TYPES) {
    boundsRegistry.register(type, handlers[type]);
  }
}

export function unregisterBounds(): void {
  for (const type of SHAPE_TYPES) {
    boundsRegistry.unregister(type);
  }
}
