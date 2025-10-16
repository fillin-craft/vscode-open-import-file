# AGENTS.md - Development Guide for AI Agents

## Project Overview

**Open Import File for VSCode** is a VS Code extension that enables users to quickly navigate to files referenced in import/require statements by hovering over them and clicking the "Open This File in VS Code" link.

**Repository:** [fillin-craft/vscode-open-import-file](https://github.com/fillin-craft/vscode-open-import-file)

## Key Architecture Components

### 1. **extension.ts** - Extension Activation & Command Handlers
- Activates on `onStartupFinished` (when workspace opens) and on specific languages
- Registers two main commands:
  - `open-import-file.open`: Opens a file from a resolved URI
  - `open-import-file.openLink`: Fallback command for dynamic import resolution
- Registers a hover provider for the UI

**Key Features:**
- `normalizeToUri(arg)`: Converts various argument formats (string, encoded URI) to vscode.Uri
- Validates file existence before opening
- Supports both text and binary files (images, assets)
- Uses `vscode.commands.executeCommand('vscode.open', uri)` for reliable file opening

**Commands:**
- `openCmd` (`open-import-file.open`): Direct file opening from resolved paths
- `openLinkCmd` (`open-import-file.openLink`): Handles fallback resolution with import spec + document URI

### 2. **decorator.ts** - UI Layer (HoverProvider)
- Implements `vscode.HoverProvider` that displays on import statements
- Regex-based detection of import/require patterns: `import ... from 'spec'`, `require('spec')`
- Shows hover markdown with clickable "Open This File in VS Code" command link
- Resolves targets using centralized `findFileForImport()` function

**Key Functions:**
- `createImportHoverProvider()`: Returns a HoverProvider instance
- `provideHover(document, position)`: Detects if cursor is on an import spec and shows hover

### 3. **findFile.ts** - Public API
Exports the main resolution functionality:
- `findFileForImport(spec, documentUri)`: Core file resolution function
- `DEBUG`: Environment variable flag (`OPEN_IMPORT_FILE_DEBUG`) for troubleshooting

### 4. **resolver/findFile.ts** - Core Resolution Logic
Main algorithm for resolving import paths to actual file URIs:

**Resolution Order:**
1. **Relative imports** (e.g., `./utils`, `../helpers`):
   - Resolve from current document's directory
   - Try all configured extensions

2. **Alias imports** (e.g., `@/utils`):
   - Query `resolveAliasToFiles()` for candidates
   - Try all configured extensions for each candidate

3. **Workspace search** (fallback):
   - Use `vscode.workspace.findFiles()` with pattern `**/${baseName}*`
   - Return first result (up to 10 matches)

4. **Package imports**:
   - Treat as npm packages (not resolved, returns undefined)

**Supported Extensions:**
```
['', '.ts', '.js', '.tsx', '.jsx', '.json', '.png', '.jpg', '.jpeg', 
 '.svg', '.webp', '.gif', '.bmp', '.ico', '/index.ts', '/index.js', 
 '/index.png', '/index.jpg', '/index.svg']
```

### 5. **resolver/alias.ts** - Path Alias Resolution
- Resolves `tsconfig.json` `compilerOptions.paths` and `baseUrl`
- Parses `webpack.config.js` `resolve.alias` (static parsing, no dynamic execution)
- Supports wildcard patterns in both tsconfig and webpack aliases
- Caches resolved aliases by workspace root for performance
- Normalizes all paths to absolute file system paths

**Functions:**
- `loadAliasesForRoot(workspaceRoot)`: Loads and caches aliases from tsconfig/webpack
- `resolveAliasToFiles(spec, resource)`: Resolves alias spec to candidate file paths
- `loadTsconfig(workspaceRoot)`: Parses tsconfig.json
- `loadWebpackAliases(workspaceRoot)`: Parses webpack.config.js

## Development Workflow

### Prerequisites
- Node.js (v18+ recommended)
- npm
- TypeScript
- VS Code (v1.105.0+)

### Setup
```bash
npm install
```

### Build & Development
- **Compile TypeScript:** `npm run compile`
- **Watch mode (recommended):** `npm run watch`
- **Run tests:** `npm run test`
- **Run unit tests only:** `npm run unit-test`
- **Watch tests:** `npm run watch-tests`
- **Lint code:** `npm run lint`
- **Package for distribution:** `npm run package`

### Testing
The project uses:
- **Mocha** for unit tests
- **@vscode/test-electron** for integration tests
- **Fixtures** in `src/test/fixtures/projectA/` for test data

**Test Files:**
- `src/test/unit/alias.spec.ts` - Alias resolver tests
- `src/test/unit/findFile.spec.ts` - File resolution tests
- `src/test/extension.test.ts` - Integration tests

## Core Algorithm: How Import Resolution Works

**In `src/resolver/findFile.ts`:**

1. **Normalize Import Spec**
   - Remove surrounding quotes if present (e.g., `"./utils"` → `./utils`)

2. **Relative Import Resolution** (starts with `.`)
   - Resolve from current document's directory
   - Try all configured extensions sequentially
   - Return first match

3. **Alias Resolution** (if not relative)
   - Call `resolveAliasToFiles(spec, documentUri)` from `src/resolver/alias.ts`
   - Get list of candidate absolute paths
   - Try all configured extensions for each candidate
   - Return first match

4. **Workspace Fallback** (if not found yet)
   - Extract base name from spec
   - Use `vscode.workspace.findFiles(**/${baseName}*)` to search workspace
   - Exclude node_modules
   - Return first result (up to 10 matches)

5. **Package Import Handling**
   - If spec doesn't start with `.` and nothing found, treat as npm package
   - Return undefined (no local file resolution)

**Alias Resolution Details (in `src/resolver/alias.ts`):**

The `resolveAliasToFiles()` function:
1. Determines workspace root from resource URI
2. Loads cached aliases or loads them fresh using `loadAliasesForRoot()`
3. Checks webpack aliases first (prefer longer keys for specificity)
4. Checks tsconfig paths with wildcard support
5. Returns normalized unique absolute paths

## Important Files for Agents

### When Adding Features
1. **For UI changes:** Modify `src/decorator.ts`
2. **For resolution logic:** Modify `src/resolver/findFile.ts`
3. **For alias support:** Modify `src/resolver/alias.ts`
4. **For command handling:** Modify `src/extension.ts`

### When Debugging
1. Check test fixtures in `src/test/fixtures/projectA/`
2. Enable `DEBUG` flag: `OPEN_IMPORT_FILE_DEBUG=1` in terminal
3. Check console output in VS Code debug panel
4. The debug logs appear in the Extension Host output

### Test Files
- `src/test/unit/alias.spec.ts` - Alias resolver tests
- `src/test/unit/findFile.spec.ts` - File resolution tests
- `src/test/extension.test.ts` - Integration tests

## Configuration Files

### package.json
- **Activation Events:** 
  - `onStartupFinished` (when workspace opens)
  - `onLanguage:javascript`, `onLanguage:typescript`, etc. (when JS/TS files open)
- **Commands:** Defines `open-import-file.open` and `open-import-file.openLink`
- **Engine:** Requires VS Code v1.105.0+

### tsconfig.json
- TypeScript compilation settings
- Path alias configuration for the extension itself

### webpack.config.js
- Bundles the extension into single `dist/extension.js` file
- Uses ts-loader for TypeScript compilation

## Common Tasks for Agents

### To Add Support for a New File Type
1. Add extension to `exts` array in `src/resolver/findFile.ts`
2. Update integration tests in `src/test/extension.test.ts`

### To Support New Path Alias Formats
1. Update `loadTsconfig()` or `loadWebpackAliases()` in `src/resolver/alias.ts`
2. Add tests in `src/test/unit/alias.spec.ts`

### To Fix Import Resolution Issues
1. Enable DEBUG: `OPEN_IMPORT_FILE_DEBUG=1 npm run watch`
2. Check `src/resolver/findFile.ts` algorithm
3. Add test case in `src/test/unit/findFile.spec.ts`
4. Verify with fixture in `src/test/fixtures/projectA/`

### To Update Documentation
- Main docs: `README.md`
- Agent docs: `AGENTS.md` (this file)
- Changelog: `CHANGELOG.md`

## Important Considerations

1. **Path Handling:** Always use platform-independent path methods from Node.js `path` module
2. **File URIs:** Use `vscode.Uri` API for consistent cross-platform support
3. **Performance:** Cache alias resolutions to avoid repeated `tsconfig.json` reads
4. **Fallback Strategy:** Always have a fallback mechanism for edge cases
5. **Error Handling:** Gracefully handle file not found and permission errors
6. **Documentation:** When a task is complete, **do NOT create new markdown files**. Instead, append content to existing files like `AGENTS.md` (this file) or update `CHANGELOG.md` for version-specific changes

## Scripts Available

```bash
npm run compile          # Single build
npm run watch           # Watch mode (default build task)
npm run test            # Run all tests (with linting)
npm run unit-test       # Run only unit tests with Mocha
npm run watch-tests     # Watch and recompile tests
npm run lint            # Check code style
npm run package         # Production build for distribution
npm run pretest         # Compile tests, extension, and lint
```

## Extension Activation

The extension activates automatically when:
- A workspace opens (via `onStartupFinished`)
- A JavaScript file is opened
- A TypeScript file is opened
- A JSX/TSX file is opened

## Contribution Guidelines for Agents

1. **Always run tests** before considering changes complete
2. **Check linting** with `npm run lint`
3. **Update CHANGELOG.md** for user-facing changes
4. **Add tests** for new functionality
5. **Use TypeScript** strictly (no `any` types without justification)
6. **Document complex logic** with comments
7. **Handle errors gracefully** with user-facing messages

## Troubleshooting

### Extension not activating
- Check that `onStartupFinished` is in `activationEvents` in `package.json`
- Verify the VS Code version is 1.105.0 or higher

### Files not resolving
- Enable DEBUG in terminal: `OPEN_IMPORT_FILE_DEBUG=1`
- Check `tsconfig.json` alias configuration
- Verify file extensions are supported in `exts` array
- Check webpack.config.js alias syntax

### Tests failing
- Run `npm run compile-tests` to recompile
- Check fixture files exist in `src/test/fixtures/projectA/`
- Ensure mock files are properly structured

## Related Technologies

- **VS Code API:** Extension development framework
- **TypeScript:** Language and type checking
- **Webpack:** Module bundler for bundling the extension
- **Mocha:** Test framework
- **ESLint:** Code linting

## Recent Improvements (2025-10-16)

### Migrated to VSCode Native APIs

**Objective:** Replace Node.js `fs` module with VSCode's workspace APIs for better non-blocking file I/O and cross-platform support.

**Changes Made:**

1. **`src/resolver/alias.ts` - Async File I/O Migration**
   - Converted `loadTsconfig()` to async using `vscode.workspace.fs.readFile()`
   - Converted `loadWebpackAliases()` to async using `vscode.workspace.openTextDocument()`
   - Updated `loadAliasesForRoot()` to be async with cache TTL (5 minutes)
   - Updated `resolveAliasToFiles()` to async, returns `Promise<string[]>`
   - Removed direct dependency on Node.js `fs` module

2. **`src/resolver/findFile.ts` - Updated Callers**
   - Updated call to `resolveAliasToFiles()` to use `await`
   - No other changes needed (function signature already async)

3. **Tests Updated**
   - `src/test/unit/alias.spec.ts`: Updated both tests to async/await

**Benefits:**

- ✅ **Non-blocking UI:** File reads no longer block the editor during hover resolution
- ✅ **Cross-platform:** Uses VSCode's native path handling and URI APIs
- ✅ **Workspace integration:** `openTextDocument()` leverages VSCode's document cache
- ✅ **Better error handling:** Graceful fallbacks for missing config files
- ✅ **Cache invalidation:** TTL-based cache prevents stale configuration data

**Technical Details:**

- `vscode.workspace.fs` provides `readFile()` that returns `Uint8Array`, decoded with `TextDecoder`
- `vscode.workspace.openTextDocument()` returns cached document if already open in editor
- Cache entry now includes `timestamp` for TTL validation
- All async operations properly propagated through call chain

**Testing:**

- All tests passing (integration tests with `npm run test`)
- No TypeScript compilation errors
- ESLint warnings exist but are pre-existing code style issues (not related to this change)

**Migration Path for Similar Operations:**

If implementing other file operations, follow this pattern:
```typescript
// Before (blocking)
const data = fs.readFileSync(path, 'utf8');

// After (non-blocking)
const uri = vscode.Uri.file(path);
const fileData = await vscode.workspace.fs.readFile(uri);
const data = new TextDecoder().decode(fileData);
```
