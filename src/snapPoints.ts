import type {
  Point, BeamShape, WallShape, WallOpeningShape, SectionCalloutShape, SpaceShape,
  PlateSystemShape, SpotElevationShape, CPTShape, FoundationZoneShape,
} from 'open-2d-studio';
import {
  bulgeArcMidpoint, bulgeToArc, isAngleInArc,
  distance, getBeamAngle, getBeamEndpoints, getBeamCornerEndpoints,
  getBeamMidpoint, getBeamFlangeMidpoints, getNearestPointOnBeam, getBeamCorners,
  getWallAngle, getWallCorners, getWallCornerEndpoints, getWallEdgeMidpoints,
  getNearestPointOnWall,
  snapProviderRegistry,
  useAppStore,
} from 'open-2d-studio';

function getBeamSnapPoints(shape: any, activeSnaps: string[], cursor?: Point, basePoint?: Point): any[] {
  const snapPoints: any[] = [];
  const beamShape = shape as BeamShape;
  const isArcBeam = beamShape.bulge && Math.abs(beamShape.bulge) > 0.0001;

  if (isArcBeam) {
    const arcInfo = bulgeToArc(beamShape.start, beamShape.end, beamShape.bulge!);

    if (activeSnaps.includes('endpoint')) {
      const beamAngle = getBeamAngle(beamShape);
      snapPoints.push(
        { point: beamShape.start, type: 'endpoint', sourceShapeId: shape.id, sourceAngle: beamAngle },
        { point: beamShape.end, type: 'endpoint', sourceShapeId: shape.id, sourceAngle: beamAngle },
      );
    }
    if (activeSnaps.includes('midpoint')) {
      snapPoints.push({
        point: bulgeArcMidpoint(beamShape.start, beamShape.end, beamShape.bulge!),
        type: 'midpoint',
        sourceShapeId: shape.id,
      });
    }
    if (activeSnaps.includes('center')) {
      snapPoints.push({
        point: arcInfo.center,
        type: 'center',
        sourceShapeId: shape.id,
      });
    }
    if (activeSnaps.includes('nearest') && cursor) {
      const cdx = cursor.x - arcInfo.center.x;
      const cdy = cursor.y - arcInfo.center.y;
      const cursorAngle = Math.atan2(cdy, cdx);
      if (isAngleInArc(cursorAngle, arcInfo.startAngle, arcInfo.endAngle, arcInfo.clockwise)) {
        snapPoints.push({
          point: {
            x: arcInfo.center.x + arcInfo.radius * Math.cos(cursorAngle),
            y: arcInfo.center.y + arcInfo.radius * Math.sin(cursorAngle),
          },
          type: 'nearest',
          sourceShapeId: shape.id,
        });
      } else {
        const d1 = distance(cursor, beamShape.start);
        const d2 = distance(cursor, beamShape.end);
        snapPoints.push({
          point: d1 <= d2 ? beamShape.start : beamShape.end,
          type: 'nearest',
          sourceShapeId: shape.id,
        });
      }
    }
  } else {
    if (activeSnaps.includes('endpoint')) {
      snapPoints.push(...getBeamEndpoints(beamShape));
      snapPoints.push(...getBeamCornerEndpoints(beamShape));
    }
    if (activeSnaps.includes('midpoint')) {
      snapPoints.push(...getBeamMidpoint(beamShape));
      snapPoints.push(...getBeamFlangeMidpoints(beamShape));
    }
    if (activeSnaps.includes('nearest') && cursor) {
      snapPoints.push(...getNearestPointOnBeam(beamShape, cursor));
    }
    if (activeSnaps.includes('perpendicular') && cursor) {
      const beamAngle = getBeamAngle(beamShape);
      const projSource = basePoint || cursor;
      {
        const dx = beamShape.end.x - beamShape.start.x;
        const dy = beamShape.end.y - beamShape.start.y;
        const lengthSq = dx * dx + dy * dy;
        if (lengthSq > 0) {
          const t = ((projSource.x - beamShape.start.x) * dx + (projSource.y - beamShape.start.y) * dy) / lengthSq;
          if (t >= 0 && t <= 1) {
            snapPoints.push({
              point: { x: beamShape.start.x + t * dx, y: beamShape.start.y + t * dy },
              type: 'perpendicular',
              sourceShapeId: shape.id,
              sourceAngle: beamAngle,
            });
          }
        }
      }
      const beamCorners = getBeamCorners(beamShape);
      const beamFlangeEdges = [
        { start: beamCorners[0], end: beamCorners[3] },
        { start: beamCorners[1], end: beamCorners[2] },
      ];
      for (const edge of beamFlangeEdges) {
        const dx = edge.end.x - edge.start.x;
        const dy = edge.end.y - edge.start.y;
        const lengthSq = dx * dx + dy * dy;
        if (lengthSq > 0) {
          const t = ((projSource.x - edge.start.x) * dx + (projSource.y - edge.start.y) * dy) / lengthSq;
          if (t >= 0 && t <= 1) {
            snapPoints.push({
              point: { x: edge.start.x + t * dx, y: edge.start.y + t * dy },
              type: 'perpendicular',
              sourceShapeId: shape.id,
              sourceAngle: beamAngle,
            });
          }
        }
      }
    }
  }
  return snapPoints;
}

