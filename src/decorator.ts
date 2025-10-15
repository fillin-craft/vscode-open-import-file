import * as vscode from 'vscode';
import { resolveAliasToFiles } from './aliasResolver';
import { findFileForImport } from './findFile';

// Only provide hover-based opening; the other providers were removed per user request.

// HoverProvider: when hovering over an import spec, show a hover with a command link
export function createImportHoverProvider(): vscode.HoverProvider {
  return new (class implements vscode.HoverProvider {
    private regex = /(?:import\s.+?from\s+|import\(|require\()\s*(['"])([^'"\)]+)\1/g;

    public async provideHover(document: vscode.TextDocument, position: vscode.Position): Promise<vscode.Hover | undefined> {
      const line = document.lineAt(position.line).text;
      let match: RegExpExecArray | null;
      // reset lastIndex in case regex has global flag and was used before
      try { (this.regex as RegExp).lastIndex = 0 } catch {}
      while ((match = this.regex.exec(line))) {
        const quote = match[1];
        const spec = match[2];
        const startIndex = match[0].indexOf(quote);
        const specStart = match.index + startIndex + 1;
        const specEnd = specStart + spec.length;
        const specRange = new vscode.Range(new vscode.Position(position.line, specStart), new vscode.Position(position.line, specEnd));
        if (specRange.contains(position)) {
          // Use centralized resolver that tries relative, alias (tsconfig/webpack),
          // and workspace fallback. This prevents missing cases like '@/...'.
          let target: vscode.Uri | undefined;
          try {
            target = await findFileForImport(spec, document.uri);
            // If findFileForImport returns undefined, treat as package import (no hover)
            // console.log('Resolved import spec', spec, 'to', target?.toString());
            if (!target) return undefined;
          } catch (e) {
            // ignore
            return undefined;
          }

          // Create hover contents: a markdown link that invokes our open command if target exists, otherwise fallback to openLink command
          const md = new vscode.MarkdownString();
          md.isTrusted = true;
          if (target) {
            const openArgs = encodeURIComponent(JSON.stringify([target.toString()]));
            md.appendMarkdown(`[Open This File in VS Code](command:open-import-file.open?${openArgs})`);
          } else {
            const args = encodeURIComponent(JSON.stringify([spec, document.uri.toString()]));
            md.appendMarkdown(`[Open This File in VS Code](command:open-import-file.openLink?${args})`);
          }
          return new vscode.Hover(md, specRange);
        }
      }
      return undefined;
    }
  })();
}
