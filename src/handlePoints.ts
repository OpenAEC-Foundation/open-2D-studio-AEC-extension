import { shapeHandleRegistry, bulgeArcMidpoint, useAppStore } from 'open-2d-studio';
import type {
  PuntniveauShape, PileShape, ColumnShape, CPTShape, FoundationZoneShape,
  SlabShape, SlabLabelShape, PlateSystemShape, SectionCalloutShape, SpaceShape,
  SpotElevationShape, WallShape, WallOpeningShape, RebarShape,
} from 'open-2d-studio';

function startEndMidpoints(shape: any): { x: number; y: number }[] {
  return [
    shape.start,
    shape.end,
    { x: (shape.start.x + shape.end.x) / 2, y: (shape.start.y + shape.end.y) / 2 },
  ];
}

const SHAPE_TYPES = [
  'beam', 'gridline', 'level', 'puntniveau', 'pile', 'column', 'cpt',
  'foundation-zone', 'wall', 'wall-opening', 'slab', 'slab-opening', 'slab-label', 'plate-system',
  'section-callout', 'space', 'spot-elevation', 'rebar',
] as const;

export function registerHandlePoints(): void {
  shapeHandleRegistry.register('beam', (shape) => startEndMidpoints(shape));
  shapeHandleRegistry.register('gridline', (shape) => startEndMidpoints(shape));
  shapeHandleRegistry.register('level', (shape) => startEndMidpoints(shape));

  shapeHandleRegistry.register('puntniveau', (shape) => {
    return [...(shape as PuntniveauShape).points];
  });

  shapeHandleRegistry.register('pile', (shape) => {
    return [(shape as PileShape).position];
  });

  shapeHandleRegistry.register('column', (shape) => {
    return [(shape as ColumnShape).position];
  });

  shapeHandleRegistry.register('cpt', (shape) => {
    return [(shape as CPTShape).position];
  });

  shapeHandleRegistry.register('foundation-zone', (shape) => {
    return [...(shape as FoundationZoneShape).contourPoints];
  });

  shapeHandleRegistry.register('wall', (shape) => startEndMidpoints(shape));

  shapeHandleRegistry.register('wall-opening', (shape) => {
    const wo = shape as WallOpeningShape;
    const allShapes = useAppStore.getState().shapes;
    const hostWall = allShapes.find(s => s.id === wo.hostWallId) as WallShape | undefined;
    if (!hostWall) return [];
    const dx = hostWall.end.x - hostWall.start.x;
    const dy = hostWall.end.y - hostWall.start.y;
    const wallLen = Math.sqrt(dx * dx + dy * dy);
    if (wallLen < 0.001) return [];
    const dirX = dx / wallLen;
    const dirY = dy / wallLen;
    return [{
      x: hostWall.start.x + dirX * wo.positionAlongWall,
      y: hostWall.start.y + dirY * wo.positionAlongWall,
    }];
  });

  shapeHandleRegistry.register('slab', (shape) => {
    const slabS = shape as SlabShape;
    const handles: { x: number; y: number }[] = [...slabS.points];
    for (let i = 0; i < slabS.points.length; i++) {
      const j = (i + 1) % slabS.points.length;
      handles.push({
        x: (slabS.points[i].x + slabS.points[j].x) / 2,
        y: (slabS.points[i].y + slabS.points[j].y) / 2,
      });
    }
    return handles;
  });

  shapeHandleRegistry.register('slab-opening', (shape) => {
    const soS = shape as SlabShape; // same point-based structure
    const handles: { x: number; y: number }[] = [...soS.points];
    for (let i = 0; i < soS.points.length; i++) {
      const j = (i + 1) % soS.points.length;
      handles.push({
        x: (soS.points[i].x + soS.points[j].x) / 2,
        y: (soS.points[i].y + soS.points[j].y) / 2,
      });
    }
    return handles;
  });

  shapeHandleRegistry.register('plate-system', (shape) => {
    const psS = shape as PlateSystemShape;
    const handles: { x: number; y: number }[] = [...psS.contourPoints];
    for (let i = 0; i < psS.contourPoints.length; i++) {
      const j = (i + 1) % psS.contourPoints.length;
      const b = psS.contourBulges ? (psS.contourBulges[i] ?? 0) : 0;
      if (Math.abs(b) > 0.0001) {
        handles.push(bulgeArcMidpoint(psS.contourPoints[i], psS.contourPoints[j], b));
      } else {
        handles.push({
          x: (psS.contourPoints[i].x + psS.contourPoints[j].x) / 2,
          y: (psS.contourPoints[i].y + psS.contourPoints[j].y) / 2,
        });
      }
    }
    return handles;
  });

  shapeHandleRegistry.register('section-callout', (shape) => {
    const sc = shape as SectionCalloutShape;
    const scAngle = Math.atan2(sc.end.y - sc.start.y, sc.end.x - sc.start.x);
    const scDx = Math.cos(scAngle);
    const scDy = Math.sin(scAngle);
    const scPerpSign = sc.flipDirection ? 1 : -1;
    const scPerpX = -scDy * scPerpSign;
    const scPerpY = scDx * scPerpSign;
    const scVD = sc.viewDepth ?? 5000;
    const scMidX = (sc.start.x + sc.end.x) / 2;
    const scMidY = (sc.start.y + sc.end.y) / 2;
    return [
      sc.start,
      sc.end,
      { x: scMidX, y: scMidY },
      { x: scMidX + scPerpX * scVD, y: scMidY + scPerpY * scVD },
    ];
  });

  shapeHandleRegistry.register('space', (shape) => {
    return [(shape as SpaceShape).labelPosition];
  });

  shapeHandleRegistry.register('slab-label', (shape) => {
    return [(shape as SlabLabelShape).position];
  });

  shapeHandleRegistry.register('spot-elevation', (shape) => {
    return [
      (shape as SpotElevationShape).position,
      (shape as SpotElevationShape).labelPosition,
    ];
  });

  shapeHandleRegistry.register('rebar', (shape) => {
    const rebar = shape as RebarShape;
    const handles = [rebar.position];
    if (rebar.viewMode === 'longitudinal' && rebar.endPoint) {
      handles.push(rebar.endPoint);
    }
    return handles;
  });
}

export function unregisterHandlePoints(): void {
  for (const type of SHAPE_TYPES) {
    shapeHandleRegistry.unregister(type);
  }
}
