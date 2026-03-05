/**
 * AEC IFC export handlers.
 *
 * Registers 10 AEC shape-type export functions into the ifcExportRegistry
 * so ifcGenerator can delegate without hard-coded switch cases.
 */

import { ifcExportRegistry, createCurveAnnotation } from 'open-2d-studio';
import type {
  WallShape,
  BeamShape,
  SlabShape,
  PileShape,
  CPTShape,
  GridlineShape,
  LevelShape,
  PuntniveauShape,
  SectionCalloutShape,
  SpaceShape,
  MaterialCategory,
} from 'open-2d-studio';

const IFC_TYPES = ['wall', 'beam', 'slab', 'pile', 'cpt', 'gridline', 'level', 'puntniveau', 'section-callout', 'space'] as const;

export function registerIfcExport(): void {

  // ---------- Wall ----------

  ifcExportRegistry.register('wall', (shape, ctx) => {
    const wall = shape as WallShape;
    const b = ctx.builder;
    const length = ctx.lineLength(wall.start, wall.end);
    if (length < 0.001) return;
    const angle = ctx.lineAngle(wall.start, wall.end);
    const wallHeight = 3000;

    // Axis representation (centerline)
    const axisStartPt = b.addCartesianPoint(0, 0, 0);
    const axisEndPt = b.addCartesianPoint(length, 0, 0);
    const axisPolyline = b.addPolyline([axisStartPt, axisEndPt]);
    const axisShapeRep = b.addShapeRepresentation(ctx.axisSubContext, 'Axis', 'Curve2D', [axisPolyline]);

    // Body representation
    const wallProfileCenter = b.addCartesianPoint2D(length / 2, 0);
    const wallProfilePlacement = b.addAxis2Placement2D(wallProfileCenter);
    const wallProfile = b.addRectangleProfileDef('.AREA.', null, wallProfilePlacement, length, wall.thickness);
    const wallSolid = b.addExtrudedAreaSolid(wallProfile, ctx.identityPlacement, ctx.extrusionDir, wallHeight);
    const bodyShapeRep = b.addShapeRepresentation(ctx.bodySubContext, 'Body', 'SweptSolid', [wallSolid]);
    const wallProdShape = b.addProductDefinitionShape(null, null, [axisShapeRep, bodyShapeRep]);

    const placement = ctx.createElementPlacement(wall.start.x, wall.start.y, 0, angle);
    const wallEntityId = b.addWall(ctx.shapeToIfcGuid(wall.id), ctx.ownerHistoryId, wall.label || 'Wall', placement, wallProdShape);
    ctx.addElementToStorey(wallEntityId, ctx.resolveStoreyForShape(wall));

    if (wall.wallTypeId && ctx.wallTypeElements.has(wall.wallTypeId)) {
      ctx.wallTypeElements.get(wall.wallTypeId)!.push(wallEntityId);
    }

    // Material Layer Set Usage
    const wallType = wall.wallTypeId ? ctx.wallTypes.find((wt: any) => wt.id === wall.wallTypeId) : undefined;
    const wallMaterialKey: MaterialCategory = wallType?.material || 'concrete';
    const wallMatId = ctx.materials.getOrCreate(wallMaterialKey);
    const wallLayer = b.addMaterialLayer(wallMatId, wall.thickness, null, 'Wall Layer');
    const wallLayerSet = b.addMaterialLayerSet([wallLayer], `${wall.label || 'Wall'} LayerSet`);
    const wallOffset = wall.justification === 'center' ? -wall.thickness / 2
      : wall.justification === 'left' ? -wall.thickness : 0;
    const wallLayerSetUsage = b.addMaterialLayerSetUsage(wallLayerSet, 'AXIS2', 'POSITIVE', wallOffset);
    ctx.layerSetUsageAssociations.push({ elementIds: [wallEntityId], usageId: wallLayerSetUsage });

    // Pset_WallCommon
    ctx.assignPropertySet(wallEntityId, wall.id, 'pset', 'Pset_WallCommon', 'Common wall properties', [
      b.addPropertySingleValue('Reference', null, ctx.ifcIdentifier(wall.label || 'Wall'), null),
      b.addPropertySingleValue('IsExternal', null, ctx.ifcBoolean(true), null),
      b.addPropertySingleValue('LoadBearing', null, ctx.ifcBoolean(true), null),
      b.addPropertySingleValue('ExtendToStructure', null, ctx.ifcBoolean(false), null),
    ]);

    // Qto_WallBaseQuantities
    ctx.assignPropertySet(wallEntityId, wall.id, 'qto', 'Qto_WallBaseQuantities', 'Wall base quantities', [
      b.addPropertySingleValue('Length', null, ctx.ifcLengthMeasure(length), ctx.lengthUnit),
      b.addPropertySingleValue('Width', null, ctx.ifcPositiveLengthMeasure(wall.thickness), ctx.lengthUnit),
      b.addPropertySingleValue('Height', null, ctx.ifcPositiveLengthMeasure(wallHeight), ctx.lengthUnit),
      b.addPropertySingleValue('GrossVolume', null, ctx.ifcVolumeMeasure(length * wall.thickness * wallHeight / 1e9), ctx.volumeUnit),
      b.addPropertySingleValue('GrossSideArea', null, ctx.ifcAreaMeasure(length * wallHeight / 1e6), ctx.areaUnit),
    ]);
  });

  // ---------- Beam ----------

  ifcExportRegistry.register('beam', (shape, ctx) => {
    const beam = shape as BeamShape;
    const b = ctx.builder;
    const length = ctx.lineLength(beam.start, beam.end);
    if (length < 0.001) return;
    const angle = ctx.lineAngle(beam.start, beam.end);

    const flangeWidth = beam.flangeWidth || 200;
    const depth = (beam.profileParameters?.depth as number) || (beam.profileParameters?.h as number) || flangeWidth;

    // Axis representation
    const beamAxisStart = b.addCartesianPoint(0, 0, 0);
    const beamAxisEnd = b.addCartesianPoint(0, 0, length);
    const beamAxisPolyline = b.addPolyline([beamAxisStart, beamAxisEnd]);
    const beamAxisRep = b.addShapeRepresentation(ctx.axisSubContext, 'Axis', 'Curve2D', [beamAxisPolyline]);

    // Body representation
    const beamProfile = b.addRectangleProfileDef('.AREA.', null, ctx.profilePlacement2D, flangeWidth, depth);
    const beamSolid = b.addExtrudedAreaSolid(beamProfile, ctx.identityPlacement, ctx.extrusionDir, length);
    const beamBodyRep = b.addShapeRepresentation(ctx.bodySubContext, 'Body', 'SweptSolid', [beamSolid]);
    const beamProdShape = b.addProductDefinitionShape(null, null, [beamAxisRep, beamBodyRep]);

    const placement = ctx.createElementPlacement(beam.start.x, beam.start.y, 0, angle);
    const beamName = beam.labelText || beam.presetName || 'Beam';
    const isColumn = beam.viewMode === 'section';

    const beamEntityId = isColumn
      ? b.addColumn(ctx.shapeToIfcGuid(beam.id), ctx.ownerHistoryId, beamName, placement, beamProdShape)
      : b.addBeam(ctx.shapeToIfcGuid(beam.id), ctx.ownerHistoryId, beamName, placement, beamProdShape);
    ctx.addElementToStorey(beamEntityId, ctx.resolveStoreyForShape(beam));

    // Track beam type
    const typeKey = beam.presetId || beam.profileType || 'default-beam';
    if (!ctx.beamTypeIfcMap.has(typeKey)) {
      const btId = b.addBeamType(
        ctx.shapeToIfcGuid(typeKey, 'bt'), ctx.ownerHistoryId,
        beam.presetName || beam.profileType || 'Beam'
      );
      ctx.beamTypeIfcMap.set(typeKey, btId);
      ctx.beamTypeElements.set(typeKey, []);
    }
    ctx.beamTypeElements.get(typeKey)!.push(beamEntityId);

    // Material
    const beamMatId = ctx.materials.getOrCreate(beam.material as MaterialCategory);
    ctx.materialAssociations.push({ elementIds: [beamEntityId], materialId: beamMatId });

    // Pset_BeamCommon / Pset_ColumnCommon
    ctx.assignPropertySet(beamEntityId, beam.id, 'pset',
      isColumn ? 'Pset_ColumnCommon' : 'Pset_BeamCommon',
      isColumn ? 'Common column properties' : 'Common beam properties', [
        b.addPropertySingleValue('Reference', null, ctx.ifcIdentifier(beamName), null),
        b.addPropertySingleValue('IsExternal', null, ctx.ifcBoolean(false), null),
        b.addPropertySingleValue('LoadBearing', null, ctx.ifcBoolean(true), null),
        b.addPropertySingleValue('Span', null, ctx.ifcPositiveLengthMeasure(length), ctx.lengthUnit),
      ]);

    // Open2DStudio_BeamDimensions
    const beamDimProps: number[] = [
      b.addPropertySingleValue('ProfileType', null, ctx.ifcLabel(beam.profileType), null),
      b.addPropertySingleValue('FlangeWidth', null, ctx.ifcPositiveLengthMeasure(flangeWidth), ctx.lengthUnit),
      b.addPropertySingleValue('Depth', null, ctx.ifcPositiveLengthMeasure(depth), ctx.lengthUnit),
      b.addPropertySingleValue('Material', null, ctx.ifcLabel(ctx.getMaterialDisplayName(beam.material)), null),
    ];
    if (beam.presetName) {
      beamDimProps.push(b.addPropertySingleValue('PresetName', null, ctx.ifcLabel(beam.presetName), null));
    }
    ctx.assignPropertySet(beamEntityId, beam.id, 'dims', 'Open2DStudio_BeamDimensions', 'Beam profile dimensions from Open 2D Studio', beamDimProps);
  });

  // ---------- Slab ----------

  ifcExportRegistry.register('slab', (shape, ctx) => {
    const slab = shape as SlabShape;
    const b = ctx.builder;
    if (slab.points.length < 3) return;

    const polylinePts: number[] = [];
    for (const pt of slab.points) {
      polylinePts.push(b.addCartesianPoint2D(pt.x, pt.y));
    }
    polylinePts.push(b.addCartesianPoint2D(slab.points[0].x, slab.points[0].y));

    const polyline = b.addPolyline(polylinePts);
    const slabProfile = b.addArbitraryClosedProfileDef('.AREA.', null, polyline);

    const thickness = slab.thickness || 200;
    const slabSolid = b.addExtrudedAreaSolid(slabProfile, ctx.identityPlacement, ctx.extrusionDir, thickness);
    const slabShapeRep = b.addShapeRepresentation(ctx.bodySubContext, 'Body', 'SweptSolid', [slabSolid]);
    const slabProdShape = b.addProductDefinitionShape(null, null, [slabShapeRep]);

    const elevation = slab.elevation || 0;
    const slabPlacePt = b.addCartesianPoint(0, 0, elevation);
    const slabAxisPlace = b.addAxis2Placement3D(slabPlacePt, ctx.zDir, ctx.xDir);
    const slabPlacement = b.addLocalPlacement(ctx.defaultStoreyPlacement, slabAxisPlace);

    const slabEntityId = b.addSlab(
      ctx.shapeToIfcGuid(slab.id), ctx.ownerHistoryId, slab.label || 'Slab',
      slabPlacement, slabProdShape
    );
    ctx.addElementToStorey(slabEntityId, ctx.resolveStoreyForShape(slab));

    const matchingSlabType = ctx.slabTypes.find(
      (st: any) => st.thickness === slab.thickness && st.material === slab.material
    );
    if (matchingSlabType && ctx.slabTypeElements.has(matchingSlabType.id)) {
      ctx.slabTypeElements.get(matchingSlabType.id)!.push(slabEntityId);
    }

    // Material Layer Set Usage
    const slabMatId = ctx.materials.getOrCreate(slab.material);
    const slabLayer = b.addMaterialLayer(slabMatId, thickness, null, 'Slab Layer');
    const slabLayerSet = b.addMaterialLayerSet([slabLayer], `${slab.label || 'Slab'} LayerSet`);
    const slabLayerSetUsage = b.addMaterialLayerSetUsage(slabLayerSet, 'AXIS3', 'POSITIVE', 0);
    ctx.layerSetUsageAssociations.push({ elementIds: [slabEntityId], usageId: slabLayerSetUsage });

    // Pset_SlabCommon
    ctx.assignPropertySet(slabEntityId, slab.id, 'pset', 'Pset_SlabCommon', 'Common slab properties', [
      b.addPropertySingleValue('Reference', null, ctx.ifcIdentifier(slab.label || 'Slab'), null),
      b.addPropertySingleValue('IsExternal', null, ctx.ifcBoolean(false), null),
      b.addPropertySingleValue('LoadBearing', null, ctx.ifcBoolean(true), null),
    ]);

    // Qto_SlabBaseQuantities (Shoelace formula for area)
    let slabArea = 0;
    const pts = slab.points;
    for (let i = 0; i < pts.length; i++) {
      const j = (i + 1) % pts.length;
      slabArea += pts[i].x * pts[j].y;
      slabArea -= pts[j].x * pts[i].y;
    }
    slabArea = Math.abs(slabArea) / 2;

    ctx.assignPropertySet(slabEntityId, slab.id, 'qto', 'Qto_SlabBaseQuantities', 'Slab base quantities', [
      b.addPropertySingleValue('Depth', null, ctx.ifcPositiveLengthMeasure(thickness), ctx.lengthUnit),
      b.addPropertySingleValue('GrossArea', null, ctx.ifcAreaMeasure(slabArea / 1e6), ctx.areaUnit),
      b.addPropertySingleValue('GrossVolume', null, ctx.ifcVolumeMeasure(slabArea * thickness / 1e9), ctx.volumeUnit),
    ]);
  });

  // ---------- Pile ----------

  ifcExportRegistry.register('pile', (shape, ctx) => {
    const pile = shape as PileShape;
    const b = ctx.builder;

    if (!ctx.isShapeInPlanDrawing(pile)) return;

    // Resolve pile type definition (if referenced)
    const pileTypeDef = pile.pileTypeId && ctx.pileTypes
      ? ctx.pileTypes.find((pt: any) => pt.id === pile.pileTypeId)
      : undefined;

    const isSquare = pileTypeDef?.shape === 'square';

    const pileProfileId = isSquare
      ? b.addRectangleProfileDef('.AREA.', null, ctx.profilePlacement2D, pile.diameter, pile.diameter)
      : b.addCircleProfileDef('.AREA.', null, ctx.profilePlacement2D, pile.diameter / 2);
    const pileLength = 10000;
    const pileSolid = b.addExtrudedAreaSolid(pileProfileId, ctx.identityPlacement, ctx.extrusionDir, pileLength);
    const pileShapeRep = b.addShapeRepresentation(ctx.bodySubContext, 'Body', 'SweptSolid', [pileSolid]);
    const pileProdShape = b.addProductDefinitionShape(null, null, [pileShapeRep]);

    const pilePlacePt = b.addCartesianPoint(pile.position.x, pile.position.y, 0);
    const pileAxisPlace = b.addAxis2Placement3D(pilePlacePt, ctx.zDir, ctx.xDir);
    const pilePlacement = b.addLocalPlacement(ctx.defaultStoreyPlacement, pileAxisPlace);

    const pileEntityId = b.addPile(
      ctx.shapeToIfcGuid(pile.id), ctx.ownerHistoryId, pile.label || 'Pile',
      pilePlacement, pileProdShape
    );
    ctx.addElementToStorey(pileEntityId, ctx.defaultStoreyId);

    // Material
    const pileMaterial = pileTypeDef?.method === 'Stalen buispaal' ? 'steel'
      : pileTypeDef?.method === 'Hout' ? 'timber'
      : 'concrete';
    const pileMatId = ctx.materials.getOrCreate(pileMaterial as MaterialCategory);
    ctx.materialAssociations.push({ elementIds: [pileEntityId], materialId: pileMatId });

    // Pset_PileCommon
    const psetPileCommonProps = [
      b.addPropertySingleValue('Reference', null, ctx.ifcIdentifier(pile.label || 'Pile'), null),
      b.addPropertySingleValue('Status', null, ctx.ifcLabel('New'), null),
      b.addPropertySingleValue('Diameter', null, ctx.ifcPositiveLengthMeasure(pile.diameter), ctx.lengthUnit),
      b.addPropertySingleValue('Length', null, ctx.ifcPositiveLengthMeasure(pileLength), ctx.lengthUnit),
    ];
    if (pile.puntniveauNAP != null) {
      psetPileCommonProps.push(b.addPropertySingleValue('DesignParameters', null, ctx.ifcLabel(`TipLevel=${pile.puntniveauNAP}m NAP`), null));
    }
    if (pile.bkPaalPeil != null) {
      psetPileCommonProps.push(b.addPropertySingleValue('CutoffLevel', null, ctx.ifcLengthMeasure(pile.bkPaalPeil), ctx.lengthUnit));
    }
    ctx.assignPropertySet(pileEntityId, pile.id, 'pset', 'Pset_PileCommon', 'Common pile properties', psetPileCommonProps);

    // Open2DStudio_PileType
    if (pileTypeDef) {
      ctx.assignPropertySet(pileEntityId, pile.id, 'ptpset', 'Open2DStudio_PileType', 'Pile type properties from Open 2D Studio', [
        b.addPropertySingleValue('PileTypeName', null, ctx.ifcLabel(pileTypeDef.name), null),
        b.addPropertySingleValue('CrossSectionShape', null, ctx.ifcLabel(pileTypeDef.shape), null),
        b.addPropertySingleValue('ConstructionMethod', null, ctx.ifcLabel(pileTypeDef.method), null),
        b.addPropertySingleValue('PredefinedType', null, ctx.ifcLabel(pileTypeDef.ifcPredefinedType), null),
      ]);
    }

    // Open2DStudio_PileElevations
    const pileElevProps: number[] = [];
    if (pile.puntniveauNAP != null) {
      pileElevProps.push(b.addPropertySingleValue('TipLevelNAP', null, ctx.ifcLengthMeasure(pile.puntniveauNAP * 1000), ctx.lengthUnit));
    }
    if (pile.bkPaalPeil != null) {
      pileElevProps.push(b.addPropertySingleValue('CutoffLevel', null, ctx.ifcLengthMeasure(pile.bkPaalPeil), ctx.lengthUnit));
    }
    if (pile.cutoffLevel != null) {
      pileElevProps.push(b.addPropertySingleValue('CutoffLevelNAP', null, ctx.ifcLengthMeasure(pile.cutoffLevel * 1000), ctx.lengthUnit));
    }
    if (pile.tipLevel != null) {
      pileElevProps.push(b.addPropertySingleValue('ActualTipLevelNAP', null, ctx.ifcLengthMeasure(pile.tipLevel * 1000), ctx.lengthUnit));
    }
    if (pileElevProps.length > 0) {
      ctx.assignPropertySet(pileEntityId, pile.id, 'elevpset', 'Open2DStudio_PileElevations', 'Pile elevation data from Open 2D Studio', pileElevProps);
    }

    // Open2DStudio_PileDimensions
    const pileArea = isSquare
      ? pile.diameter * pile.diameter
      : Math.PI * (pile.diameter / 2) * (pile.diameter / 2);
    ctx.assignPropertySet(pileEntityId, pile.id, 'dims', 'Open2DStudio_PileDimensions', 'Pile dimensions from Open 2D Studio', [
      b.addPropertySingleValue('Diameter', null, ctx.ifcPositiveLengthMeasure(pile.diameter), ctx.lengthUnit),
      b.addPropertySingleValue('Length', null, ctx.ifcPositiveLengthMeasure(pileLength), ctx.lengthUnit),
      b.addPropertySingleValue('CrossSectionalArea', null, ctx.ifcAreaMeasure(pileArea / 1e6), ctx.areaUnit),
    ]);
  });

  // ---------- CPT ----------

  ifcExportRegistry.register('cpt', (shape, ctx) => {
    const cpt = shape as CPTShape;
    const b = ctx.builder;

    const cptDiameter = 36;
    const cptRadius = cptDiameter / 2;
    const cptDepth = cpt.depth ?? 30000;
    const coneHeight = Math.min(cptRadius * 1.732, 100);

    const cptProfile = b.addCircleProfileDef('.AREA.', null, ctx.profilePlacement2D, cptRadius);
    const downDir = b.addDirection(0, 0, -1);
    const cptRodSolid = b.addExtrudedAreaSolid(cptProfile, ctx.identityPlacement, downDir, cptDepth);

    const cptBodyRep = b.addShapeRepresentation(ctx.bodySubContext, 'Body', 'SweptSolid', [cptRodSolid]);
    const cptProdShape = b.addProductDefinitionShape(null, null, [cptBodyRep]);

    const cptPlacePt = b.addCartesianPoint(cpt.position.x, cpt.position.y, 0);
    const cptAxisPlace = b.addAxis2Placement3D(cptPlacePt, ctx.zDir, ctx.xDir);
    const cptPlacement = b.addLocalPlacement(ctx.defaultStoreyPlacement, cptAxisPlace);

    const cptEntityId = b.addBuildingElementProxy(
      ctx.shapeToIfcGuid(cpt.id), ctx.ownerHistoryId,
      cpt.name || 'CPT', 'Cone Penetration Test (Sondering)',
      cptPlacement, cptProdShape
    );
    ctx.addElementToStorey(cptEntityId, ctx.resolveStoreyForShape(cpt));

    const cptMatId = ctx.materials.getOrCreate('steel');
    ctx.materialAssociations.push({ elementIds: [cptEntityId], materialId: cptMatId });

    ctx.assignPropertySet(cptEntityId, cpt.id, 'proxy-pset', 'Pset_BuildingElementProxyCommon', 'Common proxy properties', [
      b.addPropertySingleValue('Reference', null, ctx.ifcIdentifier(cpt.name || 'CPT'), null),
    ]);

    const cptProps: number[] = [
      b.addPropertySingleValue('ShapeType', null, ctx.ifcLabel('cpt'), null),
      b.addPropertySingleValue('Name', null, ctx.ifcLabel(cpt.name || ''), null),
      b.addPropertySingleValue('ObjectType', null, ctx.ifcLabel('IfcBorehole'), null),
      b.addPropertySingleValue('Depth', null, ctx.ifcPositiveLengthMeasure(cptDepth), ctx.lengthUnit),
      b.addPropertySingleValue('ConeDiameter', null, ctx.ifcPositiveLengthMeasure(cptDiameter), ctx.lengthUnit),
      b.addPropertySingleValue('ConeHeight', null, ctx.ifcPositiveLengthMeasure(coneHeight), ctx.lengthUnit),
      b.addPropertySingleValue('Kleefmeting', null, ctx.ifcBoolean(cpt.kleefmeting ?? false), null),
      b.addPropertySingleValue('Waterspanning', null, ctx.ifcBoolean(cpt.waterspanning ?? false), null),
      b.addPropertySingleValue('Uitgevoerd', null, ctx.ifcBoolean(cpt.uitgevoerd ?? false), null),
    ];
    ctx.assignPropertySet(cptEntityId, cpt.id, 'pset', 'Open2DStudio_CPT', 'CPT geotechnical properties from Open 2D Studio', cptProps);
  });

  // ---------- Gridline ----------

  ifcExportRegistry.register('gridline', (shape, ctx) => {
    const gridline = shape as GridlineShape;
    const b = ctx.builder;
    if (!ctx.isShapeInPlanDrawing(gridline)) return;

    if (gridline.projectGridId) {
      if (ctx.exportedProjectGridIds.has(gridline.projectGridId)) return;
      ctx.exportedProjectGridIds.add(gridline.projectGridId);
    }

    const startPt = b.addCartesianPoint(gridline.start.x, gridline.start.y, 0);
    const endPt = b.addCartesianPoint(gridline.end.x, gridline.end.y, 0);
    const axisCurve = b.addPolyline([startPt, endPt]);
    const axisId = b.addGridAxis(gridline.label, axisCurve, true);
    ctx.gridlineAxes.push({ axis: axisId, curve: axisCurve, shape: gridline });
  });

  // ---------- Level ----------

  ifcExportRegistry.register('level', (shape, ctx) => {
    const level = shape as LevelShape;
    const b = ctx.builder;
    if (!ctx.isShapeInPlanDrawing(level)) return;

    const levelAnnotPt = b.addCartesianPoint(level.start.x, level.start.y, 0);
    const levelAnnotAxis = b.addAxis2Placement3D(levelAnnotPt, ctx.zDir, ctx.xDir);
    const levelAnnotPlacement = b.addLocalPlacement(ctx.defaultStoreyPlacement, levelAnnotAxis);

    const lvlStartPt = b.addCartesianPoint(level.start.x, level.start.y, 0);
    const lvlEndPt = b.addCartesianPoint(level.end.x, level.end.y, 0);
    const lvlPolyline = b.addPolyline([lvlStartPt, lvlEndPt]);
    const lvlShapeRep = b.addShapeRepresentation(ctx.axisSubContext, 'Annotation', 'Curve2D', [lvlPolyline]);
    const lvlProdShape = b.addProductDefinitionShape(null, null, [lvlShapeRep]);

    const lvlAnnotId = b.addAnnotation(
      ctx.shapeToIfcGuid(level.id, 'annot'), ctx.ownerHistoryId,
      level.label || `Level ${level.elevation}`,
      `Elevation: ${level.elevation}mm`,
      levelAnnotPlacement, lvlProdShape
    );
    ctx.addElementToStorey(lvlAnnotId, ctx.resolveStoreyForShape(level));

    const lvlAnnotProps: number[] = [
      b.addPropertySingleValue('ShapeType', null, ctx.ifcLabel('level'), null),
      b.addPropertySingleValue('Elevation', null, ctx.ifcLengthMeasure(level.elevation), ctx.lengthUnit),
      b.addPropertySingleValue('Label', null, ctx.ifcLabel(level.label || ''), null),
    ];
    if (level.description) {
      lvlAnnotProps.push(b.addPropertySingleValue('Description', null, ctx.ifcLabel(level.description), null));
    }
    ctx.assignPropertySet(lvlAnnotId, level.id, 'annot-pset', 'Open2DStudio_Annotation', 'Level annotation properties', lvlAnnotProps);
  });

  // ---------- Puntniveau ----------

  ifcExportRegistry.register('puntniveau', (shape, ctx) => {
    const pnv = shape as PuntniveauShape;
    const b = ctx.builder;
    if (pnv.points.length < 3) return;

    const pnvProfilePts: number[] = [];
    for (const pt of pnv.points) {
      pnvProfilePts.push(b.addCartesianPoint2D(pt.x, pt.y));
    }
    pnvProfilePts.push(b.addCartesianPoint2D(pnv.points[0].x, pnv.points[0].y));
    const pnvPolyline = b.addPolyline(pnvProfilePts);
    const pnvProfile = b.addArbitraryClosedProfileDef('.AREA.', null, pnvPolyline);

    const pnvThickness = 10;
    const pnvSolid = b.addExtrudedAreaSolid(pnvProfile, ctx.identityPlacement, ctx.extrusionDir, pnvThickness);
    const pnvBodyRep = b.addShapeRepresentation(ctx.bodySubContext, 'Body', 'SweptSolid', [pnvSolid]);
    const pnvProdShape = b.addProductDefinitionShape(null, null, [pnvBodyRep]);

    const pnvElevationMm = pnv.puntniveauNAP * 1000;
    const pnvPlacePt = b.addCartesianPoint(0, 0, pnvElevationMm);
    const pnvAxisPlace = b.addAxis2Placement3D(pnvPlacePt, ctx.zDir, ctx.xDir);
    const pnvPlacement = b.addLocalPlacement(ctx.defaultStoreyPlacement, pnvAxisPlace);

    const pnvName = `Puntniveau ${pnv.puntniveauNAP} m NAP`;
    const pnvEntityId = b.addBuildingElementProxy(
      ctx.shapeToIfcGuid(pnv.id), ctx.ownerHistoryId, pnvName,
      'Designed pile tip level zone', pnvPlacement, pnvProdShape,
      'USERDEFINED'
    );
    ctx.addElementToStorey(pnvEntityId, ctx.resolveStoreyForShape(pnv));

    let pnvArea = 0;
    const pnvPts = pnv.points;
    for (let i = 0; i < pnvPts.length; i++) {
      const j = (i + 1) % pnvPts.length;
      pnvArea += pnvPts[i].x * pnvPts[j].y;
      pnvArea -= pnvPts[j].x * pnvPts[i].y;
    }
    pnvArea = Math.abs(pnvArea) / 2;

    ctx.assignPropertySet(pnvEntityId, pnv.id, 'pset', 'Open2DStudio_Puntniveau', 'Puntniveau properties from Open 2D Studio', [
      b.addPropertySingleValue('ShapeType', null, ctx.ifcLabel('puntniveau'), null),
      b.addPropertySingleValue('PuntniveauNAP', null, ctx.ifcLengthMeasure(pnv.puntniveauNAP * 1000), ctx.lengthUnit),
      b.addPropertySingleValue('PuntniveauNAP_m', null, ctx.ifcLabel(`${pnv.puntniveauNAP} m NAP`), null),
      b.addPropertySingleValue('Area', null, ctx.ifcAreaMeasure(pnvArea / 1e6), ctx.areaUnit),
    ]);
  });

  // ---------- Section Callout ----------

  ifcExportRegistry.register('section-callout', (shape, ctx) => {
    const sc = shape as SectionCalloutShape;
    const b = ctx.builder;

    const scStartPt = b.addCartesianPoint(sc.start.x, sc.start.y, 0);
    const scEndPt = b.addCartesianPoint(sc.end.x, sc.end.y, 0);
    const scPolyline = b.addPolyline([scStartPt, scEndPt]);

    const projCtx = { builder: b, ownerHistoryId: ctx.ownerHistoryId, axisSubContext: ctx.axisSubContext, zDir: ctx.zDir, xDir: ctx.xDir } as any;
    const { annotationId } = createCurveAnnotation(
      projCtx, ctx.shapeToIfcGuid(sc.id),
      `Section ${sc.label}`, `${sc.calloutType} callout`,
      [scPolyline], ctx.defaultStoreyPlacement
    );
    ctx.addElementToStorey(annotationId, ctx.resolveStoreyForShape(sc));

    const scProps: number[] = [];
    if (ctx.isShapeInSectionDrawing(sc)) {
      scProps.push(b.addPropertySingleValue('DrawingType', null, ctx.ifcLabel('section'), null));
    }
    scProps.push(b.addPropertySingleValue('ShapeType', null, ctx.ifcLabel('section-callout'), null));
    scProps.push(b.addPropertySingleValue('CalloutType', null, ctx.ifcLabel(sc.calloutType), null));
    scProps.push(b.addPropertySingleValue('Label', null, ctx.ifcLabel(sc.label), null));
    if (sc.targetDrawingId) {
      scProps.push(b.addPropertySingleValue('TargetDrawingId', null, ctx.ifcLabel(sc.targetDrawingId), null));
    }
    ctx.assignPropertySet(annotationId, sc.id, 'pset', 'Open2DStudio_Annotation', 'Section callout annotation properties', scProps);
  });

  // ---------- Space ----------

  ifcExportRegistry.register('space', (shape, ctx) => {
    const space = shape as SpaceShape;
    const b = ctx.builder;
    if (!space.contourPoints || space.contourPoints.length < 3) return;

    const contourPtIds = space.contourPoints.map(p =>
      b.addCartesianPoint2D(p.x, p.y)
    );
    contourPtIds.push(contourPtIds[0]);
    const contourPolyline = b.addPolyline(contourPtIds);

    const spaceFootprintRep = b.addShapeRepresentation(ctx.axisSubContext, 'FootPrint', 'Curve2D', [contourPolyline]);
    const spaceProdShape = b.addProductDefinitionShape(null, null, [spaceFootprintRep]);

    const spacePlacePt = b.addCartesianPoint(0, 0, 0);
    const spaceAxisPlace = b.addAxis2Placement3D(spacePlacePt, ctx.zDir, ctx.xDir);
    const spacePlacement = b.addLocalPlacement(ctx.defaultStoreyPlacement, spaceAxisPlace);

    const spaceName = space.number
      ? `${space.number} - ${space.name}`
      : space.name;

    const spaceEntityId = b.addSpace(
      ctx.shapeToIfcGuid(space.id), ctx.ownerHistoryId, spaceName,
      null, spacePlacement, spaceProdShape,
      space.name, '.ELEMENT.', '.INTERNAL.'
    );
    ctx.addElementToStorey(spaceEntityId, ctx.resolveStoreyForShape(space));

    // Pset_SpaceCommon
    const spaceProps: number[] = [];
    if (space.area !== undefined) {
      spaceProps.push(b.addPropertySingleValue('GrossFloorArea', null, ctx.ifcAreaMeasure(space.area), null));
      spaceProps.push(b.addPropertySingleValue('NetFloorArea', null, ctx.ifcAreaMeasure(space.area), null));
    }
    if (space.number) {
      spaceProps.push(b.addPropertySingleValue('Reference', null, ctx.ifcIdentifier(space.number), null));
    }
    if (space.level) {
      spaceProps.push(b.addPropertySingleValue('Level', null, ctx.ifcLabel(space.level), null));
    }
    spaceProps.push(b.addPropertySingleValue('IsExternal', null, ctx.ifcBoolean(false), null));
    if (spaceProps.length > 0) {
      ctx.assignPropertySet(spaceEntityId, space.id, 'pset', 'Pset_SpaceCommon', 'Common space properties', spaceProps);
    }

    // Open2DStudio custom property set
    const ndProps: number[] = [
      b.addPropertySingleValue('ShapeType', null, ctx.ifcLabel('space'), null),
      b.addPropertySingleValue('SpaceName', null, ctx.ifcLabel(space.name), null),
    ];
    if (space.number) {
      ndProps.push(b.addPropertySingleValue('SpaceNumber', null, ctx.ifcLabel(space.number), null));
    }
    ctx.assignPropertySet(spaceEntityId, space.id, 'ndpset', 'Open2DStudio_Space', 'Space annotation properties', ndProps);
  });
}

export function unregisterIfcExport(): void {
  for (const type of IFC_TYPES) {
    ifcExportRegistry.unregister(type);
  }
}
