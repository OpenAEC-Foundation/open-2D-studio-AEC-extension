import {
  automationRegistry,
  useIfcAutoRegenerate,
  useSpaceAutoUpdate,
  usePileAutoNumbering,
  usePileAutoDimensioning,
  usePileAutoPuntniveau,
} from 'open-2d-studio';

const AUTOMATION_IDS = [
  'ifc-auto-regenerate',
  'space-auto-update',
  'pile-auto-numbering',
  'pile-auto-dimensioning',
  'pile-auto-puntniveau',
] as const;

export function registerAutomations(): void {
  automationRegistry.register({ id: 'ifc-auto-regenerate', useHook: useIfcAutoRegenerate });
  automationRegistry.register({ id: 'space-auto-update', useHook: useSpaceAutoUpdate });
  automationRegistry.register({ id: 'pile-auto-numbering', useHook: usePileAutoNumbering });
  automationRegistry.register({ id: 'pile-auto-dimensioning', useHook: usePileAutoDimensioning });
  automationRegistry.register({ id: 'pile-auto-puntniveau', useHook: usePileAutoPuntniveau });
}

export function unregisterAutomations(): void {
  for (const id of AUTOMATION_IDS) {
    automationRegistry.unregister(id);
  }
}
