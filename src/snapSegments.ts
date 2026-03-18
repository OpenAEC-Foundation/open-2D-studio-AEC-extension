import type {
  Point, BeamShape, WallShape, SectionCalloutShape, SpaceShape,
  PlateSystemShape, FoundationZoneShape,
} from 'open-2d-studio';
import { getBeamFlangeSegments, getWallOutlineSegments, snapProviderRegistry } from 'open-2d-studio';

type Segment = { start: Point; end: Point };

function getBeamSegments(shape: any): Segment[] {
  return getBeamFlangeSegments(shape as BeamShape);
}

function getGridlineSegments(shape: any): Segment[] {
  return [{ start: shape.start, end: shape.end }];
}

function getLevelSegments(shape: any): Segment[] {
  return [{ start: shape.start, end: shape.end }];
}

function getPileSegments(): Segment[] {
  return [];
}

function getColumnSegments(shape: any): Segment[] {
  const col = shape;
  const halfW = col.width / 2;
  const halfD = col.depth / 2;
  const cos = Math.cos(col.rotation || 0);
  const sin = Math.sin(col.rotation || 0);
  const transform = (lx: number, ly: number) => ({
    x: col.position.x + lx * cos - ly * sin,
    y: col.position.y + lx * sin + ly * cos,
  });
  const c0 = transform(-halfW, -halfD);
  const c1 = transform(halfW, -halfD);
  const c2 = transform(halfW, halfD);
  const c3 = transform(-halfW, halfD);
  return [
    { start: c0, end: c1 },
    { start: c1, end: c2 },
    { start: c2, end: c3 },
    { start: c3, end: c0 },
  ];
}

function getCptSegments(): Segment[] {
  return [];
}

function getSpotElevationSegments(): Segment[] {
  return [];
}

function getFoundationZoneSegments(shape: any): Segment[] {
  const fzPts = (shape as FoundationZoneShape).contourPoints;
  const segs: Segment[] = [];
  for (let i = 0; i < fzPts.length; i++) {
    const j = (i + 1) % fzPts.length;
    segs.push({ start: fzPts[i], end: fzPts[j] });
  }
  return segs;
}

function getWallSegments(shape: any): Segment[] {
  return getWallOutlineSegments(shape as WallShape);
}

function getSlabSegments(shape: any): Segment[] {
  const slabPts = shape.points;
  const segs: Segment[] = [];
  for (let i = 0; i < slabPts.length; i++) {
    const j = (i + 1) % slabPts.length;
    segs.push({ start: slabPts[i], end: slabPts[j] });
  }
  return segs;
}

function getPuntniveauSegments(shape: any): Segment[] {
  const pnvPts = shape.points;
  const segs: Segment[] = [];
  for (let i = 0; i < pnvPts.length; i++) {
    const j = (i + 1) % pnvPts.length;
    segs.push({ start: pnvPts[i], end: pnvPts[j] });
  }
  return segs;
}

function getSpaceSegments(shape: any): Segment[] {
  const spacePts = (shape as SpaceShape).contourPoints;
  const segs: Segment[] = [];
  for (let i = 0; i < spacePts.length; i++) {
    const j = (i + 1) % spacePts.length;
    segs.push({ start: spacePts[i], end: spacePts[j] });
  }
  return segs;
}

function getPlateSystemSegments(shape: any): Segment[] {
  const psPts = (shape as PlateSystemShape).contourPoints;
  const segs: Segment[] = [];
  for (let i = 0; i < psPts.length; i++) {
    const j = (i + 1) % psPts.length;
    segs.push({ start: psPts[i], end: psPts[j] });
  }
  return segs;
}

function getSectionCalloutSegments(shape: any): Segment[] {
  const sc = shape as SectionCalloutShape;
  return [{ start: sc.start, end: sc.end }];
}

function getSlabOpeningSegments(shape: any): Segment[] {
  const soPts = shape.points;
  const segs: Segment[] = [];
  for (let i = 0; i < soPts.length; i++) {
    const j = (i + 1) % soPts.length;
    segs.push({ start: soPts[i], end: soPts[j] });
  }
  return segs;
}

function getWallOpeningSegments(): Segment[] {
  return [];
}

function getRebarSegments(shape: any): Segment[] {
  if (shape.viewMode === 'longitudinal' && shape.endPoint) {
    return [{ start: shape.position, end: shape.endPoint }];
  }
  return [];
}

const SHAPE_TYPES = [
  'beam', 'gridline', 'level', 'pile', 'column', 'cpt', 'spot-elevation',
  'foundation-zone', 'wall', 'wall-opening', 'slab', 'slab-opening', 'puntniveau', 'space',
  'plate-system', 'section-callout', 'rebar',
] as const;

const handlers: Record<string, (shape: any) => Segment[]> = {
  'beam': getBeamSegments,
  'gridline': getGridlineSegments,
  'level': getLevelSegments,
  'pile': getPileSegments,
  'column': getColumnSegments,
  'cpt': getCptSegments,
  'spot-elevation': getSpotElevationSegments,
  'foundation-zone': getFoundationZoneSegments,
  'wall': getWallSegments,
  'wall-opening': getWallOpeningSegments,
  'slab': getSlabSegments,
  'slab-opening': getSlabOpeningSegments,
  'puntniveau': getPuntniveauSegments,
  'space': getSpaceSegments,
  'plate-system': getPlateSystemSegments,
  'section-callout': getSectionCalloutSegments,
  'rebar': getRebarSegments,
};

export function registerSnapSegments(): void {
  for (const type of SHAPE_TYPES) {
    snapProviderRegistry.registerSegments(type, handlers[type]);
  }
}

export function unregisterSnapSegments(): void {
  for (const type of SHAPE_TYPES) {
    snapProviderRegistry.unregisterSegments(type);
  }
}
