import type { GridlineShape, PlateSystemShape, BeamShape } from 'open-2d-studio';
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

    return { deleteIds, updates };
  });
}

export function unregisterModelBehaviors(): void {
  modelBehaviorRegistry.unregisterPreAdd('gridline');
  modelBehaviorRegistry.unregisterPostDelete('gridline');
  modelBehaviorRegistry.unregisterPostDelete('plate-system');
  modelBehaviorRegistry.unregisterPostDelete('beam');
}
