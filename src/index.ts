import * as vscode from 'vscode';
import { LanguageCheckerService } from './LanguageCheckerService';
import { DiagnosticController } from './DiagnosticController';
import { QuickFixProvider } from './QuickFixProvider';

let diagnosticController: DiagnosticController | undefined;

export function activate(context: vscode.ExtensionContext): void {
  const languageCheckerService = new LanguageCheckerService('de-DE');

  diagnosticController = new DiagnosticController(languageCheckerService, 500);

  const quickFixProvider = new QuickFixProvider((diagnostic) => {
    return diagnosticController?.getDiagnosticReplacements(diagnostic) ?? [];
  });

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
    }
  });
}

export function deactivate(): void {
  if (diagnosticController) {
    diagnosticController.dispose();
  }
}
