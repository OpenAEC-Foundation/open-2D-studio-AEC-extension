/**
 * Rebar drawing tool.
 *
 * Click to place an IfcReinforcingBar (rebar) at the clicked point.
 * Default: cross-section view (filled circle) with diameter 12mm.
 */

import type { Point, RebarShape } from 'open-2d-studio';
import { drawingToolRegistry, useAppStore, generateId } from 'open-2d-studio';

const TOOL_NAME = 'rebar';

export function registerRebarTool(): void {
  drawingToolRegistry.register({
    toolName: TOOL_NAME,

    handleClick(snappedPos: Point, _shiftKey: boolean): boolean {
      const {
        activeLayerId,
        activeDrawingId,
        addShapes,
      } = useAppStore.getState();

      const rebarShape: RebarShape = {
        id: generateId(),
        type: 'rebar',
        layerId: activeLayerId,
        drawingId: activeDrawingId,
        style: { strokeColor: '#ffffff', strokeWidth: 1, lineStyle: 'solid' },
        visible: true,
        locked: false,
        position: snappedPos,
        diameter: 12,
        barMark: 'A1',
        count: 1,
        viewMode: 'cross-section',
      };

      addShapes([rebarShape]);

      // Stay in tool mode for placing more bars
      return true;
    },

    handleMouseMove(_snappedPos: Point, _shiftKey: boolean): void {
      // No preview needed for single-click placement
    },

    handleCancel(): void {
      const { setActiveTool } = useAppStore.getState();
      setActiveTool('select');
    },

    hasPendingState(): boolean {
      const { activeTool } = useAppStore.getState();
      return activeTool === TOOL_NAME;
    },

    getBasePoint(): Point | undefined {
      return undefined;
    },
  });
}

export function unregisterRebarTool(): void {
  drawingToolRegistry.unregister(TOOL_NAME);
}
