import { useMemo } from 'react';
import {
  dialogRegistry, useAppStore,
  SectionDialog, BeamDialog, GridlineDialog, PileSymbolsDialog,
  WallDialog, PlateSystemDialog, MaterialsDialog, WallTypesDialog,
  WallSystemDialog, ProjectStructureDialog,
} from 'open-2d-studio';
import type { PlateSystemShape } from 'open-2d-studio';

function SectionDialogWrapper() {
  const {
    sectionDialogOpen,
    closeSectionDialog,
    setPendingSection,
  } = useAppStore();
  if (!sectionDialogOpen) return null;
  return (
    <SectionDialog
      isOpen={sectionDialogOpen}
      onClose={closeSectionDialog}
      onInsert={(profileType, parameters, presetId, rotation) => {
        setPendingSection({
          profileType,
          parameters,
          presetId,
          rotation: rotation ? rotation * (Math.PI / 180) : 0,
        });
        closeSectionDialog();
      }}
    />
  );
}

function BeamDialogWrapper() {
  const {
    beamDialogOpen,
    beamDialogInitialViewMode,
    closeBeamDialog,
    setPendingBeam,
    setPendingSection,
    setActiveTool,
  } = useAppStore();
  if (!beamDialogOpen) return null;
  return (
    <BeamDialog
      isOpen={beamDialogOpen}
      onClose={closeBeamDialog}
      initialViewMode={beamDialogInitialViewMode}
      onDraw={(profileType, parameters, flangeWidth, options) => {
        setPendingBeam({
          profileType,
          parameters,
          flangeWidth,
          presetId: options.presetId,
          presetName: options.presetName,
          material: options.material,
          justification: options.justification,
          showCenterline: options.showCenterline,
          showLabel: options.showLabel,
          continueDrawing: true,
          viewMode: options.viewMode,
          shapeMode: 'line',
        });
        setActiveTool('beam');
        closeBeamDialog();
      }}
      onInsertSection={(profileType, parameters, presetId, rotation) => {
        setPendingSection({
          profileType,
          parameters,
          presetId,
          rotation: rotation ? rotation * (Math.PI / 180) : 0,
        });
        closeBeamDialog();
      }}
    />
  );
}

function GridlineDialogWrapper() {
  const {
    gridlineDialogOpen,
    closeGridlineDialog,
    setPendingGridline,
    setActiveTool,
  } = useAppStore();
  if (!gridlineDialogOpen) return null;
  return (
    <GridlineDialog
      isOpen={gridlineDialogOpen}
      onClose={closeGridlineDialog}
      onDraw={(label, bubblePosition, bubbleRadius, fontSize) => {
        setPendingGridline({ label, bubblePosition, bubbleRadius, fontSize });
        setActiveTool('gridline');
        closeGridlineDialog();
      }}
    />
  );
}

function PileSymbolsDialogWrapper() {
  const {
    pileSymbolsDialogOpen,
    closePileSymbolsDialog,
  } = useAppStore();
  if (!pileSymbolsDialogOpen) return null;
  return (
    <PileSymbolsDialog
      isOpen={pileSymbolsDialogOpen}
      onClose={closePileSymbolsDialog}
    />
  );
}

function WallDialogWrapper() {
  const {
    wallDialogOpen,
    closeWallDialog,
    setPendingWall,
    setLastUsedWallTypeId,
    setActiveTool,
  } = useAppStore();
  if (!wallDialogOpen) return null;
  return (
    <WallDialog
      isOpen={wallDialogOpen}
      onClose={closeWallDialog}
      onDraw={(thickness, options) => {
        setPendingWall({
          thickness,
          wallTypeId: options.wallTypeId,
          wallSystemId: options.wallSystemId,
          justification: options.justification,
          showCenterline: options.showCenterline,
          startCap: options.startCap,
          endCap: options.endCap,
          continueDrawing: true,
          shapeMode: 'line',
          spaceBounding: true,
        });
        if (options.wallTypeId) {
          setLastUsedWallTypeId(options.wallTypeId);
        }
        setActiveTool('wall');
        closeWallDialog();
      }}
    />
  );
}

