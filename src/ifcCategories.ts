import { ifcCategoryRegistry } from 'open-2d-studio';

const CATEGORY_TYPES = [
  'wall', 'wall-opening', 'beam', 'slab', 'pile', 'cpt', 'puntniveau',
  'gridline', 'level', 'space', 'plate-system', 'rebar',
] as const;

export function registerIfcCategories(): void {
  ifcCategoryRegistry.register('wall', 'IfcWall');
  ifcCategoryRegistry.register('wall-opening', 'IfcOpeningElement');
  ifcCategoryRegistry.register('beam', (shape) =>
    (shape as any).viewMode === 'section' ? 'IfcColumn' : 'IfcBeam'
  );
  ifcCategoryRegistry.register('slab', 'IfcSlab');
  ifcCategoryRegistry.register('pile', 'IfcPile');
  ifcCategoryRegistry.register('cpt', 'IfcBuildingElementProxy');
  ifcCategoryRegistry.register('puntniveau', 'IfcBuildingElementProxy');
  ifcCategoryRegistry.register('gridline', 'IfcGrid');
  ifcCategoryRegistry.register('level', 'IfcBuildingStorey');
  ifcCategoryRegistry.register('space', 'IfcSpace');
  ifcCategoryRegistry.register('plate-system', 'IfcPlateSystem');
  ifcCategoryRegistry.register('rebar', 'IfcReinforcingBar');
}

export function unregisterIfcCategories(): void {
  for (const type of CATEGORY_TYPES) {
    ifcCategoryRegistry.unregister(type);
  }
}
