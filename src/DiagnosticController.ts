import * as vscode from 'vscode';

import { LanguageCheckerService } from './LanguageCheckerService';
import type { DebounceTimer, Replacement } from './type';

class DiagnosticController {
  private readonly checkerService: LanguageCheckerService;
  private readonly diagnosticCollection: vscode.DiagnosticCollection;
  private readonly debounceTimers: Map<string, DebounceTimer>;
  private readonly debounceDelay: number;
  private readonly replacementsByDiagnostic: WeakMap<vscode.Diagnostic, Replacement[]>;
  private readonly isIgnoredDocument: (document: vscode.TextDocument) => boolean;
  private readonly validationVersions: Map<string, number>;
  private readonly diagnosticsByDocument: Map<
    string,
    { document: vscode.TextDocument; diagnostics: vscode.Diagnostic[] }
  >;
  private readonly outputChannel: vscode.OutputChannel;

  constructor(
    checkerService: LanguageCheckerService,
    debounceDelay: number = 500,
    isIgnoredDocument: (document: vscode.TextDocument) => boolean = () => false
  ) {
    this.checkerService = checkerService;
    this.diagnosticCollection = vscode.languages.createDiagnosticCollection('languageTool');
    this.debounceTimers = new Map<string, DebounceTimer>();
    this.debounceDelay = debounceDelay;
    this.replacementsByDiagnostic = new WeakMap<vscode.Diagnostic, Replacement[]>();
    this.isIgnoredDocument = isIgnoredDocument;
    this.validationVersions = new Map<string, number>();
    this.diagnosticsByDocument = new Map();
    this.outputChannel = vscode.window.createOutputChannel('Sprachfehler');
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
    const uriString = document.uri.toString();
    const validationVersion = (this.validationVersions.get(uriString) ?? 0) + 1;
    this.validationVersions.set(uriString, validationVersion);

    if (this.isIgnoredDocument(document)) {
      this.diagnosticCollection.delete(document.uri);
      this.diagnosticsByDocument.delete(uriString);
      this.updateOutputChannel();
      return;
    }

    if (
      document.languageId !== 'plaintext' &&
      document.languageId !== 'markdown' &&
      document.languageId !== 'git-commit'
    ) {
      return;
    }

    const text = document.getText();
    const matches = await this.checkerService.checkText(text, document.languageId === 'markdown');
    if (this.validationVersions.get(uriString) !== validationVersion) {
      return;
    }

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
    this.diagnosticsByDocument.set(uriString, { document, diagnostics });
    this.updateOutputChannel();
  }

  public async revalidateOpenDocuments(): Promise<void> {
    await Promise.all(vscode.workspace.textDocuments.map((document) => this.validateDocument(document)));
  }

  public getDiagnosticReplacements(diagnostic: vscode.Diagnostic): Replacement[] {
    return this.replacementsByDiagnostic.get(diagnostic) ?? [];
  }

  private clearDiagnostics(document: vscode.TextDocument): void {
    const uriString = document.uri.toString();
    this.validationVersions.set(uriString, (this.validationVersions.get(uriString) ?? 0) + 1);
    if (this.debounceTimers.has(uriString)) {
      clearTimeout(this.debounceTimers.get(uriString)!);
      this.debounceTimers.delete(uriString);
    }
    this.diagnosticCollection.delete(document.uri);
    this.diagnosticsByDocument.delete(uriString);
    this.updateOutputChannel();
  }

  private updateOutputChannel(): void {
    this.outputChannel.clear();
    const errors = [...this.diagnosticsByDocument.values()].flatMap(
      ({ document, diagnostics }) =>
        diagnostics.map((diagnostic) => ({ document, diagnostic }))
    );

    this.outputChannel.appendLine(
      `${errors.length} Sprachfehler in ${this.diagnosticsByDocument.size} geprüften Dokument(en):`
    );

    if (errors.length === 0) {
      this.outputChannel.appendLine('Keine Sprachfehler gefunden.');
      return;
    }

    for (const { document, diagnostic } of errors) {
      const { line, character } = diagnostic.range.start;
      const filePath = document.uri.fsPath || document.uri.toString();
      const ruleCode =
        typeof diagnostic.code === 'string' || typeof diagnostic.code === 'number'
          ? diagnostic.code
          : 'LanguageTool';
      const matchedText = document.getText(diagnostic.range).replace(/\s+/g, ' ').trim();
      const excerpt = matchedText ? ` "${matchedText}"` : '';
      this.outputChannel.appendLine(
        `${filePath}:${line + 1}:${character + 1} [${ruleCode}]${excerpt}: ${diagnostic.message}`
      );
    }
  }

  public dispose(): void {
    this.diagnosticCollection.clear();
    this.diagnosticCollection.dispose();
    this.outputChannel.dispose();
    this.diagnosticsByDocument.clear();
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
    this.validationVersions.clear();
  }
}

export { DiagnosticController };