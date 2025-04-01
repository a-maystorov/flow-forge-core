import { EntityType } from '../models/preview.model';

/**
 * Generate a diff between two entities
 * @param original - Original entity data
 * @param proposed - Proposed entity data
 * @returns Object with added, modified, and removed fields
 */
export interface DiffResult {
  added: Record<string, unknown>;
  modified: Record<string, { from: unknown; to: unknown }>;
  removed: Record<string, unknown>;
}

export function generateDiff(
  original: EntityType,
  proposed: EntityType
): DiffResult {
  // Cast to Record<string, unknown> to allow string indexing
  const originalObj = original as Record<string, unknown>;
  const proposedObj = proposed as Record<string, unknown>;

  const diff: DiffResult = {
    added: {},
    modified: {},
    removed: {},
  };

  // Find added and modified fields
  for (const key in proposedObj) {
    if (key === '_id') continue; // Skip _id field

    if (!(key in originalObj)) {
      diff.added[key] = proposedObj[key];
    } else if (
      JSON.stringify(originalObj[key]) !== JSON.stringify(proposedObj[key])
    ) {
      diff.modified[key] = {
        from: originalObj[key],
        to: proposedObj[key],
      };
    }
  }

  // Find removed fields
  for (const key in originalObj) {
    if (key === '_id') continue; // Skip _id field

    if (!(key in proposedObj)) {
      diff.removed[key] = originalObj[key];
    }
  }

  return diff;
}

/**
 * Create a human-readable representation of a diff
 * @param diff - The diff object
 * @returns String with human-readable diff
 */
export function formatDiffToString(diff: DiffResult): string {
  let result = '';

  // Added fields
  if (Object.keys(diff.added).length > 0) {
    result += 'Added:\n';
    for (const key in diff.added) {
      result += `+ ${key}: ${JSON.stringify(diff.added[key])}\n`;
    }
    result += '\n';
  }

  // Modified fields
  if (Object.keys(diff.modified).length > 0) {
    result += 'Modified:\n';
    for (const key in diff.modified) {
      result += `~ ${key}:\n`;
      result += `  From: ${JSON.stringify(diff.modified[key].from)}\n`;
      result += `  To:   ${JSON.stringify(diff.modified[key].to)}\n`;
    }
    result += '\n';
  }

  // Removed fields
  if (Object.keys(diff.removed).length > 0) {
    result += 'Removed:\n';
    for (const key in diff.removed) {
      result += `- ${key}: ${JSON.stringify(diff.removed[key])}\n`;
    }
  }

  return result;
}

/**
 * Get a simplified summary of changes
 * @param diff - The diff object
 * @returns String with summary of changes
 */
export function getDiffSummary(diff: DiffResult): string {
  const addedCount = Object.keys(diff.added).length;
  const modifiedCount = Object.keys(diff.modified).length;
  const removedCount = Object.keys(diff.removed).length;

  return `${addedCount} added, ${modifiedCount} modified, ${removedCount} removed`;
}
