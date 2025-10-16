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
 * Find the nearest tsconfig.json by walking up the directory tree from the given file.
 * This supports monorepo setups where packages have their own tsconfig.json files.
 * Falls back to the workspace root's tsconfig.json if no closer one is found.
 */
async function findNearestTsconfig(resourcePath: string, workspaceRootPath: string): Promise<string | undefined> {
  let currentDir = path.dirname(resourcePath);
  
  // Walk up the directory tree looking for tsconfig.json
  while (currentDir.length > 1 && currentDir.startsWith(workspaceRootPath)) {
    const tsconfigPath = path.join(currentDir, 'tsconfig.json');
    try {
      const uri = vscode.Uri.file(tsconfigPath);
      await vscode.workspace.fs.stat(uri);
      return tsconfigPath; // Found it!
    } catch (e) {
      // Not found, continue walking up
    }
    
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      break; // Reached filesystem root
    }
    currentDir = parentDir;
  }
  
  // Not found in any parent directory, check workspace root
  const rootTsconfigPath = path.join(workspaceRootPath, 'tsconfig.json');
  try {
    const uri = vscode.Uri.file(rootTsconfigPath);
    await vscode.workspace.fs.stat(uri);
    return rootTsconfigPath;
  } catch (e) {
    return undefined; // No tsconfig.json found
  }
}

/**
 * Load and parse tsconfig.json using VSCode's workspace.fs API
 * Supports extended configs via `extends` field (basic support for relative paths).
 * Async operation for non-blocking file I/O
 */
async function loadTsconfig(tsconfigPath: string) {
  try {
    const tsconfigUri = vscode.Uri.file(tsconfigPath);
    try {
      // Use vscode.workspace.fs for async file operations
      const data = await vscode.workspace.fs.readFile(tsconfigUri);
      const raw = new TextDecoder().decode(data);
      const cfg = JSON.parse(raw);
      const comp = cfg.compilerOptions || {};
      const tsconfigDir = path.dirname(tsconfigPath);
      const baseUrl = comp.baseUrl ? path.resolve(tsconfigDir, comp.baseUrl) : undefined;
      const paths: PathsMap | undefined = comp.paths;

      // TODO: Support `extends` field to inherit from base tsconfig
      // This would require recursively loading and merging parent configs
      
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
 * Load aliases for a file's context with cache invalidation via TTL.
 * For monorepo setups, finds the nearest tsconfig.json by walking up directories.
 * Async function to support non-blocking file I/O
 */
export async function loadAliasesForRoot(workspaceRoot: string, resourcePath?: string) {
  // Determine the best tsconfig.json to use
  let tsconfigPath: string | undefined;
  
  if (resourcePath) {
    // For monorepo: find the nearest tsconfig.json to the resource file
    tsconfigPath = await findNearestTsconfig(resourcePath, workspaceRoot);
  } else {
    // Fallback: use workspace root's tsconfig.json
    tsconfigPath = path.join(workspaceRoot, 'tsconfig.json');
  }

  // Create a cache key that includes the tsconfig path for monorepo support
  const cacheKey = tsconfigPath || workspaceRoot;
  const now = Date.now();
  
  // Check cache validity
  if (cache[cacheKey] && (now - cache[cacheKey].timestamp) < CACHE_TTL) {
    return cache[cacheKey];
  }
  
  const ts = tsconfigPath ? await loadTsconfig(tsconfigPath) : {};
  const wp = await loadWebpackAliases(workspaceRoot);
  const entry: CacheEntry = {
    workspaceRoot,
    tsconfigPaths: ts.paths,
    baseUrl: ts.baseUrl,
    webpackAliases: wp,
    timestamp: now,
  };
  cache[cacheKey] = entry;
  return entry;
}

/**
 * Resolve alias spec to candidate absolute file paths (not URIs)
 * For monorepo setups, uses the nearest tsconfig.json to the resource file.
 * Now async to support non-blocking VSCode workspace.fs operations
 */
export async function resolveAliasToFiles(spec: string, resource?: vscode.Uri): Promise<string[]> {
  // Determine workspace root and resource path from resource if provided
  let workspaceRoot: string;
  let resourcePath: string | undefined;
  
  if (resource) {
    const folder = vscode.workspace.getWorkspaceFolder(resource);
    workspaceRoot = folder ? folder.uri.fsPath : (vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd());
    resourcePath = resource.fsPath;
  } else {
    workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();
  }
  
  // Load aliases, passing resourcePath for monorepo support
  const c = await loadAliasesForRoot(workspaceRoot, resourcePath);
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
