import * as vscode from 'vscode';

/**
 * Import spec normalization.
 * Removes surrounding quotes if present.
 */
export function normalizeImportSpec(spec: string): string {
  try {
    if ((spec.startsWith('"') && spec.endsWith('"')) || (spec.startsWith("'") && spec.endsWith("'"))) {
      return spec.slice(1, -1);
    }
  } catch {
    // ignore
  }
  return spec;
}

/**
 * Normalize a value to vscode.Uri or undefined.
 * Handles multiple input formats (Uri, string, encoded URI).
 */
export function normalizeToUri(arg: any): vscode.Uri | undefined {
  try {
    if (!arg) {return undefined;}
    if (arg instanceof vscode.Uri) {return arg;}
    if (typeof arg === 'string') {
      let s = arg;
      // If it's JSON quoted, try to strip
      try {
        if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
          s = s.slice(1, -1);
        }
      } catch {
        // ignore
      }

      // Try repeated decodeURIComponent to handle double-encoding
      for (let i = 0; i < 3; i++) {
        try {
          const parsed = vscode.Uri.parse(s);
          if (parsed && parsed.scheme) {return parsed;}
        } catch (e) {
          // ignore
        }
        try {
          s = decodeURIComponent(s);
        } catch (e) {
          break;
        }
      }

      // If looks like an absolute path, use file URI
      if (s.startsWith('/') || /^[A-Za-z]:\\/.test(s)) {
        return vscode.Uri.file(s);
      }

      // As last resort try parse
      try {
        return vscode.Uri.parse(s);
      } catch (e) {
        return undefined;
      }
    }
  } catch (e) {
    return undefined;
  }
  return undefined;
}

/**
 * Check if file exists at the given URI.
 * Returns true if file exists, false otherwise.
 */
export async function fileExists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Error handler for user-facing error messages.
 * Shows a VS Code error notification.
 */
export function showErrorMessage(message: string): void {
  vscode.window.showErrorMessage(`Open Import File: ${message}`);
}

/**
 * Extract base filename from import spec.
 * E.g., '@/utils/helpers' -> 'helpers', './file' -> 'file'
 */
export function getBaseNameFromSpec(spec: string): string {
  return spec.split('/').pop() || spec;
}
