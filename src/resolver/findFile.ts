import * as vscode from 'vscode';
import path from 'path';
import { resolveAliasToFiles } from './alias';

const exts = [
  '',
  '.ts',
  '.js',
  '.tsx',
  '.jsx',
  '.json',
  // image / asset extensions
  '.png',
  '.jpg',
  '.jpeg',
  '.svg',
  '.webp',
  '.gif',
  '.bmp',
  '.ico',
  '/index.ts',
  '/index.js',
  '/index.png',
  '/index.jpg',
  '/index.svg',
];

async function statIfExists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch (e) {
    return false;
  }
}

export const DEBUG = Boolean(process.env.OPEN_IMPORT_FILE_DEBUG);

export async function findFileForImport(spec: string, documentUri?: vscode.Uri): Promise<vscode.Uri | undefined> {
  try {
    if (!spec) return undefined;
    try { if (DEBUG) console.debug('[findFileForImport] spec=', spec, 'documentUri=', documentUri?.toString()); } catch {}

    try {
      if ((spec.startsWith('"') && spec.endsWith('"')) || (spec.startsWith("'") && spec.endsWith("'"))) {
        spec = spec.slice(1, -1);
      }
    } catch {}

    // 1) relative imports
    if (spec.startsWith('.')) {
      if (!documentUri) return undefined;
      const docDir = path.dirname(documentUri.fsPath);
      const base = path.join(docDir, spec);
      for (const e of exts) {
        const candidate = vscode.Uri.file(base + e);
        if (await statIfExists(candidate)) return candidate;
      }
      return undefined;
    }

    // 2) alias resolution
    const aliasCandidates = await resolveAliasToFiles(spec, documentUri);
    try { if (DEBUG) console.debug('[findFileForImport] aliasCandidates=', aliasCandidates); } catch {}
    if (aliasCandidates && aliasCandidates.length > 0) {
      for (const base of aliasCandidates) {
        for (const e of exts) {
          const candidate = vscode.Uri.file(base + e);
          try { if (DEBUG) console.debug('[findFileForImport] testing candidate', candidate.toString()); } catch {}
          if (await statIfExists(candidate)) {
            try { if (DEBUG) console.debug('[findFileForImport] found candidate', candidate.toString()); } catch {}
            return candidate;
          }
        }
      }
    }

    // 3) workspace search by basename
    const baseName = spec.split('/').pop() || spec;
    const results = await vscode.workspace.findFiles(`**/${baseName}*`, '**/node_modules/**', 10);
    try { if (DEBUG) console.debug('[findFileForImport] workspace.findFiles results=', results.map(r => r.toString())); } catch {}
    if (results && results.length > 0) return results[0];

    // 4) if nothing found and spec doesn't start with '.', treat as package import
    if (!spec.startsWith('.')) {
      try { if (DEBUG) console.debug('[findFileForImport] treating as package import, skipping'); } catch {}
      return undefined;
    }

    return undefined;
  } catch (e) {
    return undefined;
  }
}
