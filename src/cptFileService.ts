/**
 * CPT File Service — re-exports from the host app's CPT parser module.
 *
 * The actual parsing logic (GEF and BRO-XML) and file dialog live in the
 * host app; this module simply re-exports them for convenience within the
 * AEC extension.
 */

export {
  parseGEF,
  parseBROXML,
  parseCPTFile,
  showCPTFileDialog,
} from 'open-2d-studio';

export type { CPTFileData } from 'open-2d-studio';
