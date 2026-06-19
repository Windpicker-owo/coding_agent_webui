/**
 * Path normalization utilities.
 *
 * On Windows, paths may arrive with mixed / and \ separators,
 * which causes the same directory to appear as two different entries.
 * normalizePath ensures consistent representation.
 */

/**
 * Detect if the current platform is Windows based on the path pattern.
 * In a browser context we can't reliably use navigator.platform, so we
 * use a heuristic: if the path starts with a drive letter (e.g. "C:"), 
 * it's Windows.
 */
function isWindowsPath(p: string): boolean {
  return /^[A-Za-z]:[/\\]/.test(p) || /^[A-Za-z]:$/.test(p);
}

/**
 * Normalize a filesystem path for consistent storage and comparison.
 *
 * On Windows-style paths:
 * - Replace all forward slashes (/) with backslashes (\)
 * - Strip trailing separators
 * - Collapse consecutive separators
 *
 * On Unix-style paths:
 * - Collapse consecutive slashes
 * - Strip trailing slashes (unless root "/")
 *
 * Also handles Windows paths that arrive as Unix-style (e.g. "C:/foo/bar").
 */
export function normalizePath(p: string): string {
  if (!p) return p;
  
  let result = p.trim();
  
  // Detect Windows-style path by drive letter pattern
  // This handles both "C:\foo\bar" and "C:/foo/bar"
  if (isWindowsPath(result)) {
    // Replace forward slashes with backslashes
    result = result.replace(/\//g, "\\");
  }
  
  // Collapse consecutive separators (both \ and /)
  result = result.replace(/[\\/]{2,}/g, (match) => {
    // Use backslash for Windows, slash for Unix
    return isWindowsPath(p) ? "\\" : "/";
  });
  
  // Strip trailing separators (but not for root paths like "C:\" or "/")
  if (result.length > 1) {
    result = result.replace(/[\\/]+$/, "");
    // For Windows drive root (e.g. "C:"), ensure trailing backslash
    if (/^[A-Za-z]:$/.test(result)) {
      result = result + "\\";
    }
  }
  
  return result;
}
