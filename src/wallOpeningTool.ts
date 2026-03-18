/**
 * Wall Opening drawing tool.
 *
 * Click on a wall to place an IfcOpeningElement hosted in that wall.
 * The opening is positioned along the wall centerline at the clicked point.
 */

import type { Point, WallShape, WallOpeningShape } from 'open-2d-studio';
import { drawingToolRegistry, useAppStore, generateId } from 'open-2d-studio';

const TOOL_NAME = 'wall-opening';

/** Default opening dimensions (mm) */
const DEFAULT_WIDTH = 900;
const DEFAULT_HEIGHT = 2100;
const DEFAULT_SILL_HEIGHT = 900;

function findWallAtPoint(point: Point, tolerance: number): WallShape | null {
  const { shapes } = useAppStore.getState();
  let bestWall: WallShape | null = null;
  let bestDist = Infinity;

  for (const shape of shapes) {
    if (shape.type !== 'wall') continue;
    const wall = shape as WallShape;

    // Project point onto wall centerline
    const dx = wall.end.x - wall.start.x;
    const dy = wall.end.y - wall.start.y;
    const wallLen = Math.sqrt(dx * dx + dy * dy);
    if (wallLen < 0.001) continue;

    const dirX = dx / wallLen;
    const dirY = dy / wallLen;

    const relX = point.x - wall.start.x;
    const relY = point.y - wall.start.y;

    // Parameter along wall centerline
    const t = relX * dirX + relY * dirY;
    if (t < 0 || t > wallLen) continue;

    // Perpendicular distance
    const perpDist = Math.abs(relX * (-dirY) + relY * dirX);

    // Check if within wall thickness + tolerance
    const halfThick = wall.thickness / 2;
    if (perpDist <= halfThick + tolerance && perpDist < bestDist) {
      bestDist = perpDist;
      bestWall = wall;
    }
  }

  return bestWall;
}

function getPositionAlongWall(wall: WallShape, point: Point): number {
  const dx = wall.end.x - wall.start.x;
  const dy = wall.end.y - wall.start.y;
  const wallLen = Math.sqrt(dx * dx + dy * dy);
  if (wallLen < 0.001) return 0;

  const dirX = dx / wallLen;
  const dirY = dy / wallLen;

  const relX = point.x - wall.start.x;
  const relY = point.y - wall.start.y;

  return Math.max(0, Math.min(wallLen, relX * dirX + relY * dirY));
}

export function registerWallOpeningTool(): void {
  drawingToolRegistry.register({
    toolName: TOOL_NAME,

    handleClick(snappedPos: Point, _shiftKey: boolean): boolean {
      const tolerance = 200; // mm tolerance for wall hit detection
      const wall = findWallAtPoint(snappedPos, tolerance);

      if (!wall) {
        // No wall found at click point - do nothing
        return false;
      }

      const positionAlongWall = getPositionAlongWall(wall, snappedPos);
      const { activeLayerId, activeDrawingId, addShapes } = useAppStore.getState();

      const openingShape: WallOpeningShape = {
        id: generateId(),
        type: 'wall-opening',
        layerId: activeLayerId,
        drawingId: activeDrawingId,
        style: { strokeColor: '#ffffff', strokeWidth: 1, lineStyle: 'solid' },
        visible: true,
        locked: false,
        hostWallId: wall.id,
        positionAlongWall,
        width: DEFAULT_WIDTH,
        height: DEFAULT_HEIGHT,
        sillHeight: DEFAULT_SILL_HEIGHT,
      };

      addShapes([openingShape]);

      // Stay in tool mode for placing more openings
      return true;
    },

    handleMouseMove(_snappedPos: Point, _shiftKey: boolean): void {
      // Preview could be drawn here but we keep it simple
      // The preview renderer handles this
    },

    handleCancel(): void {
      // Nothing to cancel - tool is stateless (single-click placement)
      const { setActiveTool } = useAppStore.getState();
      setActiveTool('select');
    },

    hasPendingState(): boolean {
      // This tool is always "pending" when active (ready for click)
      const { activeTool } = useAppStore.getState();
      return activeTool === TOOL_NAME;
    },

    getBasePoint(): Point | undefined {
      return undefined;
    },
  });
}

export function unregisterWallOpeningTool(): void {
  drawingToolRegistry.unregister(TOOL_NAME);
}
