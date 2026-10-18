import * as vscode from 'vscode';

import { DiagnosticController } from './DiagnosticController';
import { LanguageCheckerService } from './LanguageCheckerService';
import { QuickFixProvider } from './QuickFixProvider';

let diagnosticController: DiagnosticController | undefined;

export function activate(context: vscode.ExtensionContext): void {
  const languageCheckerService = new LanguageCheckerService('de-DE');
  diagnosticController = new DiagnosticController(languageCheckerService);

  const quickFixProvider = new QuickFixProvider((diagnostic) =>
    diagnosticController?.getDiagnosticReplacements(diagnostic) ?? []
  );

  diagnosticController.registerEvents(context);

  const codeActionRegistration = vscode.languages.registerCodeActionsProvider(
    ['plaintext', 'markdown', 'git-commit'],
    quickFixProvider,
    {
      providedCodeActionKinds: QuickFixProvider.providedCodeActionKinds
    }
  );

  context.subscriptions.push(codeActionRegistration);
  context.subscriptions.push({
    dispose: () => {
      diagnosticController?.dispose();
      diagnosticController = undefined;
    }
  });
}

export function deactivate(): void {
  diagnosticController?.dispose();
  diagnosticController = undefined;
}
