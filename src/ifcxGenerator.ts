/**
 * IFCX Generator — converts the application model to IFCX JSON format.
 *
 * IFCX is a JSON-based serialization of IFC data developed by the
 * OpenAEC Foundation. Each IFC entity is represented as a JSON object
 * with a type, globalId, and attributes. The top-level structure is:
 *
 *   {
 *     "schema": "IFCX",
 *     "version": "0.1",
 *     "header": { ... },
 *     "data": [ ...entities... ]
 *   }
 *
 * Each entity in the data array has:
 *   {
 *     "type": "IfcWall",
 *     "globalId": "...",
 *     "name": "...",
 *     "attributes": { ... },
 *     "propertySets": [ ... ],
 *     "geometry": { ... }
 *   }
 */

import { useAppStore } from 'open-2d-studio';
import type {
  Shape,
  WallShape,
  BeamShape,
  ColumnShape,
  SlabShape,
  PileShape,
  CPTShape,
  GridlineShape,
  LevelShape,
  PuntniveauShape,
  SectionCalloutShape,
  SpaceShape,
  RebarShape,
  MaterialCategory,
} from 'open-2d-studio';

// ============================================================================
// Types
// ============================================================================

interface IfcxEntity {
  type: string;
  globalId: string;
  name: string;
  description?: string;
  attributes: Record<string, unknown>;
  propertySets?: IfcxPropertySet[];
  quantities?: IfcxQuantitySet[];
  geometry?: IfcxGeometry;
  material?: IfcxMaterial;
  relationships?: IfcxRelationship[];
}

interface IfcxPropertySet {
  name: string;
  description?: string;
  properties: Record<string, unknown>;
}

interface IfcxQuantitySet {
  name: string;
  description?: string;
  quantities: Record<string, { value: number; unit: string }>;
}

interface IfcxGeometry {
  type: string;
  placement?: IfcxPlacement;
  [key: string]: unknown;
}

interface IfcxPlacement {
  location: { x: number; y: number; z: number };
  rotation?: number;
}

interface IfcxMaterial {
  name: string;
  category: string;
  layers?: { name: string; thickness: number; material: string }[];
}

interface IfcxRelationship {
  type: string;
  relatedTo?: string;
  relatedObjects?: string[];
}

interface IfcxDocument {
  schema: string;
  version: string;
  header: {
    description: string;
    implementationLevel: string;
    name: string;
    timestamp: string;
    author: string;
    organization: string;
    application: string;
    applicationVersion: string;
    originatingSystem: string;
  };
  units: {
    length: string;
    area: string;
    volume: string;
    angle: string;
  };
  project: {
    globalId: string;
    name: string;
    description: string;
    spatialStructure: IfcxSpatialNode;
  };
  data: IfcxEntity[];
}

interface IfcxSpatialNode {
  type: string;
  globalId: string;
  name: string;
  elevation?: number;
  children?: IfcxSpatialNode[];
}

// ============================================================================
// Result
// ============================================================================

export interface IfcxGenerationResult {
  content: string;
  entityCount: number;
  fileSize: number;
}

// ============================================================================
// GUID helpers
// ============================================================================

function generateGuid(): string {
  return crypto.randomUUID();
}

function shapeGuid(shapeId: string, suffix?: string): string {
  // Deterministic but unique — combine shape id with suffix
  const input = suffix ? `${shapeId}-${suffix}` : shapeId;
  // Use the shape ID directly since it's already a UUID in most cases
  return input;
}

// ============================================================================
// Geometry helpers
// ============================================================================

function lineLength(start: { x: number; y: number }, end: { x: number; y: number }): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function lineAngle(start: { x: number; y: number }, end: { x: number; y: number }): number {
  return Math.atan2(end.y - start.y, end.x - start.x);
}

function getMaterialName(category: string): string {
  const materialNames: Record<string, string> = {
    concrete: 'Concrete',
    steel: 'Steel',
    timber: 'Timber',
    masonry: 'Masonry',
    glass: 'Glass',
    aluminum: 'Aluminum',
    insulation: 'Insulation',
    gypsum: 'Gypsum',
    bitumen: 'Bitumen',
  };
  return materialNames[category] || category;
}

// ============================================================================
// Shape to Entity converters
// ============================================================================

