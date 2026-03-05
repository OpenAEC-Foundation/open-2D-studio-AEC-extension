import { Square, Circle, Palette, Settings, Layers, FolderTree, Shapes } from 'lucide-react';
import {
  useAppStore,
  LineIcon, ArcIcon, BeamIcon, GridLineIcon, LevelIcon,
  SectionDetailIcon, PileIcon, PuntniveauIcon, CPTIcon, WallIcon,
  SlabIcon, SpaceIcon, LabelIcon, MiterJoinIcon, PlateSystemIcon,
  SpotElevationIcon,
  RibbonButton, RibbonSmallButton, RibbonGroup,
  getNextSectionLabel,
} from 'open-2d-studio';

type ShapeMode = 'line' | 'arc' | 'rectangle' | 'circle';

function ShapeModeSelector({ mode, onChange }: { mode: ShapeMode; onChange: (mode: ShapeMode) => void }) {
  return (
    <RibbonGroup label="Shape">
      <div className="flex gap-0.5">
        <button
          className={`px-2 py-1 text-xs rounded ${mode === 'line' ? 'bg-cad-accent/20 text-cad-accent border border-cad-accent/50' : 'bg-cad-bg border border-cad-border text-cad-text hover:bg-cad-hover'}`}
          onClick={() => onChange('line')}
        >
          <LineIcon size={14} />
        </button>
        <button
          className={`px-2 py-1 text-xs rounded ${mode === 'arc' ? 'bg-cad-accent/20 text-cad-accent border border-cad-accent/50' : 'bg-cad-bg border border-cad-border text-cad-text hover:bg-cad-hover'}`}
          onClick={() => onChange('arc')}
        >
          <ArcIcon size={14} />
        </button>
        <button
          className={`px-2 py-1 text-xs rounded ${mode === 'rectangle' ? 'bg-cad-accent/20 text-cad-accent border border-cad-accent/50' : 'bg-cad-bg border border-cad-border text-cad-text hover:bg-cad-hover'}`}
          onClick={() => onChange('rectangle')}
        >
          <Square size={14} />
        </button>
        <button
          className={`px-2 py-1 text-xs rounded ${mode === 'circle' ? 'bg-cad-accent/20 text-cad-accent border border-cad-accent/50' : 'bg-cad-bg border border-cad-border text-cad-text hover:bg-cad-hover'}`}
          onClick={() => onChange('circle')}
        >
          <Circle size={14} />
        </button>
      </div>
    </RibbonGroup>
  );
}