function PlateSystemDialogWrapper() {
  const {
    plateSystemDialogOpen,
    closePlateSystemDialog,
    setPendingPlateSystem,
    setActiveTool,
  } = useAppStore();
  const shapes = useAppStore(s => s.shapes);

  const nextPlateSystemName = useMemo(() => {
    const existingPlateSystems = shapes.filter(s => s.type === 'plate-system');
    let maxNum = 0;
    for (const ps of existingPlateSystems) {
      const psShape = ps as PlateSystemShape;
      const match = psShape.name?.match(/^Plate System (\d+)$/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxNum) maxNum = num;
      }
    }
    return `Plate System ${maxNum + 1}`;
  }, [shapes]);

  if (!plateSystemDialogOpen) return null;
  return (
    <PlateSystemDialog
      isOpen={plateSystemDialogOpen}
      onClose={closePlateSystemDialog}
      defaultName={nextPlateSystemName}
      onDraw={(settings) => {
        setPendingPlateSystem({
          systemType: settings.systemType,
          mainWidth: settings.mainWidth,
          mainHeight: settings.mainHeight,
          mainSpacing: settings.mainSpacing,
          mainDirection: settings.mainDirection,
          mainMaterial: settings.mainMaterial,
          mainProfileId: settings.mainProfileId,
          edgeWidth: settings.edgeWidth,
          edgeHeight: settings.edgeHeight,
          edgeMaterial: settings.edgeMaterial,
          edgeProfileId: settings.edgeProfileId,
          layers: settings.layers,
          name: settings.name,
          shapeMode: 'line',
        });
        setActiveTool('plate-system');
        closePlateSystemDialog();
      }}
    />
  );
}

function MaterialsDialogWrapper() {
  const { materialsDialogOpen, closeMaterialsDialog } = useAppStore();
  if (!materialsDialogOpen) return null;
  return (
    <MaterialsDialog
      isOpen={materialsDialogOpen}
      onClose={closeMaterialsDialog}
    />
  );
}

function WallTypesDialogWrapper() {
  const { wallTypesDialogOpen, closeWallTypesDialog } = useAppStore();
  if (!wallTypesDialogOpen) return null;
  return (
    <WallTypesDialog
      isOpen={wallTypesDialogOpen}
      onClose={closeWallTypesDialog}
    />
  );
}

function WallSystemDialogWrapper() {
  const { wallSystemDialogOpen, closeWallSystemDialog } = useAppStore();
  if (!wallSystemDialogOpen) return null;
  return (
    <WallSystemDialog
      isOpen={wallSystemDialogOpen}
      onClose={closeWallSystemDialog}
    />
  );
}

function ProjectStructureDialogWrapper() {
  const { projectStructureDialogOpen, closeProjectStructureDialog } = useAppStore();
  if (!projectStructureDialogOpen) return null;
  return (
    <ProjectStructureDialog
      isOpen={projectStructureDialogOpen}
      onClose={closeProjectStructureDialog}
    />
  );
}

const DIALOG_IDS = [
  'section-dialog', 'beam-dialog', 'gridline-dialog', 'pile-symbols-dialog',
  'wall-dialog', 'plate-system-dialog', 'materials-dialog',
  'wall-types-dialog', 'wall-system-dialog', 'project-structure-dialog',
] as const;

export function registerDialogs(): void {
  dialogRegistry.register({ id: 'section-dialog', Component: SectionDialogWrapper });
  dialogRegistry.register({ id: 'beam-dialog', Component: BeamDialogWrapper });
  dialogRegistry.register({ id: 'gridline-dialog', Component: GridlineDialogWrapper });
  dialogRegistry.register({ id: 'pile-symbols-dialog', Component: PileSymbolsDialogWrapper });
  dialogRegistry.register({ id: 'wall-dialog', Component: WallDialogWrapper });
  dialogRegistry.register({ id: 'plate-system-dialog', Component: PlateSystemDialogWrapper });
  dialogRegistry.register({ id: 'materials-dialog', Component: MaterialsDialogWrapper });
  dialogRegistry.register({ id: 'wall-types-dialog', Component: WallTypesDialogWrapper });
  dialogRegistry.register({ id: 'wall-system-dialog', Component: WallSystemDialogWrapper });
  dialogRegistry.register({ id: 'project-structure-dialog', Component: ProjectStructureDialogWrapper });
}

export function unregisterDialogs(): void {
  for (const id of DIALOG_IDS) {
    dialogRegistry.unregister(id);
  }
}