function convertWall(wall: WallShape, wallTypes: any[]): IfcxEntity {
  const length = lineLength(wall.start, wall.end);
  const angle = lineAngle(wall.start, wall.end);
  const wallHeight = 3000;
  const wallType = wall.wallTypeId ? wallTypes.find((wt: any) => wt.id === wall.wallTypeId) : undefined;
  const materialKey: MaterialCategory = wallType?.material || 'concrete';

  return {
    type: 'IfcWall',
    globalId: shapeGuid(wall.id),
    name: wall.label || 'Wall',
    attributes: {
      predefinedType: 'STANDARD',
      isExternal: true,
      loadBearing: true,
    },
    propertySets: [
      {
        name: 'Pset_WallCommon',
        description: 'Common wall properties',
        properties: {
          Reference: wall.label || 'Wall',
          IsExternal: true,
          LoadBearing: true,
          ExtendToStructure: false,
        },
      },
    ],
    quantities: [
      {
        name: 'Qto_WallBaseQuantities',
        description: 'Wall base quantities',
        quantities: {
          Length: { value: length, unit: 'mm' },
          Width: { value: wall.thickness, unit: 'mm' },
          Height: { value: wallHeight, unit: 'mm' },
          GrossVolume: { value: length * wall.thickness * wallHeight / 1e9, unit: 'm3' },
          GrossSideArea: { value: length * wallHeight / 1e6, unit: 'm2' },
        },
      },
    ],
    geometry: {
      type: 'ExtrudedAreaSolid',
      placement: {
        location: { x: wall.start.x, y: wall.start.y, z: 0 },
        rotation: angle * (180 / Math.PI),
      },
      profile: {
        type: 'RectangleProfileDef',
        xDim: length,
        yDim: wall.thickness,
      },
      depth: wallHeight,
    },
    material: {
      name: getMaterialName(materialKey),
      category: materialKey,
      layers: [
        {
          name: 'Wall Layer',
          thickness: wall.thickness,
          material: getMaterialName(materialKey),
        },
      ],
    },
  };
}

function convertWallOpening(wo: any, allShapes: Shape[]): IfcxEntity | null {
  const hostWall = allShapes.find((s: any) => s.id === wo.hostWallId) as WallShape | undefined;
  if (!hostWall) return null;

  const dx = hostWall.end.x - hostWall.start.x;
  const dy = hostWall.end.y - hostWall.start.y;
  const wallLength = Math.sqrt(dx * dx + dy * dy);
  if (wallLength < 0.001) return null;

  const wallAngle = Math.atan2(dy, dx);
  const dirX = dx / wallLength;
  const dirY = dy / wallLength;
  const openingCenterX = hostWall.start.x + dirX * wo.positionAlongWall;
  const openingCenterY = hostWall.start.y + dirY * wo.positionAlongWall;

  return {
    type: 'IfcOpeningElement',
    globalId: shapeGuid(wo.id),
    name: wo.label || 'Opening',
    attributes: {
      predefinedType: 'OPENING',
    },
    propertySets: [
      {
        name: 'Open2DStudio_WallOpening',
        description: 'Wall opening properties',
        properties: {
          Width: wo.width,
          Height: wo.height,
          SillHeight: wo.sillHeight,
          HostWallId: wo.hostWallId,
        },
      },
    ],
    geometry: {
      type: 'ExtrudedAreaSolid',
      placement: {
        location: { x: openingCenterX, y: openingCenterY, z: wo.sillHeight },
        rotation: wallAngle * (180 / Math.PI),
      },
      profile: {
        type: 'RectangleProfileDef',
        xDim: wo.width,
        yDim: wo.height,
      },
      depth: hostWall.thickness,
    },
    relationships: [
      {
        type: 'IfcRelVoidsElement',
        relatedTo: wo.hostWallId,
      },
    ],
  };
}

