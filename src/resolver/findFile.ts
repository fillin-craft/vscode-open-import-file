import * as vscode from 'vscode';
import path from 'path';
import { resolveAliasToFiles } from './alias';
import { IMPORT_EXTENSIONS, normalizeImportSpec, fileExists, getBaseNameFromSpec } from '../utils';

export const DEBUG = Boolean(process.env.OPEN_IMPORT_FILE_DEBUG);

/**
 * Try multiple extensions in parallel and return the first one that exists.
 * Much faster than sequential checks, especially on slow filesystems.
 */
async function findFileWithExtensions(base: string, extensions: readonly string[]): Promise<vscode.Uri | undefined> {
  const candidates = extensions.map(e => vscode.Uri.file(base + e));
  
  // Use Promise.race to return as soon as any file exists
  // If all fail, Promise.all on rejections will catch them all
  return Promise.race(
    candidates.map(uri => 
      fileExists(uri).then(exists => exists ? uri : Promise.reject())
    )
  ).catch(() => undefined);
}

export async function findFileForImport(spec: string, documentUri?: vscode.Uri): Promise<vscode.Uri | undefined> {
  try {
    if (!spec) {return undefined;}
    try { if (DEBUG) {console.debug('[findFileForImport] spec=', spec, 'documentUri=', documentUri?.toString());} } catch {}

    // Normalize import spec
    spec = normalizeImportSpec(spec);

    // 1) relative imports - use parallel extension search
    if (spec.startsWith('.')) {
      if (!documentUri) {return undefined;}
      const docDir = path.dirname(documentUri.fsPath);
      const base = path.join(docDir, spec);
      const found = await findFileWithExtensions(base, IMPORT_EXTENSIONS);
      try { if (DEBUG && found) {console.debug('[findFileForImport] found relative import', found.toString());} } catch {}
      return found;
    }

    // 2) alias resolution - use parallel extension search for each candidate
    const aliasCandidates = await resolveAliasToFiles(spec, documentUri);
    try { if (DEBUG) {console.debug('[findFileForImport] aliasCandidates=', aliasCandidates);} } catch {}
    if (aliasCandidates && aliasCandidates.length > 0) {
      for (const base of aliasCandidates) {
        const found = await findFileWithExtensions(base, IMPORT_EXTENSIONS);
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
