import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { once } from 'node:events';

import { GrammarConfig } from '../src/GrammarConfig';
import { LanguageCheckerService } from '../src/LanguageCheckerService';

test('parses the grammar YAML configuration and supplies defaults', () => {
  const config = GrammarConfig.parse('words: [LanguageTool, VSCode]');
  assert.deepEqual(config.words, ['LanguageTool', 'VSCode']);
  assert.equal(config.language, 'de-DE');
  assert.equal(config.useGitignore, false);
  assert.deepEqual(config.ignorePaths, []);
});

test('rejects invalid configuration values', () => {
  assert.throws(
    () => GrammarConfig.parse('ignorePaths: word'),
    /"ignorePaths" value/
  );
  assert.throws(
    () => GrammarConfig.parse('words: [word, 42]'),
    /"words" value/
  );
});

test('loads .grammar.yaml from the workspace folder', async () => {
  const workspacePath = await mkdtemp(join(tmpdir(), 'grammar-test-'));

  try {
    await writeFile(join(workspacePath, '.grammar.yaml'), 'language: en-US\nwords: [custom]');
    const config = await GrammarConfig.load(workspacePath);
    assert.equal(config.language, 'en-US');
    assert.equal(config.useGitignore, false);
    assert.deepEqual(config.ignorePaths, []);
    assert.deepEqual(config.words, ['custom']);
  } finally {
    await rm(workspacePath, { recursive: true, force: true });
  }
});

test('uses defaults when .grammar.yaml does not exist', async () => {
  const workspacePath = await mkdtemp(join(tmpdir(), 'grammar-test-'));

  try {
    const config = await GrammarConfig.load(workspacePath);
    assert.equal(config.language, 'de-DE');
    assert.equal(config.useGitignore, false);
    assert.deepEqual(config.ignorePaths, []);
    assert.deepEqual(config.words, []);
  } finally {
    await rm(workspacePath, { recursive: true, force: true });
  }
});

test('sends configured words to LanguageTool as ignoredWords', async () => {
  const workspacePath = await mkdtemp(join(tmpdir(), 'grammar-test-'));
  await writeFile(
    join(workspacePath, '.grammar.yaml'),
    'language: en-US\nwords: [ProductName, "custom term"]'
  );
  const config = await GrammarConfig.load(workspacePath);

  let requestBody = '';
  const server = createServer(async (request, response) => {
    for await (const chunk of request) {
      requestBody += chunk.toString();
    }
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end('{"matches":[]}');
  });

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');

  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');

    const service = new LanguageCheckerService(
      config.language,
      `http://127.0.0.1:${address.port}/check`,
      config.words
    );

    assert.deepEqual(await service.checkText('A test sentence.'), []);
    assert.deepEqual(new URLSearchParams(requestBody).getAll('ignoredWords'), [
      'ProductName',
      'custom term'
    ]);
    assert.equal(new URLSearchParams(requestBody).get('language'), 'en-US');
  } finally {
    const closed = once(server, 'close');
    server.close();
    await closed;
    await rm(workspacePath, { recursive: true, force: true });
  }
});

test('matches configured paths and enabled gitignore patterns', async () => {
  const workspacePath = await mkdtemp(join(tmpdir(), 'grammar-test-'));

  try {
    await writeFile(join(workspacePath, '.gitignore'), 'ignored.txt\n');
    await mkdir(join(workspacePath, 'src', 'nested'), { recursive: true });
    await writeFile(join(workspacePath, 'src', 'nested', 'config.yaml'), '');
    await writeFile(join(workspacePath, 'ignored.txt'), '');
    const config = GrammarConfig.parse(
      'useGitignore: true\nignorePaths:\n  - "src/**/*.yaml"'
    );
    const gitignore = await GrammarConfig.loadGitignore(workspacePath);

    assert.equal(
      config.isPathIgnored(
        join(workspacePath, 'src', 'nested', 'config.yaml'),
        workspacePath,
        gitignore
      ),
      true
    );
    assert.equal(
      config.isPathIgnored(join(workspacePath, 'ignored.txt'), workspacePath, gitignore),
      true
    );
  } finally {
    await rm(workspacePath, { recursive: true, force: true });
  }
});
