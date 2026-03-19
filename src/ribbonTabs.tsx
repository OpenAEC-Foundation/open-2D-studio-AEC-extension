import { useState, useCallback } from 'react';
import { Square, Circle, Palette, Settings, Layers, FolderTree, Shapes, FileText, FileBarChart, DoorOpen, CircleDot, Download, Copy, RefreshCw } from 'lucide-react';
import {
  useAppStore,
  LineIcon, ArcIcon, BeamIcon, GridLineIcon, LevelIcon,
  SectionDetailIcon, PileIcon, ColumnIcon, PuntniveauIcon, CPTIcon, WallIcon,
  SlabIcon, SlabOpeningIcon, SlabLabelIcon, SpaceIcon, LabelIcon, MiterJoinIcon, PlateSystemIcon,
  SpotElevationIcon,
  RibbonButton, RibbonSmallButton, RibbonGroup,
  getNextSectionLabel,
  showPdfFileDialog,
  renderPdfPageForUnderlay,
  PdfUnderlayDialog,
} from 'open-2d-studio';
import type { ImageShape, CPTShape } from 'open-2d-studio';
import { showCPTFileDialog, parseCPTFile } from './cptFileService';
import { generateIFCX, exportIFCX } from './ifcxGenerator';
import type { IfcxGenerationResult } from './ifcxGenerator';

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

/**
 * PDF Underlay button + dialog.
 * Self-contained: manages the dialog open/close state, the PDF data,
 * and creates the ImageShape when the user selects a page.
 */
