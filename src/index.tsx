/**
 * AEC Extension entry point — runtime plugin for Open 2D Studio.
 *
 * Registers all AEC shape-type handlers on load and unregisters on unload.
 */

import { registerBounds, unregisterBounds } from './bounds';
import { registerSnapSegments, unregisterSnapSegments } from './snapSegments';
import { registerSnapPoints, unregisterSnapPoints } from './snapPoints';
import { registerGripHandlers, unregisterGripHandlers } from './gripHandlers';
import { registerModelBehaviors, unregisterModelBehaviors } from './modelBehaviors';
import { registerHandlePoints, unregisterHandlePoints } from './handlePoints';
import { registerIfcExport, unregisterIfcExport } from './ifcExport';
import { registerKeyboardShortcuts, unregisterKeyboardShortcuts } from './keyboardShortcuts';
import { registerAutomations, unregisterAutomations } from './automations';
import { registerDialogs, unregisterDialogs } from './dialogs';
import { registerRenderers, unregisterRenderers } from './renderers';
import { registerPreviewRenderers, unregisterPreviewRenderers } from './previewRenderers';
import { registerRibbonTabs, unregisterRibbonTabs } from './ribbonTabs';
import { registerIfcCategories, unregisterIfcCategories } from './ifcCategories';
import { registerWallOpeningTool, unregisterWallOpeningTool } from './wallOpeningTool';
import { registerRebarTool, unregisterRebarTool } from './rebarTool';

const aecExtension = {
  onLoad() {
    registerBounds();
    registerSnapSegments();
    registerSnapPoints();
    registerGripHandlers();
    registerModelBehaviors();
    registerHandlePoints();
    registerIfcExport();
    registerKeyboardShortcuts();
    registerAutomations();
    registerDialogs();
    registerRenderers();
    registerPreviewRenderers();
    registerRibbonTabs();
    registerIfcCategories();
    registerWallOpeningTool();
    registerRebarTool();
  },
  onUnload() {
    unregisterRebarTool();
    unregisterWallOpeningTool();
    unregisterIfcCategories();
    unregisterRibbonTabs();
    unregisterPreviewRenderers();
    unregisterRenderers();
    unregisterDialogs();
    unregisterAutomations();
    unregisterKeyboardShortcuts();
    unregisterIfcExport();
    unregisterHandlePoints();
    unregisterModelBehaviors();
    unregisterGripHandlers();
    unregisterSnapPoints();
    unregisterSnapSegments();
    unregisterBounds();
  },
};

// ESM export for dev (direct import from Open 2D Studio)
export default aecExtension;

// CJS export for runtime extension loader
if (typeof module !== 'undefined') {
  module.exports = aecExtension;
}
