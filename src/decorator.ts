import * as vscode from 'vscode';
import { findFileForImport } from './findFile';
import { normalizeImportSpec } from './utils';

/**
 * Regex to detect import/require statements.
 * Matches: import ... from 'spec', import(spec), require('spec')
 */
const IMPORT_SPEC_REGEX = /(?:import\s.+?from\s+|import\(|require\()\s*(['"])([^'"\)]+)\1/g;

/**
 * Create a hover provider for import statements.
 * Shows "Open This File in VS Code" link when hovering over import specs.
 */
export function createImportHoverProvider(): vscode.HoverProvider {
  return new (class implements vscode.HoverProvider {
    public async provideHover(
      document: vscode.TextDocument,
      position: vscode.Position
    ): Promise<vscode.Hover | undefined> {
      const line = document.lineAt(position.line).text;
      let match: RegExpExecArray | null;

      // Reset regex lastIndex for global flag
      IMPORT_SPEC_REGEX.lastIndex = 0;

      while ((match = IMPORT_SPEC_REGEX.exec(line))) {
        const quote = match[1];
        const spec = match[2];
        const startIndex = match[0].indexOf(quote);
        const specStart = match.index + startIndex + 1;
        const specEnd = specStart + spec.length;
        const specRange = new vscode.Range(
          new vscode.Position(position.line, specStart),
          new vscode.Position(position.line, specEnd)
        );

        // Check if cursor is on this import spec
        if (!specRange.contains(position)) {
          continue;
        }

        // Try to resolve the import spec to a file URI
        let target: vscode.Uri | undefined;
        try {
          target = await findFileForImport(spec, document.uri);
        } catch (e) {
          // Silently ignore errors - treat as unresolved
          return undefined;
        }

        // If not resolved, treat as external package - don't show hover
        if (!target) {
          return undefined;
        }

        // Create hover with clickable link to open the file
        const md = new vscode.MarkdownString();
        md.isTrusted = true;
        const openArgs = encodeURIComponent(JSON.stringify([target.toString()]));
        md.appendMarkdown(`[Open This File in VS Code](command:open-import-file.open?${openArgs})`);
        return new vscode.Hover(md, specRange);
      }

      return undefined;
    }
  })();
}