function convertBeam(beam: BeamShape): IfcxEntity {
  const length = lineLength(beam.start, beam.end);
  const angle = lineAngle(beam.start, beam.end);
  const flangeWidth = beam.flangeWidth || 200;
  const depth = (beam.profileParameters?.depth as number) || (beam.profileParameters?.h as number) || flangeWidth;
  const isColumn = beam.viewMode === 'section';
  const beamName = beam.labelText || beam.presetName || 'Beam';

  return {
    type: isColumn ? 'IfcColumn' : 'IfcBeam',
    globalId: shapeGuid(beam.id),
    name: beamName,
    attributes: {
      predefinedType: isColumn ? 'COLUMN' : 'BEAM',
      profileType: beam.profileType,
      presetName: beam.presetName,
    },
    propertySets: [
      {
        name: isColumn ? 'Pset_ColumnCommon' : 'Pset_BeamCommon',
        description: isColumn ? 'Common column properties' : 'Common beam properties',
        properties: {
          Reference: beamName,
          IsExternal: false,
          LoadBearing: true,
          Span: length,
        },
      },
      {
        name: 'Open2DStudio_BeamDimensions',
        description: 'Beam profile dimensions from Open 2D Studio',
        properties: {
          ProfileType: beam.profileType,
          FlangeWidth: flangeWidth,
          Depth: depth,
          Material: getMaterialName(beam.material),
          ...(beam.presetName ? { PresetName: beam.presetName } : {}),
        },
      },
    ],
    geometry: {
      type: 'ExtrudedAreaSolid',
      placement: {
        location: { x: beam.start.x, y: beam.start.y, z: 0 },
        rotation: angle * (180 / Math.PI),
      },
      profile: {
        type: 'RectangleProfileDef',
        xDim: flangeWidth,
        yDim: depth,
      },
      depth: length,
    },
    material: {
      name: getMaterialName(beam.material),
      category: beam.material,
    },
  };
}

function convertColumn(col: ColumnShape): IfcxEntity {
  const colHeight = 3000;
  const colName = col.profile || `Column ${col.width}x${col.depth}`;

  return {
    type: 'IfcColumn',
    globalId: shapeGuid(col.id),
    name: colName,
    attributes: {
      predefinedType: 'COLUMN',
    },
    propertySets: [
      {
        name: 'Pset_ColumnCommon',
        description: 'Common column properties',
        properties: {
          Reference: colName,
          IsExternal: false,
          LoadBearing: true,
        },
      },
      {
        name: 'Open2DStudio_ColumnDimensions',
        description: 'Column dimensions from Open 2D Studio',
        properties: {
          Width: col.width,
          Depth: col.depth,
          Height: colHeight,
          Material: getMaterialName(col.material),
          ...(col.profile ? { Profile: col.profile } : {}),
          ...(col.section ? { Section: col.section } : {}),
        },
      },
    ],
    geometry: {
      type: 'ExtrudedAreaSolid',
      placement: {
        location: { x: col.position.x, y: col.position.y, z: 0 },
        rotation: col.rotation || 0,
      },
      profile: {
        type: 'RectangleProfileDef',
        xDim: col.width,
        yDim: col.depth,
      },
      depth: colHeight,
    },
    material: {
      name: getMaterialName(col.material),
      category: col.material,
    },
  };
}

function convertSlab(slab: SlabShape): IfcxEntity {
  const thickness = slab.thickness || 200;

  // Shoelace area
  let area = 0;
  const pts = slab.points;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    area += pts[i].x * pts[j].y;
    area -= pts[j].x * pts[i].y;
  }
  area = Math.abs(area) / 2;

  return {
    type: 'IfcSlab',
    globalId: shapeGuid(slab.id),
    name: slab.label || 'Slab',
    attributes: {
      predefinedType: 'FLOOR',
    },
    propertySets: [
      {
        name: 'Pset_SlabCommon',
        description: 'Common slab properties',
        properties: {
          Reference: slab.label || 'Slab',
          IsExternal: false,
          LoadBearing: true,
        },
      },
    ],
    quantities: [
      {
        name: 'Qto_SlabBaseQuantities',
        description: 'Slab base quantities',
        quantities: {
          Depth: { value: thickness, unit: 'mm' },
          GrossArea: { value: area / 1e6, unit: 'm2' },
          GrossVolume: { value: area * thickness / 1e9, unit: 'm3' },
        },
      },
    ],
    geometry: {
      type: 'ExtrudedAreaSolid',
      placement: {
        location: { x: 0, y: 0, z: slab.elevation || 0 },
      },
      profile: {
        type: 'ArbitraryClosedProfileDef',
        outerCurve: slab.points.map((pt: { x: number; y: number }) => ({ x: pt.x, y: pt.y })),
      },
      depth: thickness,
    },
    material: {
      name: getMaterialName(slab.material),
      category: slab.material,
      layers: [
        {
          name: 'Slab Layer',
          thickness,
          material: getMaterialName(slab.material),
        },
      ],
    },
  };
}