function getGridlineSnapPoints(shape: any, activeSnaps: string[], cursor?: Point, basePoint?: Point): any[] {
  const snapPoints: any[] = [];
  const glAngle = Math.atan2(shape.end.y - shape.start.y, shape.end.x - shape.start.x);
  if (activeSnaps.includes('endpoint')) {
    snapPoints.push(
      { point: shape.start, type: 'endpoint', sourceShapeId: shape.id, sourceAngle: glAngle },
      { point: shape.end, type: 'endpoint', sourceShapeId: shape.id, sourceAngle: glAngle },
    );
  }
  if (activeSnaps.includes('midpoint')) {
    snapPoints.push({
      point: {
        x: (shape.start.x + shape.end.x) / 2,
        y: (shape.start.y + shape.end.y) / 2,
      },
      type: 'midpoint',
      sourceShapeId: shape.id,
      sourceAngle: glAngle,
    });
  }
  if (activeSnaps.includes('perpendicular') && cursor) {
    const projSource = basePoint || cursor;
    const dx = shape.end.x - shape.start.x;
    const dy = shape.end.y - shape.start.y;
    const lengthSq = dx * dx + dy * dy;
    if (lengthSq > 0) {
      const t = ((projSource.x - shape.start.x) * dx + (projSource.y - shape.start.y) * dy) / lengthSq;
      snapPoints.push({
        point: {
          x: shape.start.x + t * dx,
          y: shape.start.y + t * dy,
        },
        type: 'perpendicular',
        sourceShapeId: shape.id,
        sourceAngle: glAngle,
      });
    }
  }
  if (activeSnaps.includes('nearest') && cursor) {
    const dx = shape.end.x - shape.start.x;
    const dy = shape.end.y - shape.start.y;
    const lengthSq = dx * dx + dy * dy;
    if (lengthSq > 0) {
      let t = ((cursor.x - shape.start.x) * dx + (cursor.y - shape.start.y) * dy) / lengthSq;
      t = Math.max(0, Math.min(1, t));
      snapPoints.push({
        point: {
          x: shape.start.x + t * dx,
          y: shape.start.y + t * dy,
        },
        type: 'nearest',
        sourceShapeId: shape.id,
        sourceAngle: glAngle,
      });
    }
  }
  return snapPoints;
}

function getLevelSnapPoints(shape: any, activeSnaps: string[]): any[] {
  const snapPoints: any[] = [];
  const lvAngle = Math.atan2(shape.end.y - shape.start.y, shape.end.x - shape.start.x);
  if (activeSnaps.includes('endpoint')) {
    snapPoints.push(
      { point: shape.start, type: 'endpoint', sourceShapeId: shape.id, sourceAngle: lvAngle },
      { point: shape.end, type: 'endpoint', sourceShapeId: shape.id, sourceAngle: lvAngle },
    );
  }
  if (activeSnaps.includes('midpoint')) {
    snapPoints.push({
      point: {
        x: (shape.start.x + shape.end.x) / 2,
        y: (shape.start.y + shape.end.y) / 2,
      },
      type: 'midpoint',
      sourceShapeId: shape.id,
      sourceAngle: lvAngle,
    });
  }
  return snapPoints;
}

