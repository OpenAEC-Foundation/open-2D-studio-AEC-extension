import type { GridlineShape, PlateSystemShape, BeamShape, WallShape, Point } from 'open-2d-studio';
import { generateId, modelBehaviorRegistry } from 'open-2d-studio';

export function registerModelBehaviors(): void {
  modelBehaviorRegistry.registerPreAdd('gridline', (shape: any, _allShapes: any[], drawings: any[], layers: any[]) => {
    const gl = shape as GridlineShape;
    const drawing = drawings.find((d: any) => d.id === gl.drawingId);
    if (!drawing || drawing.drawingType !== 'plan') return null;

    if (!gl.projectGridId) {
      gl.projectGridId = gl.id;
    }

    const otherPlanDrawings = drawings.filter(
      (d: any) => d.drawingType === 'plan' && d.id !== gl.drawingId
    );

    const clones: any[] = [];
    for (const otherDrawing of otherPlanDrawings) {
      const otherLayer = layers.find((l: any) => l.drawingId === otherDrawing.id);
      if (otherLayer) {
        clones.push({
          ...gl,
          id: generateId(),
          drawingId: otherDrawing.id,
          layerId: otherLayer.id,
        });
      }
    }

    return clones.length > 0 ? clones : null;
  });

  modelBehaviorRegistry.registerPostDelete('gridline', (shape: any, allShapes: any[]) => {
    const deleteIds: string[] = [];
    const updates = new Map<string, Record<string, any>>();

    const pgId = (shape as GridlineShape).projectGridId;
    if (pgId) {
      for (const s of allShapes) {
        if (s.id !== shape.id && s.type === 'gridline' &&
            (s as GridlineShape).projectGridId === pgId) {
          deleteIds.push(s.id);
        }
      }
    }

    return { deleteIds, updates };
  });

  modelBehaviorRegistry.registerPostDelete('plate-system', (shape: any, _allShapes: any[]) => {
    const deleteIds: string[] = [];
    const updates = new Map<string, Record<string, any>>();

    const ps = shape as PlateSystemShape;
    if (ps.childShapeIds) {
      for (const childId of ps.childShapeIds) {
        deleteIds.push(childId);
      }
    }

    return { deleteIds, updates };
  });

  // When a wall is deleted, reset miter caps on any walls/beams that were joined to it,
  // and also delete all hosted wall-openings.
  modelBehaviorRegistry.registerPostDelete('wall', (shape: any, allShapes: any[]) => {
    const deleteIds: string[] = [];
    const updates = new Map<string, Record<string, any>>();

    const wall = shape as WallShape;
    const tolerance = 1.0; // mm

    const distSq = (a: Point, b: Point) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
    const tolSq = tolerance * tolerance;

    // Find other walls/beams whose mitered end touches the deleted wall's start or end
    for (const s of allShapes) {
      if (s.id === wall.id) continue;

      // Delete hosted wall-openings
      if (s.type === 'wall-opening' && (s as any).hostWallId === wall.id) {
        deleteIds.push(s.id);
        continue;
      }

      if (s.type !== 'wall' && s.type !== 'beam') continue;

      const other = s as any as { id: string; start: Point; end: Point; startCap?: string; endCap?: string };
      const resetProps: Record<string, any> = {};

      // Check if the other shape's start is mitered and touches either end of the deleted wall
      if (other.startCap === 'miter') {
        if (distSq(other.start, wall.start) < tolSq || distSq(other.start, wall.end) < tolSq) {
          resetProps.startCap = 'butt';
          resetProps.startMiterAngle = undefined;
        }
      }

      // Check if the other shape's end is mitered and touches either end of the deleted wall
      if (other.endCap === 'miter') {
        if (distSq(other.end, wall.start) < tolSq || distSq(other.end, wall.end) < tolSq) {
          resetProps.endCap = 'butt';
          resetProps.endMiterAngle = undefined;
        }
      }

      if (Object.keys(resetProps).length > 0) {
        updates.set(s.id, resetProps);
      }
    }

    return { deleteIds, updates };
  });

  modelBehaviorRegistry.registerPostDelete('beam', (shape: any, allShapes: any[]) => {
    const deleteIds: string[] = [];
    const updates = new Map<string, Record<string, any>>();

    const beam = shape as BeamShape;
    if (beam.plateSystemId) {
      const parent = allShapes.find((s: any) => s.id === beam.plateSystemId) as PlateSystemShape | undefined;
      if (parent && parent.childShapeIds) {
        updates.set(beam.plateSystemId, {
          childShapeIds: parent.childShapeIds.filter((cid: string) => cid !== shape.id),
        });
      }
    }

    // Reset miter caps on walls/beams that were joined to the deleted beam
    const beamWithPoints = beam as any as { start: Point; end: Point };
    if (beamWithPoints.start && beamWithPoints.end) {
      const tolerance = 1.0;
      const distSq = (a: Point, b: Point) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
      const tolSq = tolerance * tolerance;

      for (const s of allShapes) {
        if (s.id === beam.id) continue;
        if (s.type !== 'wall' && s.type !== 'beam') continue;

        const other = s as any as { id: string; start: Point; end: Point; startCap?: string; endCap?: string };
        const existing = updates.get(s.id) || {};

        if (other.startCap === 'miter') {
          if (distSq(other.start, beamWithPoints.start) < tolSq || distSq(other.start, beamWithPoints.end) < tolSq) {
            existing.startCap = 'butt';
            existing.startMiterAngle = undefined;
          }
        }

        if (other.endCap === 'miter') {
          if (distSq(other.end, beamWithPoints.start) < tolSq || distSq(other.end, beamWithPoints.end) < tolSq) {
            existing.endCap = 'butt';
            existing.endMiterAngle = undefined;
          }
        }

        if (Object.keys(existing).length > 0) {
          updates.set(s.id, existing);
        }
      }
    }

    return { deleteIds, updates };
  });

  // When a wall-opening is deleted, nothing special needed
  modelBehaviorRegistry.registerPostDelete('wall-opening', (_shape: any, _allShapes: any[]) => {
    return { deleteIds: [], updates: new Map<string, Record<string, any>>() };
  });

}

export function unregisterModelBehaviors(): void {
  unregisterLevelPreAdd();
  modelBehaviorRegistry.unregisterPreAdd('gridline');
  modelBehaviorRegistry.unregisterPostDelete('gridline');
  modelBehaviorRegistry.unregisterPostDelete('plate-system');
  modelBehaviorRegistry.unregisterPostDelete('wall');
  modelBehaviorRegistry.unregisterPostDelete('wall-opening');
  modelBehaviorRegistry.unregisterPostDelete('beam');
}
