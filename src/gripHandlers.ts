import type { Point, BeamShape, GridlineShape, LevelShape, PileShape, WallShape, SectionCalloutShape, PlateSystemShape, PuntniveauShape, GripHandler } from 'open-2d-studio';
import { bulgeArcMidpoint, calculateBulgeFrom3Points, formatPeilLabel, calculatePeilFromY, formatSectionPeilLabel, useAppStore, gripProviderRegistry } from 'open-2d-studio';

const beamGripHandler: GripHandler = {
  getGripPoints(shape: any): Point[] {
    const beamBulge = (shape as BeamShape).bulge;
    if (beamBulge && Math.abs(beamBulge) > 0.0001) {
      const arcMid = bulgeArcMidpoint(shape.start, shape.end, beamBulge);
      return [shape.start, shape.end, arcMid, arcMid];
    }
    return [
      shape.start,
      shape.end,
      { x: (shape.start.x + shape.end.x) / 2, y: (shape.start.y + shape.end.y) / 2 },
    ];
  },
  getReferencePoint(shape: any): Point {
    return shape.start;
  },
  computeBodyMove(shape: any, newPos: Point) {
    const ref = shape.start;
    const dx = newPos.x - ref.x;
    const dy = newPos.y - ref.y;
    return {
      start: { x: shape.start.x + dx, y: shape.start.y + dy },
      end: { x: shape.end.x + dx, y: shape.end.y + dy },
    };
  },
  computeGripUpdate(shape: any, gripIndex: number, newPos: Point) {
    const beamShape = shape as BeamShape;
    const beamIsArc = beamShape.bulge && Math.abs(beamShape.bulge) > 0.0001;
    if (gripIndex === 0) return { start: newPos };
    if (gripIndex === 1) return { end: newPos };
    if (gripIndex === 2) {
      const origMid = beamIsArc
        ? bulgeArcMidpoint(beamShape.start, beamShape.end, beamShape.bulge!)
        : { x: (beamShape.start.x + beamShape.end.x) / 2, y: (beamShape.start.y + beamShape.end.y) / 2 };
      const dx = newPos.x - origMid.x;
      const dy = newPos.y - origMid.y;
      return {
        start: { x: beamShape.start.x + dx, y: beamShape.start.y + dy },
        end: { x: beamShape.end.x + dx, y: beamShape.end.y + dy },
      };
    }
    if (gripIndex === 3 && beamIsArc) {
      const newBulge = calculateBulgeFrom3Points(beamShape.start, newPos, beamShape.end);
      return { bulge: newBulge };
    }
    return null;
  },
};

const gridlineGripHandler: GripHandler = {
  getGripPoints(shape: any): Point[] {
    return [
      shape.start,
      shape.end,
      { x: (shape.start.x + shape.end.x) / 2, y: (shape.start.y + shape.end.y) / 2 },
    ];
  },
  getReferencePoint(shape: any): Point {
    return (shape as GridlineShape).start;
  },
  computeBodyMove(shape: any, newPos: Point) {
    const gl = shape as GridlineShape;
    const ref = gl.start;
    const dx = newPos.x - ref.x;
    const dy = newPos.y - ref.y;
    return {
      start: { x: gl.start.x + dx, y: gl.start.y + dy },
      end: { x: gl.end.x + dx, y: gl.end.y + dy },
    };
  },
  computeGripUpdate(shape: any, gripIndex: number, newPos: Point) {
    const gridlineShape = shape as GridlineShape;
    const glDir = {
      x: gridlineShape.end.x - gridlineShape.start.x,
      y: gridlineShape.end.y - gridlineShape.start.y,
    };
    const glLen = Math.sqrt(glDir.x * glDir.x + glDir.y * glDir.y);

    if (gripIndex === 0 || gripIndex === 1) {
      const draggedPt = gripIndex === 0 ? gridlineShape.start : gridlineShape.end;
      const totalDx = newPos.x - draggedPt.x;
      const totalDy = newPos.y - draggedPt.y;

      if (glLen < 1e-9) {
        return {
          start: { x: gridlineShape.start.x + totalDx, y: gridlineShape.start.y + totalDy },
          end: { x: gridlineShape.end.x + totalDx, y: gridlineShape.end.y + totalDy },
        };
      }

      const unitDir = { x: glDir.x / glLen, y: glDir.y / glLen };
      const alongDist = totalDx * unitDir.x + totalDy * unitDir.y;
      const alongShiftX = alongDist * unitDir.x;
      const alongShiftY = alongDist * unitDir.y;
      const newDraggedPt = {
        x: draggedPt.x + alongShiftX,
        y: draggedPt.y + alongShiftY,
      };

      return {
        start: gripIndex === 0 ? newDraggedPt : gridlineShape.start,
        end: gripIndex === 0 ? gridlineShape.end : newDraggedPt,
      };
    }

    if (gripIndex === 2) {
      const origMid = {
        x: (gridlineShape.start.x + gridlineShape.end.x) / 2,
        y: (gridlineShape.start.y + gridlineShape.end.y) / 2,
      };
      const dx = newPos.x - origMid.x;
      const dy = newPos.y - origMid.y;
      return {
        start: { x: gridlineShape.start.x + dx, y: gridlineShape.start.y + dy },
        end: { x: gridlineShape.end.x + dx, y: gridlineShape.end.y + dy },
      };
    }
    return null;
  },
};

