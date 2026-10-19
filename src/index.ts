import * as vscode from "vscode";
import ignore from "ignore";

import { DiagnosticController } from "./DiagnosticController";
import { GrammarConfig } from "./GrammarConfig";
import { LanguageCheckerService } from "./LanguageCheckerService";
import { QuickFixProvider } from "./QuickFixProvider";

class Extension {
  private diagnosticController: DiagnosticController | undefined;
  private languageCheckerService: LanguageCheckerService | undefined;
  private workspacePath: string | undefined;
  private config = GrammarConfig.defaults();
  private gitignore = ignore();

  public async activate(context: vscode.ExtensionContext): Promise<void> {
    this.workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

    if (this.workspacePath) {
      try {
        await this.loadConfiguration();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        void vscode.window.showErrorMessage(
          `Could not load .grammar.yaml: ${message}`,
        );
        throw error;
      }
    }

    this.languageCheckerService = new LanguageCheckerService(
      this.config.language,
      undefined,
      this.config.ignoredWords,
      this.config.ignoreOptions,
    );
    this.diagnosticController = new DiagnosticController(
      this.languageCheckerService,
      500,
      (document) =>
        this.workspacePath !== undefined &&
        document.uri.scheme === "file" &&
        this.config.isPathIgnored(document.uri.fsPath, this.workspacePath, this.gitignore),
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

    if (this.workspacePath) {
      this.watchConfiguration(context);
    }
  }

  public deactivate(): void {
    this.diagnosticController?.dispose();
    this.diagnosticController = undefined;
    this.languageCheckerService = undefined;
    this.workspacePath = undefined;
  }

  private async loadConfiguration(): Promise<void> {
    if (!this.workspacePath) {
      this.config = GrammarConfig.defaults();
      this.gitignore = ignore();
      return;
    }

    const config = await GrammarConfig.load(this.workspacePath);
    const gitignore = config.useGitignore
      ? await GrammarConfig.loadGitignore(this.workspacePath)
      : ignore();

    this.config = config;
    this.gitignore = gitignore;
  }

  private watchConfiguration(context: vscode.ExtensionContext): void {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      return;
    }

    const configWatcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(workspaceFolder, ".grammar.yaml"),
    );
    const gitignoreWatcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(workspaceFolder, ".gitignore"),
    );
    const reload = () => {
      void this.reloadConfiguration();
    };

    configWatcher.onDidCreate(reload);
    configWatcher.onDidChange(reload);
    configWatcher.onDidDelete(reload);
    gitignoreWatcher.onDidCreate(reload);
    gitignoreWatcher.onDidChange(reload);
    gitignoreWatcher.onDidDelete(reload);
    context.subscriptions.push(configWatcher, gitignoreWatcher);
  }

  private async reloadConfiguration(): Promise<void> {
    try {
      await this.loadConfiguration();
      this.languageCheckerService?.updateConfiguration(
        this.config.language,
        this.config.ignoredWords,
        this.config.ignoreOptions,
      );
      await this.diagnosticController?.revalidateOpenDocuments();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      void vscode.window.showErrorMessage(`Could not reload .grammar.yaml: ${message}`);
    }
  }
}

export { Extension };
