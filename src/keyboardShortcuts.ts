import { keyboardShortcutRegistry, useAppStore } from 'open-2d-studio';

const SHORTCUT_KEYS = [
  'se', 'be', 'gl', 'lv', 'pi', 'co', 'pn', 'ct', 'wa', 'wo', 'sl', 'sb', 'rm', 'ps', 'sv', 'tw',
] as const;

export function registerKeyboardShortcuts(): void {
  keyboardShortcutRegistry.register({
    keys: 'se',
    activate: () => {
      const s = useAppStore.getState();
      if (s.editorMode === 'drawing') {
        s.openBeamDialog();
      }
    },
  });

  keyboardShortcutRegistry.register({
    keys: 'be',
    activate: () => {
      const s = useAppStore.getState();
      if (s.editorMode === 'drawing') {
        s.openBeamDialog();
      }
    },
  });

  keyboardShortcutRegistry.register({
    keys: 'gl',
    activate: () => {
      const s = useAppStore.getState();
      if (s.editorMode === 'drawing') {
        s.setPendingGridline({ label: '1', bubblePosition: 'both', bubbleRadius: 300, fontSize: 250 });
        s.setActiveTool('gridline');
      }
    },
  });

  keyboardShortcutRegistry.register({
    keys: 'lv',
    activate: () => {
      const s = useAppStore.getState();
      if (s.editorMode === 'drawing') {
        s.setPendingLevel({ label: '0', labelPosition: 'end', bubbleRadius: 400, fontSize: 250, elevation: 0, peil: 0 });
        s.setActiveTool('level');
      }
    },
  });

  keyboardShortcutRegistry.register({
    keys: 'pi',
    activate: () => {
      const s = useAppStore.getState();
      if (s.editorMode === 'drawing') {
        s.setPendingPile({ label: '', diameter: 600, fontSize: 200, showCross: true, contourType: 'circle', fillPattern: 6 });
        s.setActiveTool('pile');
      }
    },
  });

  keyboardShortcutRegistry.register({
    keys: 'co',
    activate: () => {
      const s = useAppStore.getState();
      if (s.editorMode === 'drawing') {
        s.setPendingColumn({
          width: 300,
          depth: 300,
          rotation: 0,
          material: 'concrete',
        });
        s.setActiveTool('column');
      }
    },
  });

  keyboardShortcutRegistry.register({
    keys: 'pn',
    activate: () => {
      const s = useAppStore.getState();
      if (s.editorMode === 'drawing') {
        s.setPendingPuntniveau({ puntniveauNAP: -12.5, fontSize: 300 });
        s.setActiveTool('puntniveau');
      }
    },
  });

  keyboardShortcutRegistry.register({
    keys: 'ct',
    activate: () => {
      const s = useAppStore.getState();
      if (s.editorMode === 'drawing') {
        s.setPendingCPT({
          name: '01',
          fontSize: 150,
          markerSize: 300,
        });
        s.setActiveTool('cpt');
      }
    },
  });

  keyboardShortcutRegistry.register({
    keys: 'wa',
    activate: () => {
      const s = useAppStore.getState();
      if (s.editorMode === 'drawing') {
        const defaultTypeId = s.lastUsedWallTypeId ?? 'beton-200';
        const wt = s.wallTypes.find(w => w.id === defaultTypeId);
        s.setPendingWall({
          thickness: wt?.thickness ?? 200,
          wallTypeId: defaultTypeId,
          justification: 'center',
          showCenterline: true,
          startCap: 'butt',
          endCap: 'butt',
          continueDrawing: true,
          shapeMode: 'line',
          spaceBounding: true,
        });
        s.setActiveTool('wall');
      }
    },
  });

  keyboardShortcutRegistry.register({
    keys: 'wo',
    activate: () => {
      const s = useAppStore.getState();
      if (s.editorMode === 'drawing') {
        s.setActiveTool('wall-opening');
      }
    },
  });

  keyboardShortcutRegistry.register({
    keys: 'sl',
    activate: () => {
      const s = useAppStore.getState();
      if (s.editorMode === 'drawing') {
        s.setPendingSlab({
          thickness: 200,
          elevation: 0,
          material: 'concrete',
          level: undefined,
          shapeMode: 'line',
        });
        s.setActiveTool('slab');
      }
    },
  });

  keyboardShortcutRegistry.register({
    keys: 'sb',
    activate: () => {
      const s = useAppStore.getState();
      if (s.editorMode === 'drawing') {
        s.setPendingSlabLabel({
          floorType: 'kanaalplaatvloer',
          thickness: 200,
          spanDirection: 0,
          fontSize: 150,
          arrowLength: 1000,
        });
        s.setActiveTool('slab-label');
      }
    },
  });

  keyboardShortcutRegistry.register({
    keys: 'rm',
    activate: () => {
      const s = useAppStore.getState();
      if (s.editorMode === 'drawing') {
        s.setPendingSpace({
          name: 'Room',
          fillColor: '#00ff00',
          fillOpacity: 0.1,
        });
        s.setActiveTool('space');
      }
    },
  });

  keyboardShortcutRegistry.register({
    keys: 'ps',
    activate: () => {
      const s = useAppStore.getState();
      if (s.editorMode === 'drawing') {
        s.openPlateSystemDialog();
      }
    },
  });

  keyboardShortcutRegistry.register({
    keys: 'sv',
    activate: () => {
      const s = useAppStore.getState();
      if (s.editorMode === 'drawing') {
        s.setActiveTool('spot-elevation');
      }
    },
  });

  keyboardShortcutRegistry.register({
    keys: 'tw',
    activate: () => {
      const s = useAppStore.getState();
      s.setActiveTool('trim-walls');
    },
  });
}

export function unregisterKeyboardShortcuts(): void {
  for (const keys of SHORTCUT_KEYS) {
    keyboardShortcutRegistry.unregister(keys);
  }
}