const levelGripHandler: GripHandler = {
  getGripPoints(shape: any): Point[] {
    return [
      shape.start,
      shape.end,
      { x: (shape.start.x + shape.end.x) / 2, y: (shape.start.y + shape.end.y) / 2 },
    ];
  },
  getReferencePoint(shape: any): Point {
    return (shape as LevelShape).start;
  },
  computeBodyMove(shape: any, newPos: Point) {
    const lv = shape as LevelShape;
    const ref = lv.start;
    const dy = newPos.y - ref.y;
    const dx = newPos.x - ref.x;
    const newLvStartY = lv.start.y + dy;
    if (shape.id.startsWith('section-ref-lv-')) {
      const newElevation = -newLvStartY;
      return {
        start: { x: lv.start.x + dx, y: newLvStartY },
        end: { x: lv.end.x + dx, y: lv.end.y + dy },
        peil: newElevation,
        elevation: newElevation,
        label: formatSectionPeilLabel(newElevation, useAppStore.getState().unitSettings),
      };
    }
    const newLvPeil = calculatePeilFromY(newLvStartY);
    return {
      start: { x: lv.start.x + dx, y: newLvStartY },
      end: { x: lv.end.x + dx, y: lv.end.y + dy },
      peil: newLvPeil,
      elevation: newLvPeil,
      label: formatPeilLabel(newLvPeil),
    };
  },
  computeGripUpdate(shape: any, gripIndex: number, newPos: Point) {
    const levelShape = shape as LevelShape;
    const isSectionRef = shape.id.startsWith('section-ref-lv-');
    if (gripIndex === 0 || gripIndex === 1) {
      const draggedPt = gripIndex === 0 ? levelShape.start : levelShape.end;
      const newDraggedPt = { x: newPos.x, y: draggedPt.y };
      return {
        start: gripIndex === 0 ? newDraggedPt : levelShape.start,
        end: gripIndex === 0 ? levelShape.end : newDraggedPt,
      };
    }
    if (gripIndex === 2) {
      const origMid = {
        x: (levelShape.start.x + levelShape.end.x) / 2,
        y: (levelShape.start.y + levelShape.end.y) / 2,
      };
      const dx = newPos.x - origMid.x;
      const dy = newPos.y - origMid.y;
      const newStartY = levelShape.start.y + dy;
      if (isSectionRef) {
        const newElevation = -newStartY;
        return {
          start: { x: levelShape.start.x + dx, y: newStartY },
          end: { x: levelShape.end.x + dx, y: levelShape.end.y + dy },
          peil: newElevation,
          elevation: newElevation,
          label: formatSectionPeilLabel(newElevation, useAppStore.getState().unitSettings),
        };
      }
      const newPeil = calculatePeilFromY(newStartY);
      return {
        start: { x: levelShape.start.x + dx, y: newStartY },
        end: { x: levelShape.end.x + dx, y: levelShape.end.y + dy },
        peil: newPeil,
        elevation: newPeil,
        label: formatPeilLabel(newPeil),
      };
    }
    return null;
  },
};

const pileGripHandler: GripHandler = {
  getGripPoints(shape: any): Point[] {
    return [shape.position];
  },
  getReferencePoint(shape: any): Point {
    return (shape as PileShape).position;
  },
  computeBodyMove(shape: any, newPos: Point) {
    const pl = shape as PileShape;
    const ref = pl.position;
    const dx = newPos.x - ref.x;
    const dy = newPos.y - ref.y;
    return { position: { x: pl.position.x + dx, y: pl.position.y + dy } };
  },
  computeGripUpdate(_shape: any, gripIndex: number, newPos: Point) {
    if (gripIndex === 0) return { position: newPos };
    return null;
  },
};

