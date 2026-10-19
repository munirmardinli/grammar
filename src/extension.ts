import * as vscode from "vscode";

import { Extension } from "./index";

const extension = new Extension();

export function activate(context: vscode.ExtensionContext): Promise<void> {
  return extension.activate(context);
}

export function deactivate(): void {
  extension.deactivate();
}
