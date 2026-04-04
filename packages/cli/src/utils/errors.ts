/**
 * Shared error formatting for consistent error messages across commands.
 */
export function formatError(err: unknown): string {
  if (err instanceof Error) {
    if (err.message.includes("Bad credentials")) {
      return "Authentication failed. Your GitHub token may be expired or invalid.\n  Run `docsync init` to reconfigure.";
    }
    if (err.message.includes("Not Found")) {
      return "Repository not found. Check that the repo exists and your token has access.\n  Run `docsync init` to reconfigure.";
    }
    if (
      err.message.includes("ENOTFOUND") ||
      err.message.includes("ECONNREFUSED")
    ) {
      return "Network error. Please check your internet connection.";
    }
    if (err.message.includes("rate limit")) {
      return "GitHub API rate limit exceeded. Please wait a few minutes and try again.";
    }
    return err.message;
  }
  return "An unexpected error occurred.";
}