function getPileSnapPoints(shape: any, activeSnaps: string[]): any[] {
  const snapPoints: any[] = [];
  if (activeSnaps.includes('endpoint')) {
    snapPoints.push({
      point: shape.position,
      type: 'endpoint',
      sourceShapeId: shape.id,
    });
  }
  if (activeSnaps.includes('center')) {
    const r = shape.diameter / 2;
    snapPoints.push(
      { point: { x: shape.position.x + r, y: shape.position.y }, type: 'center', sourceShapeId: shape.id },
      { point: { x: shape.position.x - r, y: shape.position.y }, type: 'center', sourceShapeId: shape.id },
      { point: { x: shape.position.x, y: shape.position.y + r }, type: 'center', sourceShapeId: shape.id },
      { point: { x: shape.position.x, y: shape.position.y - r }, type: 'center', sourceShapeId: shape.id },
    );
  }
  if (activeSnaps.includes('center')) {
    snapPoints.push({
      point: shape.position,
      type: 'center',
      sourceShapeId: shape.id,
    });
  }
  return snapPoints;
}

function getColumnSnapPoints(shape: any, activeSnaps: string[]): any[] {
  const snapPoints: any[] = [];
  const col = shape;
  const halfW = col.width / 2;
  const halfD = col.depth / 2;

  if (activeSnaps.includes('center')) {
    snapPoints.push({
      point: col.position,
      type: 'center',
      sourceShapeId: shape.id,
    });
  }

  if (activeSnaps.includes('endpoint')) {
    const cos = Math.cos(col.rotation || 0);
    const sin = Math.sin(col.rotation || 0);
    const corners = [
      { x: -halfW, y: -halfD },
      { x: halfW, y: -halfD },
      { x: halfW, y: halfD },
      { x: -halfW, y: halfD },
    ];
    for (const c of corners) {
      snapPoints.push({
        point: {
          x: col.position.x + c.x * cos - c.y * sin,
          y: col.position.y + c.x * sin + c.y * cos,
        },
        type: 'endpoint',
        sourceShapeId: shape.id,
      });
    }
  }

  if (activeSnaps.includes('midpoint')) {
    const cos = Math.cos(col.rotation || 0);
    const sin = Math.sin(col.rotation || 0);
    const mids = [
      { x: 0, y: -halfD },
      { x: halfW, y: 0 },
      { x: 0, y: halfD },
      { x: -halfW, y: 0 },
    ];
    for (const m of mids) {
      snapPoints.push({
        point: {
          x: col.position.x + m.x * cos - m.y * sin,
          y: col.position.y + m.x * sin + m.y * cos,
        },
        type: 'midpoint',
        sourceShapeId: shape.id,
      });
    }
  }

  return snapPoints;
}

function getCptSnapPoints(shape: any, activeSnaps: string[]): any[] {
  const snapPoints: any[] = [];
  const cptShape = shape as CPTShape;
  if (activeSnaps.includes('endpoint')) {
    snapPoints.push({
      point: cptShape.position,
      type: 'endpoint',
      sourceShapeId: shape.id,
    });
  }
  if (activeSnaps.includes('center')) {
    snapPoints.push({
      point: cptShape.position,
      type: 'center',
      sourceShapeId: shape.id,
    });
  }
  return snapPoints;
}

function getSpotElevationSnapPoints(shape: any, activeSnaps: string[]): any[] {
  const snapPoints: any[] = [];
  const seShape = shape as SpotElevationShape;
  if (activeSnaps.includes('endpoint')) {
    snapPoints.push({
      point: seShape.position,
      type: 'endpoint',
      sourceShapeId: shape.id,
    });
    snapPoints.push({
      point: seShape.labelPosition,
      type: 'endpoint',
      sourceShapeId: shape.id,
      pointIndex: 1,
    });
  }
  if (activeSnaps.includes('center')) {
    snapPoints.push({
      point: seShape.position,
      type: 'center',
      sourceShapeId: shape.id,
    });
  }
  return snapPoints;
}