function StructuralTabContent() {
  const {
    activeTool,
    switchToDrawingTool,
    switchToolAndCancelCommand,
    openBeamDialog,
    setPendingGridline,
    setPendingLevel,
    setPendingPile,
    setPendingCPT,
    setPendingWall,
    setPendingSlab,
    setPendingSectionCallout,
    setPendingSpace,
    setPendingPlateSystem,
    openPlateSystemDialog,
    pendingWall,
    pendingBeam,
    setPendingBeam,
    pendingSlab,
    pendingPlateSystem,
    lastUsedWallTypeId,
    wallTypes,
    clearDrawingPoints,
    setDrawingPreview,
    editorMode,
    openMaterialsDialog,
    openWallTypesDialog,
    openWallSystemDialog,
    openProjectStructureDialog,
    extensionRibbonButtons,
  } = useAppStore();

  const isSheetMode = editorMode !== 'drawing';

  const renderExtensionButtonsForTab = (tabId: string) => {
    const btns = extensionRibbonButtons.filter(b => b.tab === tabId);
    if (btns.length === 0) return null;
    const groups = new Map<string, typeof btns>();
    for (const btn of btns) {
      const g = groups.get(btn.group) || [];
      g.push(btn);
      groups.set(btn.group, g);
    }
    return Array.from(groups.entries()).map(([groupLabel, groupBtns]) => (
      <RibbonGroup key={groupLabel} label={groupLabel}>
        {groupBtns.map(btn => {
          const iconContent = btn.icon
            ? <span dangerouslySetInnerHTML={{ __html: btn.icon }} />
            : <Settings size={btn.size === 'small' ? 14 : btn.size === 'medium' ? 18 : 24} />;
          if (btn.size === 'small') return <RibbonSmallButton key={btn.label} icon={iconContent} label={btn.label} onClick={btn.onClick} shortcut={btn.shortcut} />;
          return <RibbonButton key={btn.label} icon={iconContent} label={btn.label} onClick={btn.onClick} tooltip={btn.tooltip} shortcut={btn.shortcut} />;
        })}
      </RibbonGroup>
    ));
  };

  return (
    <div className="ribbon-groups">
      <RibbonGroup label="Elements">
        <RibbonButton
          icon={<BeamIcon size={24} />}
          label="IfcBeam"
          onClick={() => openBeamDialog()}
          disabled={isSheetMode}
          tooltip="Insert IfcColumn section or draw IfcBeam"
          shortcut="BE"
        />
        <RibbonButton
          icon={<WallIcon size={24} />}
          label="IfcWall"
          onClick={() => {
            const defaultTypeId = lastUsedWallTypeId ?? 'beton-200';
            const wt = wallTypes.find(w => w.id === defaultTypeId);
            setPendingWall({
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
            switchToDrawingTool('wall');
          }}
          disabled={isSheetMode}
          tooltip="Draw IfcWall"
          shortcut="WA"
        />
        <RibbonButton
          icon={<SlabIcon size={24} />}
          label="IfcSlab"
          onClick={() => {
            setPendingSlab({
              thickness: 200,
              level: '0',
              elevation: 0,
              material: 'concrete',
              shapeMode: 'line',
            });
            switchToDrawingTool('slab');
          }}
          active={activeTool === 'slab'}
          disabled={isSheetMode}
          tooltip="Draw IfcSlab (closed polygon with hatch)"
          shortcut="SL"
        />
        <RibbonButton
          icon={<PlateSystemIcon size={24} />}
          label="IfcPlateSystem"
          onClick={openPlateSystemDialog}
          disabled={isSheetMode}
          tooltip="Draw IfcElementAssembly plate system (timber floor, HSB wall, ceiling)"
          shortcut="PS"
        />
        <RibbonButton
          icon={<PileIcon size={24} />}
          label="IfcPile"
          onClick={() => {
            setPendingPile({
              label: '',
              diameter: 600,
              fontSize: 200,
              showCross: true,
              contourType: 'circle',
              fillPattern: 6,
            });
            switchToDrawingTool('pile');
          }}
          active={activeTool === 'pile'}
          disabled={isSheetMode}
          tooltip="Place IfcPile (IfcDeepFoundation)"
          shortcut="PI"
        />
        <RibbonButton
          icon={<CPTIcon size={24} />}
          label="CPT"
          onClick={() => {
            setPendingCPT({
              name: '01',
              fontSize: 150,
              markerSize: 300,
            });
            switchToDrawingTool('cpt');
          }}
          active={activeTool === 'cpt'}
          disabled={isSheetMode}
          tooltip="Place CPT (Cone Penetration Test) marker for pile plan"
          shortcut="CT"
        />
        <RibbonButton
          icon={<SpaceIcon size={24} />}
          label="IfcSpace"
          onClick={() => {
            setPendingSpace({
              name: 'Room',
              fillColor: '#00ff00',
              fillOpacity: 0.1,
            });
            switchToDrawingTool('space');
          }}
          active={activeTool === 'space'}
          disabled={isSheetMode}
          tooltip="Detect and place IfcSpace (room) from surrounding walls"
          shortcut="RM"
        />
      </RibbonGroup>

      {(activeTool === 'wall' || activeTool === 'beam' || activeTool === 'slab' || activeTool === 'plate-system') && (() => {
        const mode: ShapeMode =
          activeTool === 'wall' ? (pendingWall?.shapeMode ?? 'line') :
          activeTool === 'beam' ? (pendingBeam?.shapeMode ?? 'line') :
          activeTool === 'slab' ? (pendingSlab?.shapeMode ?? 'line') :
          (pendingPlateSystem?.shapeMode ?? 'line');
        const handleShapeModeChange = (m: ShapeMode) => {
          clearDrawingPoints();
          setDrawingPreview(null);
          if (activeTool === 'wall' && pendingWall) {
            setPendingWall({ ...pendingWall, shapeMode: m });
          } else if (activeTool === 'beam' && pendingBeam) {
            setPendingBeam({ ...pendingBeam, shapeMode: m });
          } else if (activeTool === 'slab' && pendingSlab) {
            setPendingSlab({ ...pendingSlab, shapeMode: m });
          } else if (activeTool === 'plate-system' && pendingPlateSystem) {
            setPendingPlateSystem({ ...pendingPlateSystem, shapeMode: m });
          }
        };
        return (
          <ShapeModeSelector mode={mode} onChange={handleShapeModeChange} />
        );
      })()}

      <RibbonGroup label="Annotations">
        <RibbonButton
          icon={<GridLineIcon size={24} />}
          label="IfcGrid"
          onClick={() => {
            setPendingGridline({ label: '1', bubblePosition: 'both', bubbleRadius: 300, fontSize: 250 });
            switchToDrawingTool('gridline');
          }}
          disabled={isSheetMode}
          tooltip="Draw IfcGrid axis line (stramien)"
          shortcut="GL"
        />
        <RibbonButton
          icon={<LabelIcon size={24} />}
          label="Label"
          onClick={() => switchToDrawingTool('label')}
          active={activeTool === 'label'}
          disabled={isSheetMode}
          tooltip="Place structural label with leader line"
          shortcut="LB"
        />
        <RibbonButton
          icon={<LevelIcon size={24} />}
          label="2DLevel"
          onClick={() => {
            setPendingLevel({ label: '0', labelPosition: 'end', bubbleRadius: 400, fontSize: 250, elevation: 0, peil: 0 });
            switchToDrawingTool('level');
          }}
          disabled={isSheetMode}
          tooltip="Draw 2D level marker (annotation level)"
          shortcut="LV"
        />
        <RibbonButton
          icon={<SpotElevationIcon size={24} />}
          label="IfcSpotElevation"
          onClick={() => switchToDrawingTool('spot-elevation')}
          active={activeTool === 'spot-elevation'}
          disabled={isSheetMode}
          tooltip="Place spot elevation marker with elevation label"
          shortcut="SE"
        />
        <RibbonButton
          icon={<SectionDetailIcon size={24} />}
          label="Section/Detail"
          onClick={() => {
            setPendingSectionCallout({ label: getNextSectionLabel(), bubbleRadius: 400, fontSize: 250, flipDirection: false, viewDepth: 5000 });
            switchToDrawingTool('section-callout');
          }}
          active={activeTool === 'section-callout'}
          disabled={isSheetMode}
          tooltip="Create section or detail callout"
          shortcut="SD"
        />
      </RibbonGroup>

      <RibbonGroup label="Connections">
        <RibbonButton
          icon={<MiterJoinIcon size={24} />}
          label="Join"
          onClick={() => switchToolAndCancelCommand('trim-walls')}
          active={activeTool === 'trim-walls'}
          disabled={isSheetMode}
          tooltip="Miter join walls, beams or ducts at intersection (verstek)"
          shortcut="TW"
        />
      </RibbonGroup>

      <RibbonGroup label="Properties">
        <RibbonButton
          icon={<Palette size={24} />}
          label="Materials"
          onClick={openMaterialsDialog}
          disabled={isSheetMode}
          tooltip="Manage materials and wall types"
        />
        <RibbonButton
          icon={<Settings size={24} />}
          label="IfcTypes"
          onClick={openWallTypesDialog}
          disabled={isSheetMode}
          tooltip="Manage IFC type definitions (walls, slabs)"
        />
        <RibbonButton
          icon={<Layers size={24} />}
          label="Wall Systems"
          onClick={openWallSystemDialog}
          disabled={isSheetMode}
          tooltip="Manage multi-layered wall systems (HSB, metal stud, curtain wall)"
        />
        <RibbonButton
          icon={<FolderTree size={24} />}
          label="Project"
          onClick={openProjectStructureDialog}
          tooltip="Manage IFC project spatial hierarchy (Site / Building / Storey)"
        />
      </RibbonGroup>
      {renderExtensionButtonsForTab('structural')}
    </div>
  );
}

function PilePlanTabContent() {
  const {
    activeTool,
    switchToDrawingTool,
    setPendingPile,
    setPendingCPT,
    setPendingPuntniveau,
    openPileSymbolsDialog,
    editorMode,
  } = useAppStore();

  const isSheetMode = editorMode !== 'drawing';

  return (
    <div className="ribbon-groups" style={{ alignItems: 'stretch' }}>
      <RibbonGroup label="Place">
        <RibbonButton
          icon={<PileIcon size={24} />}
          label="IfcPile"
          onClick={() => {
            setPendingPile({
              label: '',
              diameter: 600,
              fontSize: 200,
              showCross: true,
              contourType: 'circle',
              fillPattern: 6,
            });
            switchToDrawingTool('pile');
          }}
          active={activeTool === 'pile'}
          disabled={isSheetMode}
          tooltip="Place IfcPile (IfcDeepFoundation)"
          shortcut="PI"
        />
        <RibbonButton
          icon={<CPTIcon size={24} />}
          label="CPT"
          onClick={() => {
            setPendingCPT({
              name: '01',
              fontSize: 150,
              markerSize: 300,
            });
            switchToDrawingTool('cpt');
          }}
          active={activeTool === 'cpt'}
          disabled={isSheetMode}
          tooltip="Place CPT (Cone Penetration Test) marker"
          shortcut="CT"
        />
        <RibbonButton
          icon={<PuntniveauIcon size={24} />}
          label="Puntniveau"
          onClick={() => {
            setPendingPuntniveau({
              puntniveauNAP: -12.5,
              fontSize: 300,
            });
            switchToDrawingTool('puntniveau');
          }}
          active={activeTool === 'puntniveau'}
          disabled={isSheetMode}
          tooltip="Place puntniveau zone (pile tip level contour)"
          shortcut="PN"
        />
        <RibbonButton
          icon={<Shapes size={24} />}
          label="Pile Symbols"
          onClick={() => openPileSymbolsDialog()}
          disabled={isSheetMode}
          tooltip="Configure pile symbols and order"
        />
      </RibbonGroup>
    </div>
  );
}

export function registerRibbonTabs(): void {
  const s = useAppStore.getState();
  s.addExtensionRibbonTab({ extensionId: 'aec', id: 'structural', label: 'AEC', order: 30, render: () => <StructuralTabContent /> });
  s.addExtensionRibbonTab({ extensionId: 'aec', id: 'pile-plan', label: 'Pile Plan', order: 31, render: () => <PilePlanTabContent /> });
}

export function unregisterRibbonTabs(): void {
  const s = useAppStore.getState();
  s.removeExtensionRibbonTab('aec', 'structural');
  s.removeExtensionRibbonTab('aec', 'pile-plan');
}
