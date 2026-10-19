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

test('filters LanguageTool matches whose text exactly matches a configured word', async () => {
  const server = createServer(async (request, response) => {
    request.resume();
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(
      JSON.stringify({
        matches: [
          {
            message: 'Ignored spelling match',
            offset: 0,
            length: 7,
            replacements: [],
            rule: { id: 'SPELLING', description: 'Spelling' }
          },
          {
            message: 'Other spelling match',
            offset: 8,
            length: 5,
            replacements: [],
            rule: { id: 'OTHER', description: 'Other' }
          }
        ]
      })
    );
  });

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');

  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');

    const service = new LanguageCheckerService(
      'en-US',
      `http://127.0.0.1:${address.port}/check`,
      [' AUTHORS ']
    );

    const matches = await service.checkText('authors other');
    assert.deepEqual(matches.map((match) => match.rule.id), ['OTHER']);
  } finally {
    const closed = once(server, 'close');
    server.close();
    await closed;
  }
});

test('uses configuration updates for the next LanguageTool request', async () => {
  const requests: URLSearchParams[] = [];
  const server = createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) {
      body += chunk.toString();
    }
    requests.push(new URLSearchParams(body));
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end('{"matches":[]}');
  });

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');

  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const service = new LanguageCheckerService(
      'de-DE',
      `http://127.0.0.1:${address.port}/check`
    );

    await service.checkText('A test sentence.');
    service.updateConfiguration('en-US', ['ProductName']);
    await service.checkText('Another test sentence.');

    assert.equal(requests[0].get('language'), 'de-DE');
    assert.equal(requests[1].get('language'), 'en-US');
    assert.deepEqual(requests[1].getAll('ignoredWords'), ['ProductName']);
  } finally {
    const closed = once(server, 'close');
    server.close();
    await closed;
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