const cptGripHandler: GripHandler = {
  getGripPoints(shape: any): Point[] {
    return [shape.position];
  },
  getReferencePoint(shape: any): Point {
    return shape.position;
  },
  computeBodyMove(shape: any, newPos: Point) {
    const ref = shape.position;
    const dx = newPos.x - ref.x;
    const dy = newPos.y - ref.y;
    return { position: { x: shape.position.x + dx, y: shape.position.y + dy } };
  },
  computeGripUpdate(_shape: any, gripIndex: number, newPos: Point) {
    if (gripIndex === 0) return { position: newPos };
    return null;
  },
};

const foundationZoneGripHandler: GripHandler = {
  getGripPoints(shape: any): Point[] {
    return [...(shape.contourPoints || [])];
  },
  getReferencePoint(shape: any): Point {
    return (shape.contourPoints || [{ x: 0, y: 0 }])[0];
  },
  computeBodyMove(shape: any, newPos: Point) {
    const ref = (shape.contourPoints || [{ x: 0, y: 0 }])[0];
    const dx = newPos.x - ref.x;
    const dy = newPos.y - ref.y;
    return {
      contourPoints: shape.contourPoints.map((p: any) => ({ x: p.x + dx, y: p.y + dy })),
    };
  },
  computeGripUpdate(shape: any, gripIndex: number, newPos: Point) {
    if (gripIndex >= 0 && gripIndex < shape.contourPoints.length) {
      const newPoints = [...shape.contourPoints];
      newPoints[gripIndex] = newPos;
      return { contourPoints: newPoints };
    }
    return null;
  },
};

const wallGripHandler: GripHandler = {
  getGripPoints(shape: any): Point[] {
    const wallBulge = (shape as WallShape).bulge;
    if (wallBulge && Math.abs(wallBulge) > 0.0001) {
      const arcMid = bulgeArcMidpoint(shape.start, shape.end, wallBulge);
      return [shape.start, shape.end, arcMid, arcMid];
    }
    return [
      shape.start,
      shape.end,
      { x: (shape.start.x + shape.end.x) / 2, y: (shape.start.y + shape.end.y) / 2 },
    ];
  },
  getReferencePoint(shape: any): Point {
    return (shape as WallShape).start;
  },
  computeBodyMove(shape: any, newPos: Point) {
    const wa = shape as WallShape;
    const ref = wa.start;
    const dx = newPos.x - ref.x;
    const dy = newPos.y - ref.y;
    return {
      start: { x: wa.start.x + dx, y: wa.start.y + dy },
      end: { x: wa.end.x + dx, y: wa.end.y + dy },
    };
  },
  computeGripUpdate(shape: any, gripIndex: number, newPos: Point) {
    const wallShape = shape as WallShape;
    const wallIsArc = wallShape.bulge && Math.abs(wallShape.bulge) > 0.0001;
    if (gripIndex === 0) return { start: newPos };
    if (gripIndex === 1) return { end: newPos };
    if (gripIndex === 2) {
      const origMid = wallIsArc
        ? bulgeArcMidpoint(wallShape.start, wallShape.end, wallShape.bulge!)
        : { x: (wallShape.start.x + wallShape.end.x) / 2, y: (wallShape.start.y + wallShape.end.y) / 2 };
      const dx = newPos.x - origMid.x;
      const dy = newPos.y - origMid.y;
      return {
        start: { x: wallShape.start.x + dx, y: wallShape.start.y + dy },
        end: { x: wallShape.end.x + dx, y: wallShape.end.y + dy },
      };
    }
    if (gripIndex === 3 && wallIsArc) {
      const newBulge = calculateBulgeFrom3Points(wallShape.start, newPos, wallShape.end);
      return { bulge: newBulge };
    }
    return null;
  },
};

