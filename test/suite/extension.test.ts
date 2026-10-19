import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';

suite('Spell & Grammar Checker extension host', () => {
  test('activates in the VS Code Extension Host', async () => {
    const extension = vscode.extensions.getExtension('munirmardinli.vscode-spell-grammar-checker');
    assert.ok(extension);
    await extension.activate();
    assert.equal(extension.isActive, true);
  });
});