function PdfUnderlayButton({ disabled }: { disabled?: boolean }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pdfData, setPdfData] = useState<ArrayBuffer | null>(null);
  const [fileName, setFileName] = useState<string>('');

  const handleClick = useCallback(async () => {
    try {
      const result = await showPdfFileDialog();
      if (!result) return;
      setPdfData(result.data);
      // Extract just the filename from the path
      const name = result.filePath.replace(/\\/g, '/').split('/').pop() || result.filePath;
      setFileName(name);
      setDialogOpen(true);
    } catch (err) {
      console.error('Failed to open PDF:', err);
    }
  }, []);

  const handlePlace = useCallback(async (pageNumber: number) => {
    if (!pdfData) return;
    setDialogOpen(false);

    try {
      const result = await renderPdfPageForUnderlay(pdfData, pageNumber, 150);
      const { activeLayerId, activeDrawingId, addShapes, viewport } = useAppStore.getState();

      // Place the underlay centered at the current viewport center
      const centerX = -viewport.offsetX + (window.innerWidth / 2) / viewport.zoom;
      const centerY = -viewport.offsetY + (window.innerHeight / 2) / viewport.zoom;

      const imageShape: ImageShape = {
        id: crypto.randomUUID(),
        type: 'image',
        layerId: activeLayerId,
        drawingId: activeDrawingId,
        style: { strokeColor: '#ffffff', strokeWidth: 1, lineStyle: 'solid' },
        visible: true,
        locked: false,
        position: {
          x: centerX - result.worldWidth / 2,
          y: centerY - result.worldHeight / 2,
        },
        width: result.worldWidth,
        height: result.worldHeight,
        rotation: 0,
        imageData: result.dataUrl,
        originalWidth: result.pixelWidth,
        originalHeight: result.pixelHeight,
        opacity: 1,
        maintainAspectRatio: true,
        isUnderlay: true,
        sourceFileName: fileName ? `${fileName} (page ${pageNumber})` : `PDF page ${pageNumber}`,
      };

      addShapes([imageShape]);
    } catch (err) {
      console.error('Failed to render PDF page for underlay:', err);
    }
  }, [pdfData, fileName]);

  const handleClose = useCallback(() => {
    setDialogOpen(false);
  }, []);

  return (
    <>
      <RibbonButton
        icon={<FileText size={24} />}
        label="PDF Underlay"
        onClick={handleClick}
        disabled={disabled}
        tooltip="Import a PDF page as a background underlay image"
        shortcut="PU"
      />
      <PdfUnderlayDialog
        isOpen={dialogOpen}
        onClose={handleClose}
        pdfData={pdfData}
        fileName={fileName}
        onPlace={handlePlace}
      />
    </>
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
    setPendingColumn,
    setPendingCPT,
    setPendingWall,
    setPendingSlab,
    setPendingSlabOpening,
    setPendingSlabLabel,
    setPendingSectionCallout,
    setPendingSpace,
    setPendingPlateSystem,
    openPlateSystemDialog,
    pendingWall,
    pendingBeam,
    setPendingBeam,
    pendingSlab,
    pendingSlabOpening,
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
          icon={<DoorOpen size={24} />}
          label="Opening"
          onClick={() => {
            switchToDrawingTool('wall-opening');
          }}
          active={activeTool === 'wall-opening'}
          disabled={isSheetMode}
          tooltip="Place IfcOpeningElement in a wall (click on wall to place)"
          shortcut="WO"
        />
        <RibbonButton
          icon={<SlabIcon size={24} />}
          label="IfcSlab"
          onClick={() => {
            setPendingSlab({
              thickness: 200,
              elevation: 0,
              material: 'concrete',
              level: undefined,
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
          icon={<SlabOpeningIcon size={24} />}
          label="Slab Opening"
          onClick={() => {
            setPendingSlabOpening({
              shapeMode: 'line',
            });
            switchToDrawingTool('slab-opening');
          }}
          active={activeTool === 'slab-opening'}
          disabled={isSheetMode}
          tooltip="Draw slab opening (hole cut through a floor slab)"
          shortcut="SO"
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
          icon={<ColumnIcon size={24} />}
          label="IfcColumn"
          onClick={() => {
            setPendingColumn({
              width: 300,
              depth: 300,
              rotation: 0,
              material: 'concrete',
            });
            switchToDrawingTool('column');
          }}
          active={activeTool === 'column'}
          disabled={isSheetMode}
          tooltip="Place IfcColumn"
          shortcut="CO"
        />
        <RibbonButton
          icon={<CircleDot size={24} />}
          label="IfcRebar"
          onClick={() => {
            switchToDrawingTool('rebar');
          }}
          active={activeTool === 'rebar'}
          disabled={isSheetMode}
          tooltip="Place IfcReinforcingBar (rebar cross-section or longitudinal)"
          shortcut="RB"
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

      {(activeTool === 'wall' || activeTool === 'beam' || activeTool === 'slab' || activeTool === 'slab-opening' || activeTool === 'plate-system') && (() => {
        const mode: ShapeMode =
          activeTool === 'wall' ? (pendingWall?.shapeMode ?? 'line') :
          activeTool === 'beam' ? (pendingBeam?.shapeMode ?? 'line') :
          activeTool === 'slab' ? (pendingSlab?.shapeMode ?? 'line') :
          activeTool === 'slab-opening' ? (pendingSlabOpening?.shapeMode ?? 'line') :
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
          } else if (activeTool === 'slab-opening' && pendingSlabOpening) {
            setPendingSlabOpening({ ...pendingSlabOpening, shapeMode: m });
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
          icon={<SlabLabelIcon size={24} />}
          label="Slab Label"
          onClick={() => {
            setPendingSlabLabel({
              floorType: 'kanaalplaatvloer',
              thickness: 200,
              spanDirection: 0,
              fontSize: 150,
              arrowLength: 1000,
            });
            switchToDrawingTool('slab-label');
          }}
          active={activeTool === 'slab-label'}
          disabled={isSheetMode}
          tooltip="Place structural slab label with floor type and span direction"
          shortcut="SB"
        />
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

      <RibbonGroup label="Reference">
        <PdfUnderlayButton disabled={isSheetMode} />
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

      <RibbonGroup label="CPT Data">
        <RibbonButton
          icon={<FileBarChart size={24} />}
          label="Parse CPT"
          onClick={async () => {
            const { selectedShapeIds, shapes, updateShape } = useAppStore.getState();
            // Find the first selected CPT shape
            const cptShape = selectedShapeIds
              .map(id => shapes.find(s => s.id === id))
              .find(s => s?.type === 'cpt') as CPTShape | undefined;
            if (!cptShape) {
              alert('Select a CPT shape first, then click Parse CPT to load GEF or BRO-XML data.');
              return;
            }
            const result = await showCPTFileDialog();
            if (!result) return;
            try {
              const data = parseCPTFile(result.text, result.fileName);
              updateShape(cptShape.id, {
                cptData: {
                  depth: data.depth,
                  qc: data.qc,
                  fs: data.fs,
                  rf: data.rf,
                  sourceFile: data.sourceFile,
                },
              } as Partial<CPTShape>);
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : String(err);
              alert(`Failed to parse CPT file: ${msg}`);
            }
          }}
          disabled={isSheetMode}
          tooltip="Load GEF or BRO-XML file and attach CPT data to the selected CPT marker"
          shortcut="CP"
        />
      </RibbonGroup>
    </div>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * IFCX Tab Content — JSON-based IFC export panel.
 *
 * Shows an "Export IFCX" button, a JSON viewer with copy/download,
 * and statistics about the generated IFCX file.
 */
function IfcxTabContent() {
  const [ifcxResult, setIfcxResult] = useState<IfcxGenerationResult | null>(null);
  const [copied, setCopied] = useState(false);

  const handleGenerate = useCallback(() => {
    const result = generateIFCX();
    setIfcxResult(result);
  }, []);

  const handleExport = useCallback(() => {
    exportIFCX();
  }, []);

  const handleCopy = useCallback(async () => {
    if (!ifcxResult?.content) return;
    try {
      await navigator.clipboard.writeText(ifcxResult.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for environments where clipboard API is unavailable
      const ta = document.createElement('textarea');
      ta.value = ifcxResult.content;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [ifcxResult]);

  return (
    <div className="ribbon-groups" style={{ alignItems: 'stretch' }}>
      <RibbonGroup label="IFCX Export">
        <RibbonButton
          icon={<Download size={24} />}
          label="Export IFCX"
          onClick={handleExport}
          tooltip="Export current model as IFCX JSON file (.ifcx)"
        />
        <RibbonButton
          icon={<RefreshCw size={24} />}
          label="Generate"
          onClick={handleGenerate}
          tooltip="Generate IFCX JSON preview (view in panel below)"
        />
        <RibbonButton
          icon={<Copy size={24} />}
          label={copied ? 'Copied!' : 'Copy JSON'}
          onClick={handleCopy}
          tooltip="Copy generated IFCX JSON to clipboard"
        />
      </RibbonGroup>

      <RibbonGroup label="Statistics">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '2px 8px', fontSize: 11, color: 'var(--cad-text-dim, #888)' }}>
          <div>
            <span style={{ color: 'var(--cad-text-dim)' }}>Entities: </span>
            <span style={{ color: 'var(--cad-text)', fontWeight: 500 }}>{ifcxResult?.entityCount ?? 0}</span>
          </div>
          <div>
            <span style={{ color: 'var(--cad-text-dim)' }}>Size: </span>
            <span style={{ color: 'var(--cad-text)', fontWeight: 500 }}>{ifcxResult ? formatFileSize(ifcxResult.fileSize) : '0 B'}</span>
          </div>
          <div>
            <span style={{ color: 'var(--cad-text-dim)' }}>Schema: </span>
            <span style={{ color: 'var(--cad-text)', fontWeight: 500 }}>IFCX (JSON)</span>
          </div>
        </div>
      </RibbonGroup>

      <RibbonGroup label="About">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '2px 8px', fontSize: 10, color: 'var(--cad-text-dim, #888)', maxWidth: 200 }}>
          <div>IFCX is a JSON-based IFC format by the OpenAEC Foundation.</div>
          <div>Each IFC entity becomes a JSON object with type, globalId, attributes, and geometry.</div>
        </div>
      </RibbonGroup>
    </div>
  );
}

export function registerRibbonTabs(): void {
  const s = useAppStore.getState();
  s.addExtensionRibbonTab({ extensionId: 'aec', id: 'structural', label: 'AEC', order: 30, render: () => <StructuralTabContent /> });
  s.addExtensionRibbonTab({ extensionId: 'aec', id: 'pile-plan', label: 'Pile Plan', order: 31, render: () => <PilePlanTabContent /> });
  s.addExtensionRibbonTab({ extensionId: 'aec', id: 'ifcx', label: 'IFCX', order: 45, render: () => <IfcxTabContent /> });

  // Also add an "Export IFCX" button to the built-in IFC tab
  s.addExtensionRibbonButton({
    extensionId: 'aec',
    tab: 'ifc',
    group: 'IFCX',
    label: 'Export IFCX',
    size: 'large',
    onClick: () => exportIFCX(),
    tooltip: 'Export current model as IFCX JSON file (.ifcx) — a JSON-based IFC format by the OpenAEC Foundation',
  });
}

export function unregisterRibbonTabs(): void {
  const s = useAppStore.getState();
  s.removeExtensionRibbonTab('aec', 'structural');
  s.removeExtensionRibbonTab('aec', 'pile-plan');
  s.removeExtensionRibbonTab('aec', 'ifcx');
  s.removeExtensionRibbonButton('aec', 'Export IFCX');
}
