/**
 * Conflict resolution utilities for pull operations.
 * Currently, pull always overwrites local files (remote wins).
 * This module is a placeholder for future conflict resolution strategies.
 */

export type ConflictStrategy = "overwrite" | "skip" | "prompt";

export function resolveConflict(
  _localContent: string,
  _remoteContent: string,
  strategy: ConflictStrategy,
): "use-local" | "use-remote" | "skip" {
  switch (strategy) {
    case "overwrite":
      return "use-remote";
    case "skip":
      return "skip";
    case "prompt":
      // For now, default to overwrite
      return "use-remote";
  }
}
