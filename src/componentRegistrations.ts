/**
 * Component Instance Registrations — registers the 'component-instance' shape type
 * in all relevant registries: bounds, renderer, preview renderer, snap points, grip handler.
 */

import type { GripHandler, Point, ShapeBounds, ShapeRenderContext } from 'open-2d-studio';
import {
  boundsRegistry,
  shapeRendererRegistry,
  shapePreviewRegistry,
  snapProviderRegistry,
  gripProviderRegistry,
} from 'open-2d-studio';

const SHAPE_TYPE = 'component-instance';

// ── Helpers ──────────────────────────────────────────────────

/**
 * Read the pre-computed flattenedGeometry cache stored on the shape at runtime.
 * The host renderer attaches `flattenedGeometry` to component instances before
 * delegating to the registry, so we access it as a dynamic property.
 */
function getFlattenedGeometry(shape: any): { shapes: any[]; bounds: any } | null {
  return shape.flattenedGeometry ?? null;
}

// ── Bounds ───────────────────────────────────────────────────

function getComponentInstanceBounds(shape: any): ShapeBounds | null {
  const cached = getFlattenedGeometry(shape);
  if (!cached) return null;
  const { bounds } = cached;
  if (
    bounds == null ||
    bounds.minX == null ||
    bounds.minY == null ||
    bounds.maxX == null ||
    bounds.maxY == null
  ) {
    return null;
  }
  return {
    minX: bounds.minX,
    minY: bounds.minY,
    maxX: bounds.maxX,
    maxY: bounds.maxY,
  };
}

// ── Renderer ─────────────────────────────────────────────────

function drawComponentInstance(renderCtx: ShapeRenderContext, shape: any, invertColors: boolean): void {
  const cached = getFlattenedGeometry(shape);
  const ctx = renderCtx.ctx;

  if (!cached || !cached.shapes || cached.shapes.length === 0) {
    // Placeholder: dashed rectangle centred on the instance insertion point.
    // The canvas context is already transformed to model (world) coordinates.
    const x = shape.positionX ?? 0;
    const y = shape.positionY ?? 0;
    const size = 500; // 500mm placeholder square
    ctx.save();
    ctx.strokeStyle = invertColors ? '#000000' : '#888888';
    ctx.lineWidth = renderCtx.getLineWidth(1);
    ctx.setLineDash(renderCtx.getLineDash('dashed'));
    ctx.strokeRect(x - size / 2, y - size / 2, size, size);
    ctx.setLineDash([]);
    ctx.restore();
    return;
  }

  // Delegate each flattened sub-shape to the main shape renderer registry
  for (const subShape of cached.shapes) {
    const renderer = shapeRendererRegistry.getSimple(subShape.type);
    if (renderer) {
      renderer(ctx, subShape, invertColors, renderCtx);
    }
  }
}

function drawComponentInstancePreview(renderCtx: ShapeRenderContext, shape: any, invertColors: boolean): void {
  const cached = getFlattenedGeometry(shape);
  const ctx = renderCtx.ctx;

  if (!cached || !cached.shapes || cached.shapes.length === 0) {
    // Placeholder outline only — same coordinate system as drawComponentInstance
    const x = shape.positionX ?? 0;
    const y = shape.positionY ?? 0;
    const size = 500;
    ctx.save();
    ctx.strokeStyle = invertColors ? '#000000' : '#aaaaaa';
    ctx.lineWidth = renderCtx.getLineWidth(1);
    ctx.setLineDash(renderCtx.getLineDash('dashed'));
    ctx.strokeRect(x - size / 2, y - size / 2, size, size);
    ctx.setLineDash([]);
    ctx.restore();
    return;
  }

  // Delegate each flattened sub-shape with outline-only style override
  for (const subShape of cached.shapes) {
    const previewRenderer = shapePreviewRegistry.get(subShape.type);
    if (previewRenderer) {
      previewRenderer(ctx, subShape, subShape.style, null, invertColors, renderCtx);
    } else {
      // Fallback: use the simple renderer with no fill
      const renderer = shapeRendererRegistry.getSimple(subShape.type);
      if (renderer) {
        const outlineShape = { ...subShape, style: { ...subShape.style, fillColor: undefined } };
        renderer(ctx, outlineShape, invertColors, renderCtx);
      }
    }
  }
}