function convertPile(pile: PileShape, pileTypes: any[]): IfcxEntity {
  const pileTypeDef = pile.pileTypeId && pileTypes
    ? pileTypes.find((pt: any) => pt.id === pile.pileTypeId)
    : undefined;
  const isSquare = pileTypeDef?.shape === 'square';
  const pileLength = 10000;
  const pileMaterial = pileTypeDef?.method === 'Stalen buispaal' ? 'steel'
    : pileTypeDef?.method === 'Hout' ? 'timber' : 'concrete';
  const pileArea = isSquare
    ? pile.diameter * pile.diameter
    : Math.PI * (pile.diameter / 2) * (pile.diameter / 2);

  const propertySets: IfcxPropertySet[] = [
    {
      name: 'Pset_PileCommon',
      description: 'Common pile properties',
      properties: {
        Reference: pile.label || 'Pile',
        Status: 'New',
        Diameter: pile.diameter,
        Length: pileLength,
        ...(pile.puntniveauNAP != null ? { DesignParameters: `TipLevel=${pile.puntniveauNAP}m NAP` } : {}),
        ...(pile.bkPaalPeil != null ? { CutoffLevel: pile.bkPaalPeil } : {}),
      },
    },
  ];

  if (pileTypeDef) {
    propertySets.push({
      name: 'Open2DStudio_PileType',
      description: 'Pile type properties from Open 2D Studio',
      properties: {
        PileTypeName: pileTypeDef.name,
        CrossSectionShape: pileTypeDef.shape,
        ConstructionMethod: pileTypeDef.method,
        PredefinedType: pileTypeDef.ifcPredefinedType,
      },
    });
  }

  const elevProps: Record<string, number> = {};
  if (pile.puntniveauNAP != null) elevProps.TipLevelNAP = pile.puntniveauNAP * 1000;
  if (pile.bkPaalPeil != null) elevProps.CutoffLevel = pile.bkPaalPeil;
  if ((pile as any).cutoffLevel != null) elevProps.CutoffLevelNAP = (pile as any).cutoffLevel * 1000;
  if ((pile as any).tipLevel != null) elevProps.ActualTipLevelNAP = (pile as any).tipLevel * 1000;
  if (Object.keys(elevProps).length > 0) {
    propertySets.push({
      name: 'Open2DStudio_PileElevations',
      description: 'Pile elevation data from Open 2D Studio',
      properties: elevProps,
    });
  }

  return {
    type: 'IfcPile',
    globalId: shapeGuid(pile.id),
    name: pile.label || 'Pile',
    attributes: {
      predefinedType: pileTypeDef?.ifcPredefinedType || 'DRIVEN',
    },
    propertySets,
    quantities: [
      {
        name: 'Open2DStudio_PileDimensions',
        description: 'Pile dimensions from Open 2D Studio',
        quantities: {
          Diameter: { value: pile.diameter, unit: 'mm' },
          Length: { value: pileLength, unit: 'mm' },
          CrossSectionalArea: { value: pileArea / 1e6, unit: 'm2' },
        },
      },
    ],
    geometry: {
      type: 'ExtrudedAreaSolid',
      placement: {
        location: { x: pile.position.x, y: pile.position.y, z: 0 },
      },
      profile: isSquare
        ? { type: 'RectangleProfileDef', xDim: pile.diameter, yDim: pile.diameter }
        : { type: 'CircleProfileDef', radius: pile.diameter / 2 },
      depth: pileLength,
    },
    material: {
      name: getMaterialName(pileMaterial),
      category: pileMaterial,
    },
  };
}

