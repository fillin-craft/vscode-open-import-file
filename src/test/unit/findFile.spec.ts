import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
import { findFileForImport } from '../../resolver/findFile';

suite('findFile resolver', () => {
  test('findFileForImport finds svg under fixture', async () => {
    const fixtureRoot = path.resolve(process.cwd(), 'src', 'test', 'fixtures', 'projectA');
    const docUri = vscode.Uri.file(path.join(fixtureRoot, 'src', 'app.ts'));
    const r = await findFileForImport('@/assets/images/link_icon_x.svg', docUri);
    assert.ok(r, 'expected a Uri');
    assert.ok(r!.fsPath.includes('link_icon_x.svg'));
  });
});