// ── Snap Points ──────────────────────────────────────────────

function getComponentInstanceSnapPoints(shape: any, activeSnaps: string[]): any[] {
  const cached = getFlattenedGeometry(shape);
  if (!cached || !cached.shapes) return [];

  const snapPoints: any[] = [];

  if (activeSnaps.includes('endpoint')) {
    for (const subShape of cached.shapes) {
      // Extract line/polyline endpoints
      if (subShape.start) {
        snapPoints.push({ point: subShape.start, type: 'endpoint', sourceShapeId: shape.id });
      }
      if (subShape.end) {
        snapPoints.push({ point: subShape.end, type: 'endpoint', sourceShapeId: shape.id });
      }
      if (subShape.points && Array.isArray(subShape.points)) {
        for (const pt of subShape.points) {
          snapPoints.push({ point: pt, type: 'endpoint', sourceShapeId: shape.id });
        }
      }
    }
  }

  // Always expose the instance insertion point as a snap target
  if (activeSnaps.includes('endpoint') || activeSnaps.includes('nearest')) {
    snapPoints.push({
      point: { x: shape.positionX ?? 0, y: shape.positionY ?? 0 },
      type: 'endpoint',
      sourceShapeId: shape.id,
    });
  }

  return snapPoints;
}

// ── Grip Handler ─────────────────────────────────────────────

const componentInstanceGripHandler: GripHandler = {
  getGripPoints(shape: any): Point[] {
    return [{ x: shape.positionX ?? 0, y: shape.positionY ?? 0 }];
  },

  getReferencePoint(shape: any): Point {
    return { x: shape.positionX ?? 0, y: shape.positionY ?? 0 };
  },

  computeBodyMove(shape: any, newPos: Point): Partial<typeof shape> {
    return {
      positionX: newPos.x,
      positionY: newPos.y,
    };
  },

  computeGripUpdate(shape: any, gripIndex: number, newPos: Point): Partial<typeof shape> | null {
    if (gripIndex === 0) {
      return {
        positionX: newPos.x,
        positionY: newPos.y,
      };
    }
    return null;
  },
};

// ── Register / Unregister ─────────────────────────────────────

export function registerComponentSystem(): void {
  // Bounds
  boundsRegistry.register(SHAPE_TYPE, (shape: any, _drawingScale?: number) =>
    getComponentInstanceBounds(shape),
  );

  // Renderer (full)
  shapeRendererRegistry.register(
    SHAPE_TYPE,
    (_ctx, shape, _isSelected, _isHovered, invertColors, renderCtx) => {
      if (!renderCtx) return;
      drawComponentInstance(renderCtx, shape, invertColors);
    },
  );
  shapeRendererRegistry.registerSimple(
    SHAPE_TYPE,
    (_ctx, shape, invertColors, renderCtx) => {
      if (!renderCtx) return;
      drawComponentInstance(renderCtx, shape, invertColors);
    },
  );

  // Preview renderer
  shapePreviewRegistry.register(
    SHAPE_TYPE,
    (_ctx, preview, _style, _viewport, invertColors, renderCtx) => {
      if (!renderCtx) return;
      drawComponentInstancePreview(renderCtx, preview, invertColors);
    },
  );

  // Snap points
  snapProviderRegistry.registerSnap(SHAPE_TYPE, getComponentInstanceSnapPoints);

  // Grip handler
  gripProviderRegistry.register(SHAPE_TYPE, componentInstanceGripHandler);
}

export function unregisterComponentSystem(): void {
  boundsRegistry.unregister(SHAPE_TYPE);
  shapeRendererRegistry.unregister(SHAPE_TYPE);
  shapePreviewRegistry.unregister(SHAPE_TYPE);
  snapProviderRegistry.unregisterSnap(SHAPE_TYPE);
  gripProviderRegistry.unregister(SHAPE_TYPE);
}
