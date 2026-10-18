import * as vscode from 'vscode';

import { LanguageCheckerService } from './LanguageCheckerService';
import type { DebounceTimer, Replacement } from './type';

class DiagnosticController {
  private readonly checkerService: LanguageCheckerService;
  private readonly diagnosticCollection: vscode.DiagnosticCollection;
  private readonly debounceTimers: Map<string, DebounceTimer>;
  private readonly debounceDelay: number;
  private readonly replacementsByDiagnostic: WeakMap<vscode.Diagnostic, Replacement[]>;

  constructor(checkerService: LanguageCheckerService, debounceDelay: number = 500) {
    this.checkerService = checkerService;
    this.diagnosticCollection = vscode.languages.createDiagnosticCollection('languageTool');
    this.debounceTimers = new Map<string, DebounceTimer>();
    this.debounceDelay = debounceDelay;
    this.replacementsByDiagnostic = new WeakMap<vscode.Diagnostic, Replacement[]>();
  }

  public registerEvents(context: vscode.ExtensionContext): void {
    context.subscriptions.push(this.diagnosticCollection);

    context.subscriptions.push(
      vscode.workspace.onDidChangeTextDocument((event) => this.handleDocumentChange(event.document))
    );

    context.subscriptions.push(
      vscode.workspace.onDidOpenTextDocument((document) => this.validateDocument(document))
    );

    context.subscriptions.push(
      vscode.workspace.onDidSaveTextDocument((document) => this.validateDocument(document))
    );

    context.subscriptions.push(
      vscode.workspace.onDidCloseTextDocument((document) => this.clearDiagnostics(document))
    );

    if (vscode.window.activeTextEditor) {
      this.validateDocument(vscode.window.activeTextEditor.document);
    }
  }

  private handleDocumentChange(document: vscode.TextDocument): void {
    const uriString = document.uri.toString();
    if (this.debounceTimers.has(uriString)) {
      clearTimeout(this.debounceTimers.get(uriString)!);
    }

    const timer = setTimeout(() => {
      void this.validateDocument(document);
      this.debounceTimers.delete(uriString);
    }, this.debounceDelay);

    this.debounceTimers.set(uriString, timer);
  }

  public async validateDocument(document: vscode.TextDocument): Promise<void> {
    if (
      document.languageId !== 'plaintext' &&
      document.languageId !== 'markdown' &&
      document.languageId !== 'git-commit'
    ) {
      return;
    }

    const text = document.getText();
    const matches = await this.checkerService.checkText(text);
    const diagnostics: vscode.Diagnostic[] = [];

    for (const match of matches) {
      const startPos = document.positionAt(match.offset);
      const endPos = document.positionAt(match.offset + match.length);
      const range = new vscode.Range(startPos, endPos);
      const diagnostic = new vscode.Diagnostic(
        range,
        match.message,
        vscode.DiagnosticSeverity.Warning
      );

      diagnostic.source = 'LanguageTool';
      diagnostic.code = match.rule.id;
      this.replacementsByDiagnostic.set(diagnostic, match.replacements);
      diagnostics.push(diagnostic);
    }

    this.diagnosticCollection.set(document.uri, diagnostics);
  }

  public getDiagnosticReplacements(diagnostic: vscode.Diagnostic): Replacement[] {
    return this.replacementsByDiagnostic.get(diagnostic) ?? [];
  }

  private clearDiagnostics(document: vscode.TextDocument): void {
    const uriString = document.uri.toString();
    if (this.debounceTimers.has(uriString)) {
      clearTimeout(this.debounceTimers.get(uriString)!);
      this.debounceTimers.delete(uriString);
    }
    this.diagnosticCollection.delete(document.uri);
  }

  public dispose(): void {
    this.diagnosticCollection.clear();
    this.diagnosticCollection.dispose();
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
  }
}

export { DiagnosticController };