const sectionCalloutGripHandler: GripHandler = {
  getGripPoints(shape: any): Point[] {
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
  },
  getReferencePoint(shape: any): Point {
    return (shape as SectionCalloutShape).start;
  },
  computeBodyMove(shape: any, newPos: Point) {
    const sc = shape as SectionCalloutShape;
    const ref = sc.start;
    const dx = newPos.x - ref.x;
    const dy = newPos.y - ref.y;
    return {
      start: { x: sc.start.x + dx, y: sc.start.y + dy },
      end: { x: sc.end.x + dx, y: sc.end.y + dy },
    };
  },
  computeGripUpdate(shape: any, gripIndex: number, newPos: Point) {
    const scShape = shape as SectionCalloutShape;
    if (gripIndex === 0) return { start: newPos };
    if (gripIndex === 1) return { end: newPos };
    if (gripIndex === 2) {
      const origMid = {
        x: (scShape.start.x + scShape.end.x) / 2,
        y: (scShape.start.y + scShape.end.y) / 2,
      };
      const dx = newPos.x - origMid.x;
      const dy = newPos.y - origMid.y;
      return {
        start: { x: scShape.start.x + dx, y: scShape.start.y + dy },
        end: { x: scShape.end.x + dx, y: scShape.end.y + dy },
      };
    }
    if (gripIndex === 3) {
      const scA = Math.atan2(scShape.end.y - scShape.start.y, scShape.end.x - scShape.start.x);
      const scPerpS = scShape.flipDirection ? 1 : -1;
      const scPerpDx = -Math.sin(scA) * scPerpS;
      const scPerpDy = Math.cos(scA) * scPerpS;
      const scMidPt = {
        x: (scShape.start.x + scShape.end.x) / 2,
        y: (scShape.start.y + scShape.end.y) / 2,
      };
      const vecX = newPos.x - scMidPt.x;
      const vecY = newPos.y - scMidPt.y;
      const newDepth = Math.max(0, vecX * scPerpDx + vecY * scPerpDy);
      return { viewDepth: Math.round(newDepth) };
    }
    return null;
  },
};

const slabGripHandler: GripHandler = {
  getGripPoints(shape: any): Point[] {
    const slabPts: Point[] = [...shape.points];
    for (let si = 0; si < shape.points.length; si++) {
      const sj = (si + 1) % shape.points.length;
      slabPts.push({
        x: (shape.points[si].x + shape.points[sj].x) / 2,
        y: (shape.points[si].y + shape.points[sj].y) / 2,
      });
    }
    return slabPts;
  },
  getReferencePoint(shape: any): Point {
    return shape.points[0] || { x: 0, y: 0 };
  },
  computeBodyMove(shape: any, newPos: Point) {
    const ref = shape.points[0] || { x: 0, y: 0 };
    const dx = newPos.x - ref.x;
    const dy = newPos.y - ref.y;
    return { points: shape.points.map((p: any) => ({ x: p.x + dx, y: p.y + dy })) };
  },
  computeGripUpdate(shape: any, gripIndex: number, newPos: Point) {
    const slabVertexCount = shape.points.length;
    if (gripIndex < 0) return null;

    if (gripIndex < slabVertexCount) {
      const newPoints = shape.points.map((p: any, i: number) =>
        i === gripIndex ? { x: newPos.x, y: newPos.y } : p
      );
      return { points: newPoints };
    }

    const slabEdgeIdx = gripIndex - slabVertexCount;
    if (slabEdgeIdx < 0 || slabEdgeIdx >= slabVertexCount) return null;

    const svi = slabEdgeIdx;
    const svj = (slabEdgeIdx + 1) % slabVertexCount;
    const slabMidX = (shape.points[svi].x + shape.points[svj].x) / 2;
    const slabMidY = (shape.points[svi].y + shape.points[svj].y) / 2;

    const edgeDx = shape.points[svj].x - shape.points[svi].x;
    const edgeDy = shape.points[svj].y - shape.points[svi].y;
    const edgeLen = Math.sqrt(edgeDx * edgeDx + edgeDy * edgeDy);

    if (edgeLen < 0.001) {
      const tdx = newPos.x - slabMidX;
      const tdy = newPos.y - slabMidY;
      const newPts = shape.points.map((p: any, i: number) => {
        if (i === svi || i === svj) return { x: p.x + tdx, y: p.y + tdy };
        return p;
      });
      return { points: newPts };
    }

    const perpX = -edgeDy / edgeLen;
    const perpY = edgeDx / edgeLen;
    const dragVecX = newPos.x - slabMidX;
    const dragVecY = newPos.y - slabMidY;
    const perpProj = dragVecX * perpX + dragVecY * perpY;
    const offsetX = perpProj * perpX;
    const offsetY = perpProj * perpY;
    const newSlabPoints = shape.points.map((p: any, i: number) => {
      if (i === svi || i === svj) return { x: p.x + offsetX, y: p.y + offsetY };
      return p;
    });
    return { points: newSlabPoints };
  },
};

const puntniveauGripHandler: GripHandler = {
  getGripPoints(shape: any): Point[] {
    const pnv = shape as PuntniveauShape;
    return pnv.points.map(p => ({ x: p.x, y: p.y }));
  },
  getReferencePoint(shape: any): Point {
    return (shape as PuntniveauShape).points[0] || { x: 0, y: 0 };
  },
  computeBodyMove(shape: any, newPos: Point) {
    const ref = (shape as PuntniveauShape).points[0] || { x: 0, y: 0 };
    const dx = newPos.x - ref.x;
    const dy = newPos.y - ref.y;
    return { points: (shape as PuntniveauShape).points.map(p => ({ x: p.x + dx, y: p.y + dy })) };
  },
  computeGripUpdate(shape: any, gripIndex: number, newPos: Point) {
    const pnv = shape as PuntniveauShape;
    if (gripIndex < 0 || gripIndex >= pnv.points.length) return null;
    const newPnvPoints = pnv.points.map((p, i) =>
      i === gripIndex ? { x: newPos.x, y: newPos.y } : p
    );
    return { points: newPnvPoints };
  },
};