function convertCPT(cpt: CPTShape): IfcxEntity {
  const cptDiameter = 36;
  const cptDepth = cpt.depth ?? 30000;
  const coneHeight = Math.min(cptDiameter / 2 * 1.732, 100);

  return {
    type: 'IfcBuildingElementProxy',
    globalId: shapeGuid(cpt.id),
    name: cpt.name || 'CPT',
    description: 'Cone Penetration Test (Sondering)',
    attributes: {
      objectType: 'IfcBorehole',
    },
    propertySets: [
      {
        name: 'Pset_BuildingElementProxyCommon',
        description: 'Common proxy properties',
        properties: {
          Reference: cpt.name || 'CPT',
        },
      },
      {
        name: 'Open2DStudio_CPT',
        description: 'CPT geotechnical properties from Open 2D Studio',
        properties: {
          ShapeType: 'cpt',
          Name: cpt.name || '',
          ObjectType: 'IfcBorehole',
          Depth: cptDepth,
          ConeDiameter: cptDiameter,
          ConeHeight: coneHeight,
          Kleefmeting: cpt.kleefmeting ?? false,
          Waterspanning: cpt.waterspanning ?? false,
          Uitgevoerd: cpt.uitgevoerd ?? false,
        },
      },
    ],
    geometry: {
      type: 'ExtrudedAreaSolid',
      placement: {
        location: { x: cpt.position.x, y: cpt.position.y, z: 0 },
      },
      profile: { type: 'CircleProfileDef', radius: cptDiameter / 2 },
      depth: cptDepth,
      direction: { x: 0, y: 0, z: -1 },
    },
    material: {
      name: 'Steel',
      category: 'steel',
    },
  };
}

function convertGridline(gridline: GridlineShape): IfcxEntity {
  return {
    type: 'IfcGridAxis',
    globalId: shapeGuid(gridline.id),
    name: gridline.label,
    attributes: {
      axisCurve: {
        type: 'Polyline',
        points: [
          { x: gridline.start.x, y: gridline.start.y, z: 0 },
          { x: gridline.end.x, y: gridline.end.y, z: 0 },
        ],
      },
      sameSense: true,
    },
    geometry: {
      type: 'Curve2D',
      placement: {
        location: { x: 0, y: 0, z: 0 },
      },
      points: [
        { x: gridline.start.x, y: gridline.start.y },
        { x: gridline.end.x, y: gridline.end.y },
      ],
    },
  };
}

function convertLevel(level: LevelShape): IfcxEntity {
  return {
    type: 'IfcAnnotation',
    globalId: shapeGuid(level.id),
    name: level.label || `Level ${level.elevation}`,
    description: `Elevation: ${level.elevation}mm`,
    attributes: {
      shapeType: 'level',
      elevation: level.elevation,
    },
    propertySets: [
      {
        name: 'Open2DStudio_Annotation',
        description: 'Level annotation properties',
        properties: {
          ShapeType: 'level',
          Elevation: level.elevation,
          Label: level.label || '',
          ...(level.description ? { Description: level.description } : {}),
        },
      },
    ],
    geometry: {
      type: 'Curve2D',
      placement: {
        location: { x: level.start.x, y: level.start.y, z: 0 },
      },
      points: [
        { x: level.start.x, y: level.start.y },
        { x: level.end.x, y: level.end.y },
      ],
    },
  };
}

function convertPuntniveau(pnv: PuntniveauShape): IfcxEntity {
  let area = 0;
  const pts = pnv.points;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    area += pts[i].x * pts[j].y;
    area -= pts[j].x * pts[i].y;
  }
  area = Math.abs(area) / 2;

  return {
    type: 'IfcBuildingElementProxy',
    globalId: shapeGuid(pnv.id),
    name: `Puntniveau ${pnv.puntniveauNAP} m NAP`,
    description: 'Designed pile tip level zone',
    attributes: {
      predefinedType: 'USERDEFINED',
      objectType: 'Puntniveau',
    },
    propertySets: [
      {
        name: 'Open2DStudio_Puntniveau',
        description: 'Puntniveau properties from Open 2D Studio',
        properties: {
          ShapeType: 'puntniveau',
          PuntniveauNAP: pnv.puntniveauNAP * 1000,
          PuntniveauNAP_m: `${pnv.puntniveauNAP} m NAP`,
          Area: area / 1e6,
        },
      },
    ],
    geometry: {
      type: 'ExtrudedAreaSolid',
      placement: {
        location: { x: 0, y: 0, z: pnv.puntniveauNAP * 1000 },
      },
      profile: {
        type: 'ArbitraryClosedProfileDef',
        outerCurve: pnv.points.map((pt: { x: number; y: number }) => ({ x: pt.x, y: pt.y })),
      },
      depth: 10,
    },
  };
}

