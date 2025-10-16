import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
import { loadAliasesForRoot, resolveAliasToFiles } from '../../resolver/alias';

suite('alias resolver', () => {
  test('loads tsconfig paths and resolves wildcard @/*', async () => {
    const fixtureRoot = path.resolve(process.cwd(), 'src', 'test', 'fixtures', 'projectA');
    const cfg = await loadAliasesForRoot(fixtureRoot);
    assert.ok(cfg);
    const cand = await resolveAliasToFiles('@/assets/images/link_icon_x.svg', vscode.Uri.file(path.join(fixtureRoot, 'src', 'app.ts')));
    assert.ok(Array.isArray(cand));
    // expect at least one candidate that contains the fixtures path
    const found = cand.find(c => c.includes('assets'));
    assert.ok(found, `expected candidate containing assets, got ${JSON.stringify(cand)}`);
  });

  test('resolves @images/* to assets/images', async () => {
    const fixtureRoot = path.resolve(process.cwd(), 'src', 'test', 'fixtures', 'projectA');
    const cand = await resolveAliasToFiles('@images/logo.png', vscode.Uri.file(path.join(fixtureRoot, 'src', 'app.ts')));
    assert.ok(cand.some(c => c.includes('assets/images')),
      `expected assets/images candidate, got ${JSON.stringify(cand)}`);
  });
});