function getFoundationZoneSnapPoints(shape: any, activeSnaps: string[]): any[] {
  const snapPoints: any[] = [];
  const fzShape = shape as FoundationZoneShape;
  if (activeSnaps.includes('endpoint')) {
    for (let i = 0; i < fzShape.contourPoints.length; i++) {
      snapPoints.push({
        point: fzShape.contourPoints[i],
        type: 'endpoint',
        sourceShapeId: shape.id,
        pointIndex: i,
      });
    }
  }
  if (activeSnaps.includes('midpoint')) {
    for (let i = 0; i < fzShape.contourPoints.length; i++) {
      const j = (i + 1) % fzShape.contourPoints.length;
      snapPoints.push({
        point: {
          x: (fzShape.contourPoints[i].x + fzShape.contourPoints[j].x) / 2,
          y: (fzShape.contourPoints[i].y + fzShape.contourPoints[j].y) / 2,
        },
        type: 'midpoint',
        sourceShapeId: shape.id,
      });
    }
  }
  return snapPoints;
}

function getWallSnapPoints(shape: any, activeSnaps: string[], cursor?: Point, basePoint?: Point): any[] {
  const snapPoints: any[] = [];
  const wallShape = shape as WallShape;
  const isArcWall = wallShape.bulge && Math.abs(wallShape.bulge) > 0.0001;
  const wAngle = getWallAngle(wallShape);

  if (isArcWall) {
    const arcInfo = bulgeToArc(wallShape.start, wallShape.end, wallShape.bulge!);

    if (activeSnaps.includes('endpoint')) {
      snapPoints.push(
        { point: wallShape.start, type: 'endpoint', sourceShapeId: shape.id, sourceAngle: wAngle },
        { point: wallShape.end, type: 'endpoint', sourceShapeId: shape.id, sourceAngle: wAngle },
      );
    }
    if (activeSnaps.includes('midpoint')) {
      snapPoints.push({
        point: bulgeArcMidpoint(wallShape.start, wallShape.end, wallShape.bulge!),
        type: 'midpoint',
        sourceShapeId: shape.id,
      });
    }
    if (activeSnaps.includes('center')) {
      snapPoints.push({
        point: arcInfo.center,
        type: 'center',
        sourceShapeId: shape.id,
      });
    }
    if (activeSnaps.includes('nearest') && cursor) {
      const cdx = cursor.x - arcInfo.center.x;
      const cdy = cursor.y - arcInfo.center.y;
      const cursorAngle = Math.atan2(cdy, cdx);
      if (isAngleInArc(cursorAngle, arcInfo.startAngle, arcInfo.endAngle, arcInfo.clockwise)) {
        snapPoints.push({
          point: {
            x: arcInfo.center.x + arcInfo.radius * Math.cos(cursorAngle),
            y: arcInfo.center.y + arcInfo.radius * Math.sin(cursorAngle),
          },
          type: 'nearest',
          sourceShapeId: shape.id,
        });
      } else {
        const d1 = distance(cursor, wallShape.start);
        const d2 = distance(cursor, wallShape.end);
        snapPoints.push({
          point: d1 <= d2 ? wallShape.start : wallShape.end,
          type: 'nearest',
          sourceShapeId: shape.id,
        });
      }
    }
  } else {
    if (activeSnaps.includes('endpoint')) {
      snapPoints.push(
        { point: wallShape.start, type: 'endpoint', sourceShapeId: shape.id, sourceAngle: wAngle },
        { point: wallShape.end, type: 'endpoint', sourceShapeId: shape.id, sourceAngle: wAngle },
      );
      snapPoints.push(...getWallCornerEndpoints(wallShape));
    }
    if (activeSnaps.includes('midpoint')) {
      snapPoints.push({
        point: {
          x: (wallShape.start.x + wallShape.end.x) / 2,
          y: (wallShape.start.y + wallShape.end.y) / 2,
        },
        type: 'midpoint',
        sourceShapeId: shape.id,
        sourceAngle: wAngle,
      });
      snapPoints.push(...getWallEdgeMidpoints(wallShape));
    }
    if (activeSnaps.includes('nearest') && cursor) {
      snapPoints.push(...getNearestPointOnWall(wallShape, cursor));
    }
    if (activeSnaps.includes('perpendicular') && cursor) {
      const projSource = basePoint || cursor;
      {
        const dx = wallShape.end.x - wallShape.start.x;
        const dy = wallShape.end.y - wallShape.start.y;
        const lengthSq = dx * dx + dy * dy;
        if (lengthSq > 0) {
          const t = ((projSource.x - wallShape.start.x) * dx + (projSource.y - wallShape.start.y) * dy) / lengthSq;
          if (t >= 0 && t <= 1) {
            snapPoints.push({
              point: { x: wallShape.start.x + t * dx, y: wallShape.start.y + t * dy },
              type: 'perpendicular',
              sourceShapeId: shape.id,
              sourceAngle: wAngle,
            });
          }
        }
      }
      const wallCorners = getWallCorners(wallShape);
      const wallSideEdges = [
        { start: wallCorners[0], end: wallCorners[3] },
        { start: wallCorners[1], end: wallCorners[2] },
      ];
      for (const edge of wallSideEdges) {
        const dx = edge.end.x - edge.start.x;
        const dy = edge.end.y - edge.start.y;
        const lengthSq = dx * dx + dy * dy;
        if (lengthSq > 0) {
          const t = ((projSource.x - edge.start.x) * dx + (projSource.y - edge.start.y) * dy) / lengthSq;
          if (t >= 0 && t <= 1) {
            snapPoints.push({
              point: { x: edge.start.x + t * dx, y: edge.start.y + t * dy },
              type: 'perpendicular',
              sourceShapeId: shape.id,
              sourceAngle: wAngle,
            });
          }
        }
      }
    }
  }
  return snapPoints;
}