function convertSectionCallout(sc: SectionCalloutShape): IfcxEntity {
  return {
    type: 'IfcAnnotation',
    globalId: shapeGuid(sc.id),
    name: `Section ${sc.label}`,
    description: `${sc.calloutType} callout`,
    attributes: {
      shapeType: 'section-callout',
    },
    propertySets: [
      {
        name: 'Open2DStudio_Annotation',
        description: 'Section callout annotation properties',
        properties: {
          ShapeType: 'section-callout',
          CalloutType: sc.calloutType,
          Label: sc.label,
          ...(sc.targetDrawingId ? { TargetDrawingId: sc.targetDrawingId } : {}),
        },
      },
    ],
    geometry: {
      type: 'Curve2D',
      placement: {
        location: { x: sc.start.x, y: sc.start.y, z: 0 },
      },
      points: [
        { x: sc.start.x, y: sc.start.y },
        { x: sc.end.x, y: sc.end.y },
      ],
    },
  };
}

function convertSpace(space: SpaceShape): IfcxEntity {
  const spaceName = space.number
    ? `${space.number} - ${space.name}`
    : space.name;

  const properties: Record<string, unknown> = {
    SpaceName: space.name,
  };
  if (space.number) properties.SpaceNumber = space.number;
  if (space.area !== undefined) {
    properties.GrossFloorArea = space.area;
    properties.NetFloorArea = space.area;
  }
  if (space.level) properties.Level = space.level;
  properties.IsExternal = false;

  return {
    type: 'IfcSpace',
    globalId: shapeGuid(space.id),
    name: spaceName,
    attributes: {
      compositionType: 'ELEMENT',
      internalOrExternal: 'INTERNAL',
      longName: space.name,
    },
    propertySets: [
      {
        name: 'Pset_SpaceCommon',
        description: 'Common space properties',
        properties,
      },
      {
        name: 'Open2DStudio_Space',
        description: 'Space annotation properties',
        properties: {
          ShapeType: 'space',
          SpaceName: space.name,
          ...(space.number ? { SpaceNumber: space.number } : {}),
        },
      },
    ],
    geometry: space.contourPoints && space.contourPoints.length >= 3 ? {
      type: 'FootPrint',
      placement: {
        location: { x: 0, y: 0, z: 0 },
      },
      contour: space.contourPoints.map((p: { x: number; y: number }) => ({ x: p.x, y: p.y })),
    } : undefined,
  };
}

function convertRebar(rebar: RebarShape): IfcxEntity {
  const barLength = rebar.length || 1000;
  const rebarName = rebar.barMark || 'Rebar';

  const properties: Record<string, unknown> = {
    ShapeType: 'rebar',
    BarMark: rebar.barMark,
    Diameter: rebar.diameter,
    BarLength: barLength,
  };
  if (rebar.count != null) properties.Count = rebar.count;
  if (rebar.spacing != null) properties.Spacing = rebar.spacing;
  if (rebar.bendShape) properties.BendShape = rebar.bendShape;

  return {
    type: 'IfcReinforcingBar',
    globalId: shapeGuid(rebar.id),
    name: rebarName,
    attributes: {
      predefinedType: 'USERDEFINED',
      objectType: 'IfcReinforcingBar',
    },
    propertySets: [
      {
        name: 'Open2DStudio_Rebar',
        description: 'Reinforcing bar properties from Open 2D Studio',
        properties,
      },
    ],
    geometry: {
      type: 'ExtrudedAreaSolid',
      placement: {
        location: { x: rebar.position.x, y: rebar.position.y, z: 0 },
      },
      profile: { type: 'CircleProfileDef', radius: rebar.diameter / 2 },
      depth: barLength,
    },
    material: {
      name: 'Steel',
      category: 'steel',
    },
  };
}

// ============================================================================
// Main Generator
// ============================================================================

