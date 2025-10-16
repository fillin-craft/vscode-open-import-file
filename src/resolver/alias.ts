import * as vscode from 'vscode';
import path from 'path';

type PathsMap = Record<string, string[]>;

type CacheEntry = {
  workspaceRoot: string;
  tsconfigPaths?: PathsMap;
  baseUrl?: string;
  webpackAliases?: Record<string, string>;
  timestamp: number; // For cache invalidation
};

const cache: Record<string, CacheEntry> = {};
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache TTL

/**
 * Load and parse tsconfig.json using VSCode's workspace.fs API
 * Async operation for non-blocking file I/O
 */
async function loadTsconfig(workspaceRoot: string) {
  try {
    const tsconfigUri = vscode.Uri.file(path.join(workspaceRoot, 'tsconfig.json'));
    try {
      // Use vscode.workspace.fs for async file operations
      const data = await vscode.workspace.fs.readFile(tsconfigUri);
      const raw = new TextDecoder().decode(data);
      const cfg = JSON.parse(raw);
      const comp = cfg.compilerOptions || {};
      const baseUrl = comp.baseUrl ? path.resolve(workspaceRoot, comp.baseUrl) : undefined;
      const paths: PathsMap | undefined = comp.paths;
      return { baseUrl, paths };
    } catch (e) {
      // File doesn't exist or can't be read - graceful fallback
      return {};
    }
  } catch (e) {
    return {};
  }
}

/**
 * Load and parse webpack.config.js using VSCode's workspace.fs API
 * Uses vscode.workspace.getTextDocument() for better integration with workspace
 */
async function loadWebpackAliases(workspaceRoot: string) {
  try {
    const webpackUri = vscode.Uri.file(path.join(workspaceRoot, 'webpack.config.js'));
    try {
      // Try to get from open text documents first (cache in editor)
      const doc = await vscode.workspace.openTextDocument(webpackUri);
      const text = doc.getText();
      
      // Try to find a literal `alias: { ... }` block. This will not execute code but can
      // parse common static configs. It won't handle complex dynamic configs.
      const aliasMatch = text.match(/resolve\s*:\s*\{[\s\S]*?alias\s*:\s*(\{[\s\S]*?\})[\s\S]*?\}/m);
      if (!aliasMatch) {return undefined;}
      const aliasLiteral = aliasMatch[1];
      // Replace possible trailing commas and convert single quotes to double quotes to make JSON-ish
      const jsonLike = aliasLiteral
        .replace(/(['`])(?:(?!\1)[\\s\\S])*?\1/g, (m) => m.replace(/'/g, '"'))
        .replace(/([\w\-]+)\s*:/g, '"$1":')
        .replace(/,\s*}/g, '}')
        .replace(/,\s*\]/g, ']');
      try {
        const parsed = JSON.parse(jsonLike);
        const normalized: Record<string, string> = {};
        Object.entries(parsed).forEach(([k, v]) => {
          const p = typeof v === 'string' ? v : String(v);
          normalized[k] = path.isAbsolute(p) ? p : path.resolve(workspaceRoot, p);
        });
        return normalized;
      } catch (e) {
        return undefined;
      }
    } catch (e) {
      // File doesn't exist or can't be read - graceful fallback
      return undefined;
    }
  } catch (e) {
    return undefined;
  }
}

/**
 * Load aliases for a workspace root with cache invalidation via TTL
 * Async function to support non-blocking file I/O
 */
export async function loadAliasesForRoot(workspaceRoot: string) {
  const now = Date.now();
  // Check cache validity
  if (cache[workspaceRoot] && (now - cache[workspaceRoot].timestamp) < CACHE_TTL) {
    return cache[workspaceRoot];
  }
  
  const ts = await loadTsconfig(workspaceRoot);
  const wp = await loadWebpackAliases(workspaceRoot);
  const entry: CacheEntry = {
    workspaceRoot,
    tsconfigPaths: ts.paths,
    baseUrl: ts.baseUrl,
    webpackAliases: wp,
    timestamp: now,
  };
  cache[workspaceRoot] = entry;
  return entry;
}

/**
 * Resolve alias spec to candidate absolute file paths (not URIs)
 * Now async to support non-blocking VSCode workspace.fs operations
 */
export async function resolveAliasToFiles(spec: string, resource?: vscode.Uri): Promise<string[]> {
  // determine workspace root from resource if provided
  let workspaceRoot: string;
  if (resource) {
    const folder = vscode.workspace.getWorkspaceFolder(resource);
    workspaceRoot = folder ? folder.uri.fsPath : (vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd());
  } else {
    workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();
  }
  const c = await loadAliasesForRoot(workspaceRoot);
  const results: string[] = [];
  // Helper: escape regex special chars except '*' so we can replace '*' with a capture group
  const escapeExceptStar = (s: string) => s.replace(/[-\\^$+?.()|[\]\/{}()]/g, '\\$&');

  // 1) webpack aliases: prefer longer alias keys first so more specific mappings win
  if (c.webpackAliases) {
    const entries = Object.entries(c.webpackAliases).sort((a, b) => b[0].length - a[0].length);
    for (const [alias, target] of entries) {
      if (spec === alias || spec.startsWith(alias + '/')) {
        const remainder = spec === alias ? '' : spec.slice(alias.length + 1);
        const candidate = path.join(target, remainder);
        results.push(candidate);
      }
    }
  }

  // 2) tsconfig paths: support simple wildcard matching and prefer longest keys first
  if (c.tsconfigPaths) {
    const entries = Object.entries(c.tsconfigPaths).sort((a, b) => b[0].length - a[0].length);
    for (const [key, vals] of entries) {
      if (key.includes('*')) {
        // build a regex from the key, treating '*' as a capture group
        const pattern = '^' + escapeExceptStar(key).replace(/\*/g, '(.*)') + '$';
        const re = new RegExp(pattern);
        const m = spec.match(re);
        if (m) {
          const wildcard = m[1] || '';
          for (const val of vals as string[]) {
            const replaced = val.replace('*', wildcard);
            const candidate = c.baseUrl ? path.resolve(c.baseUrl, replaced) : path.resolve(workspaceRoot, replaced);
            results.push(candidate);
          }
        }
      } else {
        if (spec === key) {
          for (const val of vals as string[]) {
            const candidate = c.baseUrl ? path.resolve(c.baseUrl, val) : path.resolve(workspaceRoot, val);
            results.push(candidate);
          }
        }
      }
    }
  }

  // normalize to unique absolute paths
  const uniq = Array.from(new Set(results.map(r => path.normalize(r))));
  return uniq;
}
