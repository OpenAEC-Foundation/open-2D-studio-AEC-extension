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

/** groupId prefix used for storey-linked section reference levels. */
const SECTION_REF_STOREY_GROUP_PREFIX = 'section-ref:storey-';

/**
 * Extract the storey ID linked to a level shape.
 * Checks the shape ID prefix first (for auto-generated section-ref levels),
 * then the groupId (for levels that were pasted/drawn and later linked).
 */
function getLinkedStoreyId(lv: LevelShape): string | null {
  // Auto-generated levels: id = "section-ref-lv-{storeyId}"
  if (lv.id.startsWith(SECTION_REF_LV_PREFIX)) {
    return lv.id.slice(SECTION_REF_LV_PREFIX.length);
  }
  // Pasted/drawn levels that were linked: groupId = "section-ref:storey-{storeyId}"
  if (lv.groupId?.startsWith(SECTION_REF_STOREY_GROUP_PREFIX)) {
    return lv.groupId.slice(SECTION_REF_STOREY_GROUP_PREFIX.length);
  }
  return null;
}

/**
 * Find the first building ID in the project structure.
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
// Snapshot helpers for change detection
// ============================================================================

function buildLevelFingerprint(shapes: any[]): string {
  return shapes
    .filter((s: any) => s.type === 'level')
    .map((s: any) =>
      `${s.id}:${s.drawingId}:${s.elevation ?? ''}:${s.peil ?? ''}:${s.description ?? ''}:${s.start?.y ?? ''}:${s.groupId ?? ''}`
    )
    .sort()
    .join('|');
}

// ============================================================================
// Automation hook
// ============================================================================

export function useLevelStoreySync(): void {
  const prevFingerprintRef = useRef<string>('');
  const prevLevelIdsRef = useRef<Set<string>>(new Set());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Initialise previous state
    const initial = useAppStore.getState();
    prevFingerprintRef.current = buildLevelFingerprint(initial.shapes);
    prevLevelIdsRef.current = new Set(
      initial.shapes.filter((s: any) => s.type === 'level').map((s: any) => s.id)
    );

    const unsubscribe = useAppStore.subscribe((state, prevState) => {
      // Only react when shapes change
      if (state.shapes === prevState.shapes) return;

      const fingerprint = buildLevelFingerprint(state.shapes);
      if (fingerprint === prevFingerprintRef.current) return;
      prevFingerprintRef.current = fingerprint;

      // Capture the previous ID set before updating
      const capturedPrevIds = new Set(prevLevelIdsRef.current);
      prevLevelIdsRef.current = new Set(
        state.shapes.filter((s: any) => s.type === 'level').map((s: any) => s.id)
      );

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

  // Determine which drawings are section drawings
  const sectionDrawingIds = new Set(
    drawings.filter((d: any) => d.drawingType === 'section').map((d: any) => d.id)
  );

  // Get all level shapes in section drawings
  const sectionLevels = shapes.filter(
    (s: any) => s.type === 'level' && sectionDrawingIds.has(s.drawingId)
  ) as LevelShape[];

  for (const lv of sectionLevels) {
    const elevation = lv.elevation ?? lv.peil ?? Math.round(-lv.start.y);
    const linkedStoreyId = getLinkedStoreyId(lv);

    // --- Case 1: Level is already linked to a storey → sync property changes ---
    if (linkedStoreyId) {
      const existing = storeyMap.get(linkedStoreyId);
      if (!existing) continue;

      const elevChanged = Math.abs(existing.elevation - elevation) >= 1;
      const nameChanged = lv.description != null && lv.description !== '' && lv.description !== existing.name;

      if (elevChanged || nameChanged) {
        const updates: Record<string, any> = {};
        if (elevChanged) updates.elevation = elevation;
        if (nameChanged) updates.name = lv.description!;
        updateStorey(existing.buildingId, linkedStoreyId, updates);
      }
      continue;
    }

    // --- Case 2: New unlinked level shape in a section drawing ---
    // Only process shapes that were not present in the previous snapshot
    if (prevLevelIds.has(lv.id)) continue;

    // Skip if a storey already exists at this elevation
    if (storeyExistsAtElevation(elevation)) continue;

    // Need at least one building to attach the storey to
    const buildingId = getFirstBuildingId();
    if (!buildingId) continue;

    // Create a new storey in the project structure
    const newStoreyId = generateId();
    const storeyName = lv.description || `Level ${elevation >= 0 ? '+' : ''}${elevation}`;

    addStorey(buildingId, {
      id: newStoreyId,
      name: storeyName,
      elevation,
    });

    // Link the level shape to the new storey via its groupId.
    // This enables future property edits on this shape to propagate
    // to the storey through the sync logic above (Case 1).
    updateShape(lv.id, {
      groupId: `${SECTION_REF_STOREY_GROUP_PREFIX}${newStoreyId}`,
    } as any);
  }
}
