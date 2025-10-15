// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { createImportHoverProvider } from './decorator';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

  // Use the console to output diagnostic information (console.log) and errors (console.error)
  // This line of code will only be executed once when your extension is activated
  console.log('Congratulations, your extension "open-import-file" is now active!');

  // The command has been defined in the package.json file
  // Now provide the implementation of the command with registerCommand
  // The commandId parameter must match the command field in package.json
  // Simple hello command (kept for compatibility)
  // const hello = vscode.commands.registerCommand('open-import-file.helloWorld', () => {
  //   vscode.window.showInformationMessage('Hello World from open-import-file!');
  // });
  // context.subscriptions.push(hello);

  // Helper: normalize various argument forms to a vscode.Uri or undefined
  function normalizeToUri(arg: any): vscode.Uri | undefined {
    try {
      if (!arg) return undefined;
      if (arg instanceof vscode.Uri) return arg;
      if (typeof arg === 'string') {
        let s = arg;
        // If it's JSON quoted (sometimes passed), try to strip
        try {
          if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
            s = s.slice(1, -1);
          }
        } catch {}

        // Try repeated decodeURIComponent to handle double-encoding
        for (let i = 0; i < 3; i++) {
          try {
            const parsed = vscode.Uri.parse(s);
            if (parsed && parsed.scheme) return parsed;
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

  // Command to open a file from CodeLens / hover
  const openCmd = vscode.commands.registerCommand('open-import-file.open', async (uriOrString: any) => {
    const uri = normalizeToUri(uriOrString);
    if (!uri) {
      vscode.window.showErrorMessage('Unable to open file: invalid URI');
      return;
    }
    try {
      // ensure file exists first
      try {
        await vscode.workspace.fs.stat(uri);
      } catch (e) {
        // file not found
        vscode.window.showErrorMessage(`Unable to open file: ${uri.toString()} (not found)`);
        return;
      }
      // Use the generic open command which works for text and binary files (images)
      try {
        await vscode.commands.executeCommand('vscode.open', uri);
      } catch (err) {
        vscode.window.showErrorMessage(`Unable to open file: ${err}`);
      }
    } catch (e) {
      vscode.window.showErrorMessage(`Unable to open file: ${e}`);
    }
  });
  context.subscriptions.push(openCmd);

  // Command used by DocumentLink fallback when direct resolution fails
  const openLinkCmd = vscode.commands.registerCommand('open-import-file.openLink', async (spec: string, docUriStr: string) => {
    try {
      const path = require('path');
      // normalize docUriStr which may be an encoded string
      const docUri = normalizeToUri(docUriStr);
      if (!spec || !docUri) {
        vscode.window.showErrorMessage('openLink: missing parameters');
        return;
      }
      // normalize spec string
      try { if ((spec.startsWith('"') && spec.endsWith('"')) || (spec.startsWith("'") && spec.endsWith("'"))) spec = spec.slice(1, -1); } catch {}
      // try relative
      if (spec.startsWith('.')) {
        const docDir = path.dirname(docUri.fsPath);
        const joined = path.join(docDir, spec);
        const exts = ['', '.ts', '.js', '.tsx', '.jsx', '.json', '/index.ts', '/index.js'];
        for (const ext of exts) {
          const candidate = vscode.Uri.file(joined + ext);
          try {
            await vscode.workspace.fs.stat(candidate);
            // Always use generic open for reliability across file types
            await vscode.commands.executeCommand('vscode.open', candidate);
            return;
          } catch (e) {
            // continue
          }
        }
      }
      // try workspace search for non-relative
      const base = spec.split('/').pop() || spec;
      const results = await vscode.workspace.findFiles(`**/${base}*`, '**/node_modules/**', 5);
      if (results && results.length > 0) {
        // Always open result with generic open command
        await vscode.commands.executeCommand('vscode.open', results[0]);
        return;
      }
      vscode.window.showErrorMessage(`Could not resolve import: ${spec}`);
    } catch (e) {
      vscode.window.showErrorMessage(`openLink error: ${e}`);
    }
  });
  context.subscriptions.push(openLinkCmd);

  // Register hover-based UI only
  const hoverProvider = createImportHoverProvider();
  context.subscriptions.push(vscode.languages.registerHoverProvider({ scheme: 'file' }, hoverProvider));
}

// This method is called when your extension is deactivated
export function deactivate() {}