function getSlabSnapPoints(shape: any, activeSnaps: string[], cursor?: Point): any[] {
  const snapPoints: any[] = [];
  const slabPts = shape.points;
  if (slabPts.length < 3) return snapPoints;

  if (activeSnaps.includes('endpoint')) {
    for (let i = 0; i < slabPts.length; i++) {
      snapPoints.push({
        point: slabPts[i],
        type: 'endpoint',
        sourceShapeId: shape.id,
        pointIndex: i,
      });
    }
  }

  if (activeSnaps.includes('midpoint')) {
    for (let i = 0; i < slabPts.length; i++) {
      const j = (i + 1) % slabPts.length;
      snapPoints.push({
        point: {
          x: (slabPts[i].x + slabPts[j].x) / 2,
          y: (slabPts[i].y + slabPts[j].y) / 2,
        },
        type: 'midpoint',
        sourceShapeId: shape.id,
      });
    }
  }

  if (activeSnaps.includes('center')) {
    let cx = 0, cy = 0;
    for (const p of slabPts) {
      cx += p.x;
      cy += p.y;
    }
    cx /= slabPts.length;
    cy /= slabPts.length;
    snapPoints.push({
      point: { x: cx, y: cy },
      type: 'center',
      sourceShapeId: shape.id,
    });
  }

  if (activeSnaps.includes('nearest') && cursor) {
    let bestDist = Infinity;
    let bestPoint: Point | null = null;
    for (let i = 0; i < slabPts.length; i++) {
      const j = (i + 1) % slabPts.length;
      const sdx = slabPts[j].x - slabPts[i].x;
      const sdy = slabPts[j].y - slabPts[i].y;
      const segLenSq = sdx * sdx + sdy * sdy;
      let t = 0;
      if (segLenSq > 0) {
        t = Math.max(0, Math.min(1, ((cursor.x - slabPts[i].x) * sdx + (cursor.y - slabPts[i].y) * sdy) / segLenSq));
      }
      const np = { x: slabPts[i].x + t * sdx, y: slabPts[i].y + t * sdy };
      const d = Math.sqrt((np.x - cursor.x) ** 2 + (np.y - cursor.y) ** 2);
      if (d < bestDist) {
        bestDist = d;
        bestPoint = np;
      }
    }
    if (bestPoint) {
      snapPoints.push({
        point: bestPoint,
        type: 'nearest',
        sourceShapeId: shape.id,
      });
    }
  }
  return snapPoints;
}

