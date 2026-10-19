import * as vscode from "vscode";
import ignore from "ignore";

import { DiagnosticController } from "./DiagnosticController";
import { GrammarConfig } from "./GrammarConfig";
import { LanguageCheckerService } from "./LanguageCheckerService";
import { QuickFixProvider } from "./QuickFixProvider";

class Extension {
  private diagnosticController: DiagnosticController | undefined;

  public async activate(context: vscode.ExtensionContext): Promise<void> {
    const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    let config: GrammarConfig;
    let gitignore = ignore();

    if (workspacePath) {
      try {
        config = await GrammarConfig.load(workspacePath);
        if (config.useGitignore) {
          gitignore = await GrammarConfig.loadGitignore(workspacePath);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        void vscode.window.showErrorMessage(
          `Could not load .grammar.yaml: ${message}`,
        );
        throw error;
      }
    } else {
      config = GrammarConfig.defaults();
    }

    const languageCheckerService = new LanguageCheckerService(
      config.language,
      undefined,
      config.words,
    );
    this.diagnosticController = new DiagnosticController(
      languageCheckerService,
      500,
      (document) =>
        workspacePath !== undefined &&
        document.uri.scheme === "file" &&
        config.isPathIgnored(document.uri.fsPath, workspacePath, gitignore),
    );

    const quickFixProvider = new QuickFixProvider(
      (diagnostic) =>
        this.diagnosticController?.getDiagnosticReplacements(diagnostic) ?? [],
    );

    this.diagnosticController.registerEvents(context);

    const codeActionRegistration = vscode.languages.registerCodeActionsProvider(
      ["plaintext", "markdown", "git-commit"],
      quickFixProvider,
      {
        providedCodeActionKinds: QuickFixProvider.providedCodeActionKinds,
      },
    );

    context.subscriptions.push(codeActionRegistration);
    context.subscriptions.push({
      dispose: () => this.deactivate(),
    });
  }

  public deactivate(): void {
    this.diagnosticController?.dispose();
    this.diagnosticController = undefined;
  }
}

export { Extension };