const plateSystemGripHandler: GripHandler = {
  getGripPoints(shape: any): Point[] {
    const psShape = shape as PlateSystemShape;
    const psContour = psShape.contourPoints;
    const psBulges = psShape.contourBulges;
    const psPts: Point[] = [...psContour];
    for (let i = 0; i < psContour.length; i++) {
      const j = (i + 1) % psContour.length;
      const b = psBulges ? (psBulges[i] ?? 0) : 0;
      if (Math.abs(b) > 0.0001) {
        psPts.push(bulgeArcMidpoint(psContour[i], psContour[j], b));
      } else {
        psPts.push({
          x: (psContour[i].x + psContour[j].x) / 2,
          y: (psContour[i].y + psContour[j].y) / 2,
        });
      }
    }
    return psPts;
  },
  getReferencePoint(shape: any): Point {
    return (shape as PlateSystemShape).contourPoints[0] || { x: 0, y: 0 };
  },
  computeBodyMove(shape: any, newPos: Point) {
    const ref = (shape as PlateSystemShape).contourPoints[0] || { x: 0, y: 0 };
    const dx = newPos.x - ref.x;
    const dy = newPos.y - ref.y;
    return {
      contourPoints: (shape as PlateSystemShape).contourPoints.map(p => ({ x: p.x + dx, y: p.y + dy })),
    };
  },
  computeGripUpdate(shape: any, gripIndex: number, newPos: Point) {
    const psShape = shape as PlateSystemShape;
    const psContour = psShape.contourPoints;
    const psBulges = psShape.contourBulges;
    const psVertexCount = psContour.length;
    if (gripIndex < 0) return null;

    if (gripIndex < psVertexCount) {
      const newContour = psContour.map((p, i) =>
        i === gripIndex ? { x: newPos.x, y: newPos.y } : p
      );
      return { contourPoints: newContour };
    }

    const edgeIdx = gripIndex - psVertexCount;
    if (edgeIdx < 0 || edgeIdx >= psVertexCount) return null;

    const vi = edgeIdx;
    const vj = (edgeIdx + 1) % psVertexCount;
    const b = psBulges ? (psBulges[edgeIdx] ?? 0) : 0;

    if (Math.abs(b) > 0.0001) {
      const newBulge = calculateBulgeFrom3Points(psContour[vi], newPos, psContour[vj]);
      const newBulges = psBulges ? [...psBulges] : new Array(psVertexCount).fill(0);
      while (newBulges.length < psVertexCount) newBulges.push(0);
      newBulges[edgeIdx] = newBulge;
      return { contourBulges: newBulges };
    }

    const midX = (psContour[vi].x + psContour[vj].x) / 2;
    const midY = (psContour[vi].y + psContour[vj].y) / 2;
    const dx = newPos.x - midX;
    const dy = newPos.y - midY;
    const newContour = psContour.map((p, i) => {
      if (i === vi || i === vj) {
        return { x: p.x + dx, y: p.y + dy };
      }
      return p;
    });
    return { contourPoints: newContour };
  },
};

const GRIP_TYPES = [
  'beam', 'gridline', 'level', 'pile', 'cpt', 'foundation-zone',
  'wall', 'section-callout', 'slab', 'puntniveau', 'plate-system',
] as const;

const gripHandlers: Record<string, GripHandler> = {
  'beam': beamGripHandler,
  'gridline': gridlineGripHandler,
  'level': levelGripHandler,
  'pile': pileGripHandler,
  'cpt': cptGripHandler,
  'foundation-zone': foundationZoneGripHandler,
  'wall': wallGripHandler,
  'section-callout': sectionCalloutGripHandler,
  'slab': slabGripHandler,
  'puntniveau': puntniveauGripHandler,
  'plate-system': plateSystemGripHandler,
};

export function registerGripHandlers(): void {
  for (const type of GRIP_TYPES) {
    gripProviderRegistry.register(type, gripHandlers[type]);
  }
}

export function unregisterGripHandlers(): void {
  for (const type of GRIP_TYPES) {
    gripProviderRegistry.unregister(type);
  }
}
