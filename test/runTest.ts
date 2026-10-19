import * as path from 'node:path';

import { runTests } from '@vscode/test-electron';

async function main(): Promise<void> {
  const extensionDevelopmentPath = path.resolve(__dirname, '../..');
  const extensionTestsPath = path.resolve(__dirname, './suite');

  await runTests({
    extensionDevelopmentPath,
    extensionTestsPath,
    launchArgs: [extensionDevelopmentPath, '--disable-extensions']
  });
}

void main().catch((error: unknown) => {
  console.error('Failed to run VS Code extension tests.');
  console.error(error);
  process.exitCode = 1;
});
