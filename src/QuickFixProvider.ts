import * as vscode from 'vscode';

import type { Replacement } from './type';

class QuickFixProvider implements vscode.CodeActionProvider {
  public static readonly providedCodeActionKinds = [vscode.CodeActionKind.QuickFix];

  constructor(
    private readonly getReplacements: (diagnostic: vscode.Diagnostic) => Replacement[]
  ) {}

  public provideCodeActions(
    document: vscode.TextDocument,
    _range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
    _token: vscode.CancellationToken
  ): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = [];

    for (const diagnostic of context.diagnostics) {
      if (diagnostic.source !== 'LanguageTool') {
        continue;
      }

      const replacements = this.getReplacements(diagnostic);
      for (const replacement of replacements) {
        const action = new vscode.CodeAction(
          `Ändern zu "${replacement.value}"`,
          vscode.CodeActionKind.QuickFix
        );
        action.edit = new vscode.WorkspaceEdit();
        action.edit.replace(document.uri, diagnostic.range, replacement.value);
        action.diagnostics = [diagnostic];
        action.isPreferred = true;
        actions.push(action);
      }
    }

    return actions;
  }
}

export { QuickFixProvider };