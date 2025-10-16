import * as vscode from 'vscode';
import path from 'path';
import { resolveAliasToFiles } from './alias';
import { normalizeImportSpec, fileExists, getBaseNameFromSpec } from '../utils';

export const DEBUG = Boolean(process.env.OPEN_IMPORT_FILE_DEBUG);

/**
 * Find all files matching the base path with any extension.
 * Returns the first file found that exists, prioritizing common extensions first,
 * then falling back to any matching file.
 */
async function findFileByBaseName(basePath: string): Promise<vscode.Uri | undefined> {
  // First, try common JavaScript/TypeScript extensions for performance
  const commonExtensions = ['', '.ts', '.js', '.tsx', '.jsx', '.json'];
  for (const ext of commonExtensions) {
    const candidate = vscode.Uri.file(basePath + ext);
    if (await fileExists(candidate)) {
      return candidate;
    }
  }

  // If not found, try to find any file with the same base name by checking the directory
  try {
    const dir = path.dirname(basePath);
    const fileName = path.basename(basePath);
    const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(dir));
    
    // Filter entries that start with the base filename (e.g., "file.mp3", "file.png")
    for (const [name, type] of entries) {
      // Skip directories
      if (type === vscode.FileType.Directory) {
        continue;
      }
      // Check if filename starts with the base name
      if (name.startsWith(fileName)) {
        const candidate = vscode.Uri.file(path.join(dir, name));
        if (await fileExists(candidate)) {
          return candidate;
        }
      }
    }
  } catch (e) {
    // Directory doesn't exist or can't be read, ignore
  }

  return undefined;
}

export async function findFileForImport(spec: string, documentUri?: vscode.Uri): Promise<vscode.Uri | undefined> {
  try {
    if (!spec) {return undefined;}
    try { if (DEBUG) {console.debug('[findFileForImport] spec=', spec, 'documentUri=', documentUri?.toString());} } catch {}

    // Normalize import spec
    spec = normalizeImportSpec(spec);

    // 1) relative imports - use dynamic extension search
    if (spec.startsWith('.')) {
      if (!documentUri) {return undefined;}
      const docDir = path.dirname(documentUri.fsPath);
      const base = path.join(docDir, spec);
      const found = await findFileByBaseName(base);
      try { if (DEBUG && found) {console.debug('[findFileForImport] found relative import', found.toString());} } catch {}
      return found;
    }

    // 2) alias resolution - use dynamic extension search for each candidate
    const aliasCandidates = await resolveAliasToFiles(spec, documentUri);
    try { if (DEBUG) {console.debug('[findFileForImport] aliasCandidates=', aliasCandidates);} } catch {}
    if (aliasCandidates && aliasCandidates.length > 0) {
      for (const base of aliasCandidates) {
        const found = await findFileByBaseName(base);
        if (found) {
          try { if (DEBUG) {console.debug('[findFileForImport] found alias candidate', found.toString());} } catch {}
          return found;
        }
      }
    }

    // 3) workspace search by basename
    const baseName = getBaseNameFromSpec(spec);
    const results = await vscode.workspace.findFiles(`**/${baseName}*`, '**/node_modules/**', 10);
    try { if (DEBUG) {console.debug('[findFileForImport] workspace.findFiles results=', results.map(r => r.toString()));} } catch {}
    if (results && results.length > 0) {return results[0];}

    // 4) if nothing found and spec doesn't start with '.', treat as package import
    if (!spec.startsWith('.')) {
      try { if (DEBUG) {console.debug('[findFileForImport] treating as package import, skipping');} } catch {}
      return undefined;
    }

    return undefined;
  } catch (e) {
    return undefined;
  }
}
