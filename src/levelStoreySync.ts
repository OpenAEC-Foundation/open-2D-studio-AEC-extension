/**
 * Level–Storey Synchronisation
 *
 * Creates a two-way binding between LevelShape objects in section drawings
 * and ProjectStorey entries in the project structure.
 *
 * 1. When a level shape is copied/pasted or drawn inside a section drawing,
 *    a matching storey is created in the first building of the project
 *    structure (if one doesn't already exist at that elevation).
 *
 * 2. When a section-ref level's elevation is changed (via grip drag or the
 *    properties panel), the corresponding storey's elevation is updated.
 *
 * 3. When a section-ref level's description is changed, the corresponding
 *    storey's name is updated.
 *
 * All logic lives in a single automation hook (useLevelStoreySync) that
 * subscribes to the store and reacts to shape changes.
 */

import { useEffect, useRef } from 'react';
import type { LevelShape } from 'open-2d-studio';
import { generateId, useAppStore } from 'open-2d-studio';

// ============================================================================
// Helpers
// ============================================================================

/** Prefix used for auto-generated section reference level shape IDs. */
const SECTION_REF_LV_PREFIX = 'section-ref-lv-';

/** Extract the storey ID from a section-ref level shape ID.  Returns null for non-ref levels. */
function storeyIdFromRefLevel(shapeId: string): string | null {
  if (!shapeId.startsWith(SECTION_REF_LV_PREFIX)) return null;
  return shapeId.slice(SECTION_REF_LV_PREFIX.length);
}

/**
 * Find the first building ID in the project structure.
 * If no buildings exist, returns null.
 */
function getFirstBuildingId(): string | null {
  const { projectStructure } = useAppStore.getState();
  if (projectStructure.buildings.length === 0) return null;
  return projectStructure.buildings[0].id;
}

/**
 * Check whether a storey with the given elevation already exists (within 1 mm tolerance).
 */
function storeyExistsAtElevation(elevation: number): boolean {
  const { projectStructure } = useAppStore.getState();
  for (const building of projectStructure.buildings) {
    for (const storey of building.storeys) {
      if (Math.abs(storey.elevation - elevation) < 1) return true;
    }
  }
  return false;
}

// ============================================================================
// Snapshot helpers
// ============================================================================

interface LevelSnapshot {
  id: string;
  elevation: number;
  description: string;
  startY: number;
}

function buildLevelSnapshots(shapes: any[]): Map<string, LevelSnapshot> {
  const map = new Map<string, LevelSnapshot>();
  for (const s of shapes) {
    if (s.type !== 'level') continue;
    map.set(s.id, {
      id: s.id,
      elevation: s.elevation ?? s.peil ?? Math.round(-(s.start?.y ?? 0)),
      description: s.description ?? '',
      startY: s.start?.y ?? 0,
    });
  }
  return map;
}

function snapshotFingerprint(snaps: Map<string, LevelSnapshot>): string {
  return [...snaps.values()]
    .map(s => `${s.id}:${s.elevation}:${s.description}:${s.startY}`)
    .sort()
    .join('|');
}

// ============================================================================
// Automation hook
// ============================================================================

export function useLevelStoreySync(): void {
  const prevFingerprintRef = useRef<string>('');
  const prevIdsRef = useRef<Set<string>>(new Set());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Initialise previous state
    const initial = useAppStore.getState();
    const initialSnaps = buildLevelSnapshots(initial.shapes);
    prevFingerprintRef.current = snapshotFingerprint(initialSnaps);
    prevIdsRef.current = new Set(initialSnaps.keys());

    const unsubscribe = useAppStore.subscribe((state, prevState) => {
      // Only react when shapes change
      if (state.shapes === prevState.shapes) return;

      const currentSnaps = buildLevelSnapshots(state.shapes);
      const fingerprint = snapshotFingerprint(currentSnaps);
      if (fingerprint === prevFingerprintRef.current) return;

      const prevIds = prevFingerprintRef.current; // used for debounce comparison only
      prevFingerprintRef.current = fingerprint;

      // Capture the previous ID set before updating
      const capturedPrevIds = new Set(prevIdsRef.current);
      prevIdsRef.current = new Set(currentSnaps.keys());

      // Debounce to avoid excessive updates during drag operations
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }

      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        syncLevels(capturedPrevIds);
      }, 200);
    });

    return () => {
      unsubscribe();
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);
}

// ============================================================================
// Core sync logic
// ============================================================================

function syncLevels(prevLevelIds: Set<string>): void {
  const state = useAppStore.getState();
  const { shapes, drawings, projectStructure, addStorey, updateStorey, updateShape } = state;

  // Build a map of storeyId -> storey + buildingId for quick lookup
  const storeyMap = new Map<string, { buildingId: string; name: string; elevation: number }>();
  for (const building of projectStructure.buildings) {
    for (const storey of building.storeys) {
      storeyMap.set(storey.id, {
        buildingId: building.id,
        name: storey.name,
        elevation: storey.elevation,
      });
    }
  }

  // Get all level shapes in section drawings
  const sectionDrawingIds = new Set(
    drawings.filter((d: any) => d.drawingType === 'section').map((d: any) => d.id)
  );

  const sectionLevels = shapes.filter(
    (s: any) => s.type === 'level' && sectionDrawingIds.has(s.drawingId)
  ) as LevelShape[];

  for (const lv of sectionLevels) {
    const elevation = lv.elevation ?? lv.peil ?? Math.round(-lv.start.y);

    // --- Case 1: Existing section-ref level → sync properties to storey ---
    const storeyId = storeyIdFromRefLevel(lv.id);
    if (storeyId) {
      const existing = storeyMap.get(storeyId);
      if (!existing) continue;

      const elevChanged = Math.abs(existing.elevation - elevation) >= 1;
      const nameChanged = lv.description != null && lv.description !== '' && lv.description !== existing.name;

      if (elevChanged || nameChanged) {
        const updates: Record<string, any> = {};
        if (elevChanged) updates.elevation = elevation;
        if (nameChanged) updates.name = lv.description!;
        updateStorey(existing.buildingId, storeyId, updates);
      }
      continue;
    }

    // --- Case 2: New level shape in a section drawing (e.g. pasted or drawn) ---
    // Only handle shapes that were not present previously (i.e. newly added)
    if (prevLevelIds.has(lv.id)) continue;

    // Skip if a storey already exists at this elevation
    if (storeyExistsAtElevation(elevation)) continue;

    // Need at least one building
    const buildingId = getFirstBuildingId();
    if (!buildingId) continue;

    // Create a new storey
    const newStoreyId = generateId();
    const storeyName = lv.description || `Level ${elevation >= 0 ? '+' : ''}${elevation}`;

    addStorey(buildingId, {
      id: newStoreyId,
      name: storeyName,
      elevation,
    });

    // Re-tag the level shape as a section-ref level linked to the new storey.
    // This ensures future edits to this shape propagate back to the storey.
    updateShape(lv.id, {
      id: `${SECTION_REF_LV_PREFIX}${newStoreyId}`,
      groupId: `section-ref:storey-${newStoreyId}`,
    } as any);
  }
}