export function generateIFCX(): IfcxGenerationResult {
  const state = useAppStore.getState();
  const { shapes, wallTypes, projectStructure, pileTypes } = state;

  const timestamp = new Date().toISOString();
  const entities: IfcxEntity[] = [];

  // Build spatial structure
  const siteName = projectStructure?.siteName || 'Default Site';
  const buildings = projectStructure?.buildings ?? [
    { id: 'default-building', name: 'Default Building', storeys: [] },
  ];

  const spatialStructure: IfcxSpatialNode = {
    type: 'IfcSite',
    globalId: generateGuid(),
    name: siteName,
    children: buildings.map((building: any) => ({
      type: 'IfcBuilding',
      globalId: generateGuid(),
      name: building.name,
      children: building.storeys.length > 0
        ? building.storeys.map((storey: any) => ({
            type: 'IfcBuildingStorey',
            globalId: shapeGuid(storey.id),
            name: storey.name,
            elevation: storey.elevation,
          }))
        : [{
            type: 'IfcBuildingStorey',
            globalId: generateGuid(),
            name: 'Ground Floor',
            elevation: 0,
          }],
    })),
  };

  // Filter out section-reference shapes
  const exportShapes = shapes.filter((s: Shape) => !s.id.startsWith('section-ref-'));

  // Track exported projectGridIds (same dedup as IFC4 exporter)
  const exportedProjectGridIds = new Set<string>();

  // Convert each shape
  for (const shape of exportShapes) {
    switch (shape.type) {
      case 'wall':
        entities.push(convertWall(shape as WallShape, wallTypes));
        break;

      case 'wall-opening': {
        const entity = convertWallOpening(shape, shapes);
        if (entity) entities.push(entity);
        break;
      }

      case 'beam':
        entities.push(convertBeam(shape as BeamShape));
        break;

      case 'column':
        entities.push(convertColumn(shape as ColumnShape));
        break;

      case 'slab':
        if ((shape as SlabShape).points.length >= 3) {
          entities.push(convertSlab(shape as SlabShape));
        }
        break;

      case 'pile':
        entities.push(convertPile(shape as PileShape, pileTypes || []));
        break;

      case 'cpt':
        entities.push(convertCPT(shape as CPTShape));
        break;

      case 'gridline': {
        const gridline = shape as GridlineShape;
        if (gridline.projectGridId) {
          if (exportedProjectGridIds.has(gridline.projectGridId)) break;
          exportedProjectGridIds.add(gridline.projectGridId);
        }
        entities.push(convertGridline(gridline));
        break;
      }

      case 'level':
        entities.push(convertLevel(shape as LevelShape));
        break;

      case 'puntniveau':
        if ((shape as PuntniveauShape).points.length >= 3) {
          entities.push(convertPuntniveau(shape as PuntniveauShape));
        }
        break;

      case 'section-callout':
        entities.push(convertSectionCallout(shape as SectionCalloutShape));
        break;

      case 'space':
        entities.push(convertSpace(shape as SpaceShape));
        break;

      case 'rebar':
        entities.push(convertRebar(shape as RebarShape));
        break;

      // Basic geometry shapes as annotations
      case 'line':
      case 'arc':
      case 'circle':
      case 'polyline':
      case 'rectangle':
      case 'dimension':
      case 'text':
        entities.push({
          type: 'IfcAnnotation',
          globalId: shapeGuid(shape.id),
          name: shape.type.charAt(0).toUpperCase() + shape.type.slice(1),
          attributes: {
            shapeType: shape.type,
          },
        });
        break;
    }
  }

  const document: IfcxDocument = {
    schema: 'IFCX',
    version: '0.1',
    header: {
      description: 'IFCX export from Open 2D Studio AEC Extension',
      implementationLevel: '1.0',
      name: state.projectName || 'Untitled Project',
      timestamp,
      author: '',
      organization: '',
      application: 'Open 2D Studio',
      applicationVersion: '1.0',
      originatingSystem: 'Open 2D Studio AEC Extension',
    },
    units: {
      length: 'MILLIMETRE',
      area: 'SQUARE_METRE',
      volume: 'CUBIC_METRE',
      angle: 'RADIAN',
    },
    project: {
      globalId: generateGuid(),
      name: state.projectName || 'Default Project',
      description: 'IFC project exported in IFCX JSON format',
      spatialStructure,
    },
    data: entities,
  };

  const content = JSON.stringify(document, null, 2);
  const fileSize = new Blob([content]).size;

  return {
    content,
    entityCount: entities.length,
    fileSize,
  };
}

/**
 * Export IFCX file: generate and download as .ifcx JSON file.
 */
export function exportIFCX(): void {
  const state = useAppStore.getState();
  if (state.shapes.length === 0) {
    alert('Nothing to export. Draw some shapes first.');
    return;
  }

  const result = generateIFCX();

  const blob = new Blob([result.content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${state.projectName || 'model'}.ifcx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