function getPuntniveauSnapPoints(shape: any, activeSnaps: string[]): any[] {
  const snapPoints: any[] = [];
  const pnvSnapPts = shape.points;
  if (pnvSnapPts.length < 3) return snapPoints;

  if (activeSnaps.includes('endpoint')) {
    for (let i = 0; i < pnvSnapPts.length; i++) {
      snapPoints.push({
        point: pnvSnapPts[i],
        type: 'endpoint',
        sourceShapeId: shape.id,
        pointIndex: i,
      });
    }
  }

  if (activeSnaps.includes('midpoint')) {
    for (let i = 0; i < pnvSnapPts.length; i++) {
      const j = (i + 1) % pnvSnapPts.length;
      snapPoints.push({
        point: {
          x: (pnvSnapPts[i].x + pnvSnapPts[j].x) / 2,
          y: (pnvSnapPts[i].y + pnvSnapPts[j].y) / 2,
        },
        type: 'midpoint',
        sourceShapeId: shape.id,
      });
    }
  }

  if (activeSnaps.includes('center')) {
    let cx = 0, cy = 0;
    for (const p of pnvSnapPts) { cx += p.x; cy += p.y; }
    cx /= pnvSnapPts.length;
    cy /= pnvSnapPts.length;
    snapPoints.push({
      point: { x: cx, y: cy },
      type: 'center',
      sourceShapeId: shape.id,
    });
  }
  return snapPoints;
}

function getSpaceSnapPoints(shape: any, activeSnaps: string[]): any[] {
  const snapPoints: any[] = [];
  const spacePts = (shape as SpaceShape).contourPoints;
  if (spacePts.length < 3) return snapPoints;

  if (activeSnaps.includes('endpoint')) {
    for (let i = 0; i < spacePts.length; i++) {
      snapPoints.push({
        point: spacePts[i],
        type: 'endpoint',
        sourceShapeId: shape.id,
        pointIndex: i,
      });
    }
  }

  if (activeSnaps.includes('midpoint')) {
    for (let i = 0; i < spacePts.length; i++) {
      const j = (i + 1) % spacePts.length;
      snapPoints.push({
        point: {
          x: (spacePts[i].x + spacePts[j].x) / 2,
          y: (spacePts[i].y + spacePts[j].y) / 2,
        },
        type: 'midpoint',
        sourceShapeId: shape.id,
      });
    }
  }

  if (activeSnaps.includes('center')) {
    snapPoints.push({
      point: (shape as SpaceShape).labelPosition,
      type: 'center',
      sourceShapeId: shape.id,
    });
  }
  return snapPoints;
}

function getPlateSystemSnapPoints(shape: any, activeSnaps: string[]): any[] {
  const snapPoints: any[] = [];
  const psShape = shape as PlateSystemShape;
  const psPts = psShape.contourPoints;
  const psBulges = psShape.contourBulges;
  if (psPts.length < 3) return snapPoints;

  if (activeSnaps.includes('endpoint')) {
    for (let i = 0; i < psPts.length; i++) {
      snapPoints.push({
        point: psPts[i],
        type: 'endpoint',
        sourceShapeId: shape.id,
        pointIndex: i,
      });
    }
  }

  if (activeSnaps.includes('midpoint')) {
    for (let i = 0; i < psPts.length; i++) {
      const j = (i + 1) % psPts.length;
      const b = psBulges?.[i] ?? 0;
      if (b !== 0 && Math.abs(b) > 0.0001) {
        snapPoints.push({
          point: bulgeArcMidpoint(psPts[i], psPts[j], b),
          type: 'midpoint',
          sourceShapeId: shape.id,
        });
      } else {
        snapPoints.push({
          point: {
            x: (psPts[i].x + psPts[j].x) / 2,
            y: (psPts[i].y + psPts[j].y) / 2,
          },
          type: 'midpoint',
          sourceShapeId: shape.id,
        });
      }
    }
  }

  if (activeSnaps.includes('center')) {
    if (psBulges) {
      for (let i = 0; i < psPts.length; i++) {
        const b = psBulges[i] ?? 0;
        if (b !== 0 && Math.abs(b) > 0.0001) {
          const j = (i + 1) % psPts.length;
          const arc = bulgeToArc(psPts[i], psPts[j], b);
          snapPoints.push({
            point: arc.center,
            type: 'center',
            sourceShapeId: shape.id,
          });
        }
      }
    }
    let pcx = 0, pcy = 0;
    for (const pt of psPts) { pcx += pt.x; pcy += pt.y; }
    pcx /= psPts.length;
    pcy /= psPts.length;
    snapPoints.push({
      point: { x: pcx, y: pcy },
      type: 'center',
      sourceShapeId: shape.id,
    });
  }
  return snapPoints;
}

