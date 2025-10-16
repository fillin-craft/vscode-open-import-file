import * as vscode from 'vscode';
import path from 'path';
import { createImportHoverProvider } from './decorator';
import { normalizeToUri, normalizeImportSpec, fileExists, getBaseNameFromSpec, showErrorMessage, IMPORT_EXTENSIONS } from './utils';

/**
 * Extension activation entry point.
 * Registers commands and hover provider.
 */
export function activate(context: vscode.ExtensionContext): void {
  console.log('Congratulations, your extension "open-import-file" is now active!');

  // Command to open a file from hover provider
  const openCmd = vscode.commands.registerCommand(
    'open-import-file.open',
    async (uriOrString: any) => handleOpenCommand(uriOrString)
  );
  context.subscriptions.push(openCmd);

  // Fallback command for dynamic import resolution
  const openLinkCmd = vscode.commands.registerCommand(
    'open-import-file.openLink',
    async (spec: string, docUriStr: string) => handleOpenLinkCommand(spec, docUriStr)
  );
  context.subscriptions.push(openLinkCmd);

  // Register hover-based UI
  const hoverProvider = createImportHoverProvider();
  context.subscriptions.push(vscode.languages.registerHoverProvider({ scheme: 'file' }, hoverProvider));
}

/**
 * Handle the open command: open a file from a resolved URI.
 */
async function handleOpenCommand(uriOrString: any): Promise<void> {
  try {
    const uri = normalizeToUri(uriOrString);
    if (!uri) {
      showErrorMessage('Unable to open file: invalid URI');
      return;
    }

    // Verify file exists before opening
    const exists = await fileExists(uri);
    if (!exists) {
      showErrorMessage(`Unable to open file: ${uri.toString()} (not found)`);
      return;
    }

    // Use the generic open command which works for text and binary files
    await vscode.commands.executeCommand('vscode.open', uri);
  } catch (e) {
    showErrorMessage(`Unable to open file: ${e}`);
  }
}

/**
 * Handle the openLink command: fallback for dynamic import resolution.
 * Attempts relative path resolution first, then workspace search.
 */
async function handleOpenLinkCommand(spec: string, docUriStr: string): Promise<void> {
  try {
    // Normalize parameters
    const docUri = normalizeToUri(docUriStr);
    if (!spec || !docUri) {
      showErrorMessage('openLink: missing parameters');
      return;
    }

    const normalizedSpec = normalizeImportSpec(spec);

    // Try relative imports first
    if (normalizedSpec.startsWith('.')) {
      const docDir = path.dirname(docUri.fsPath);
      const joined = path.join(docDir, normalizedSpec);
      const found = await tryFindFileWithExtensions(joined);
      if (found) {
        await vscode.commands.executeCommand('vscode.open', found);
        return;
      }
    }

    // Try workspace search for non-relative imports
    const baseName = getBaseNameFromSpec(normalizedSpec);
    const results = await vscode.workspace.findFiles(`**/${baseName}*`, '**/node_modules/**', 5);
    if (results && results.length > 0) {
      await vscode.commands.executeCommand('vscode.open', results[0]);
      return;
    }

    showErrorMessage(`Could not resolve import: ${spec}`);
  } catch (e) {
    showErrorMessage(`openLink error: ${e}`);
  }
}

/**
 * Helper: try to find a file by trying multiple extensions sequentially.
 */
async function tryFindFileWithExtensions(base: string): Promise<vscode.Uri | undefined> {
  for (const ext of IMPORT_EXTENSIONS) {
    const candidate = vscode.Uri.file(base + ext);
    if (await fileExists(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

/**
 * Extension deactivation entry point.
 */
export function deactivate(): void {
  // No cleanup needed
}