function getSectionCalloutSnapPoints(shape: any, activeSnaps: string[]): any[] {
  const snapPoints: any[] = [];
  const scShape = shape as SectionCalloutShape;
  const scAngle = Math.atan2(scShape.end.y - scShape.start.y, scShape.end.x - scShape.start.x);
  if (activeSnaps.includes('endpoint')) {
    snapPoints.push(
      { point: scShape.start, type: 'endpoint', sourceShapeId: shape.id, sourceAngle: scAngle },
      { point: scShape.end, type: 'endpoint', sourceShapeId: shape.id, sourceAngle: scAngle },
    );
  }
  if (activeSnaps.includes('midpoint')) {
    snapPoints.push({
      point: {
        x: (scShape.start.x + scShape.end.x) / 2,
        y: (scShape.start.y + scShape.end.y) / 2,
      },
      type: 'midpoint',
      sourceShapeId: shape.id,
      sourceAngle: scAngle,
    });
  }
  return snapPoints;
}

function getSlabLabelSnapPoints(shape: any, activeSnaps: string[]): any[] {
  const snapPoints: any[] = [];
  if (activeSnaps.includes('endpoint')) {
    snapPoints.push({
      point: shape.position,
      type: 'endpoint',
      sourceShapeId: shape.id,
    });
  }
  return snapPoints;
}

function getSlabOpeningSnapPoints(shape: any, activeSnaps: string[], cursor?: Point): any[] {
  const snapPoints: any[] = [];
  const soPts = shape.points;
  if (soPts.length < 3) return snapPoints;

  if (activeSnaps.includes('endpoint')) {
    for (let i = 0; i < soPts.length; i++) {
      snapPoints.push({
        point: soPts[i],
        type: 'endpoint',
        sourceShapeId: shape.id,
        pointIndex: i,
      });
    }
  }

  if (activeSnaps.includes('midpoint')) {
    for (let i = 0; i < soPts.length; i++) {
      const j = (i + 1) % soPts.length;
      snapPoints.push({
        point: {
          x: (soPts[i].x + soPts[j].x) / 2,
          y: (soPts[i].y + soPts[j].y) / 2,
        },
        type: 'midpoint',
        sourceShapeId: shape.id,
      });
    }
  }

  if (activeSnaps.includes('center')) {
    let cx = 0, cy = 0;
    for (const p of soPts) {
      cx += p.x;
      cy += p.y;
    }
    cx /= soPts.length;
    cy /= soPts.length;
    snapPoints.push({
      point: { x: cx, y: cy },
      type: 'center',
      sourceShapeId: shape.id,
    });
  }

  if (activeSnaps.includes('nearest') && cursor) {
    let bestDist = Infinity;
    let bestPoint: Point | null = null;
    for (let i = 0; i < soPts.length; i++) {
      const j = (i + 1) % soPts.length;
      const sdx = soPts[j].x - soPts[i].x;
      const sdy = soPts[j].y - soPts[i].y;
      const segLenSq = sdx * sdx + sdy * sdy;
      let t = 0;
      if (segLenSq > 0) {
        t = Math.max(0, Math.min(1, ((cursor.x - soPts[i].x) * sdx + (cursor.y - soPts[i].y) * sdy) / segLenSq));
      }
      const np = { x: soPts[i].x + t * sdx, y: soPts[i].y + t * sdy };
      const d = Math.sqrt((np.x - cursor.x) ** 2 + (np.y - cursor.y) ** 2);
      if (d < bestDist) {
        bestDist = d;
        bestPoint = np;
      }
    }
    if (bestPoint) {
      snapPoints.push({
        point: bestPoint,
        type: 'nearest',
        sourceShapeId: shape.id,
      });
    }
  }
  return snapPoints;
}

function getWallOpeningSnapPoints(shape: any, activeSnaps: string[]): any[] {
  const snapPoints: any[] = [];
  const wo = shape as WallOpeningShape;
  const allShapes = useAppStore.getState().shapes;
  const hostWall = allShapes.find(s => s.id === wo.hostWallId) as WallShape | undefined;
  if (!hostWall) return snapPoints;

  const dx = hostWall.end.x - hostWall.start.x;
  const dy = hostWall.end.y - hostWall.start.y;
  const wallLen = Math.sqrt(dx * dx + dy * dy);
  if (wallLen < 0.001) return snapPoints;

  const dirX = dx / wallLen;
  const dirY = dy / wallLen;

  // Center point of the opening on the wall centerline
  const centerPt = {
    x: hostWall.start.x + dirX * wo.positionAlongWall,
    y: hostWall.start.y + dirY * wo.positionAlongWall,
  };

  if (activeSnaps.includes('center')) {
    snapPoints.push({ point: centerPt, type: 'center', sourceShapeId: shape.id });
  }

  if (activeSnaps.includes('endpoint')) {
    const halfW = wo.width / 2;
    const startPt = {
      x: hostWall.start.x + dirX * (wo.positionAlongWall - halfW),
      y: hostWall.start.y + dirY * (wo.positionAlongWall - halfW),
    };
    const endPt = {
      x: hostWall.start.x + dirX * (wo.positionAlongWall + halfW),
      y: hostWall.start.y + dirY * (wo.positionAlongWall + halfW),
    };
    const wallAngle = Math.atan2(dy, dx);
    snapPoints.push(
      { point: startPt, type: 'endpoint', sourceShapeId: shape.id, sourceAngle: wallAngle },
      { point: endPt, type: 'endpoint', sourceShapeId: shape.id, sourceAngle: wallAngle },
    );
  }

  return snapPoints;
}

function getRebarSnapPoints(shape: any, activeSnaps: string[]): any[] {
  const snapPoints: any[] = [];
  if (activeSnaps.includes('endpoint') || activeSnaps.includes('center')) {
    snapPoints.push({
      point: shape.position,
      type: 'center',
      sourceShapeId: shape.id,
    });
  }
  if (shape.viewMode === 'longitudinal' && shape.endPoint && activeSnaps.includes('endpoint')) {
    snapPoints.push({
      point: shape.endPoint,
      type: 'endpoint',
      sourceShapeId: shape.id,
    });
  }
  return snapPoints;
}

const SHAPE_TYPES = [
  'beam', 'gridline', 'level', 'pile', 'column', 'cpt', 'spot-elevation',
  'foundation-zone', 'wall', 'wall-opening', 'slab', 'slab-opening', 'slab-label', 'puntniveau', 'space',
  'plate-system', 'section-callout', 'rebar',
] as const;

const handlers: Record<string, (...args: any[]) => any[]> = {
  'beam': getBeamSnapPoints,
  'gridline': getGridlineSnapPoints,
  'level': getLevelSnapPoints,
  'pile': getPileSnapPoints,
  'column': getColumnSnapPoints,
  'cpt': getCptSnapPoints,
  'spot-elevation': getSpotElevationSnapPoints,
  'foundation-zone': getFoundationZoneSnapPoints,
  'wall': getWallSnapPoints,
  'wall-opening': getWallOpeningSnapPoints,
  'slab': getSlabSnapPoints,
  'slab-opening': getSlabOpeningSnapPoints,
  'slab-label': getSlabLabelSnapPoints,
  'puntniveau': getPuntniveauSnapPoints,
  'space': getSpaceSnapPoints,
  'plate-system': getPlateSystemSnapPoints,
  'section-callout': getSectionCalloutSnapPoints,
  'rebar': getRebarSnapPoints,
};

export function registerSnapPoints(): void {
  for (const type of SHAPE_TYPES) {
    snapProviderRegistry.registerSnap(type, handlers[type]);
  }
}

export function unregisterSnapPoints(): void {
  for (const type of SHAPE_TYPES) {
    snapProviderRegistry.unregisterSnap(type);
  }
}
