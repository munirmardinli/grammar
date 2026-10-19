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
  const config = GrammarConfig.parse(
    'words: [LanguageTool, VSCode]\nenglish: [workflow]\ntechnicalTerms: [Fachbegriff]\nnames: [Munir]\nabbreviations: [DSGVO]'
  );
  assert.deepEqual(config.words, ['LanguageTool', 'VSCode']);
  assert.deepEqual(config.english, ['workflow']);
  assert.deepEqual(config.technicalTerms, ['Fachbegriff']);
  assert.deepEqual(config.names, ['Munir']);
  assert.deepEqual(config.abbreviations, ['DSGVO']);
  assert.deepEqual(config.ignoredWords, [
    'LanguageTool',
    'VSCode',
    'workflow',
    'Fachbegriff',
    'Munir',
    'DSGVO'
  ]);
  assert.equal(config.language, 'de-DE');
  assert.equal(config.useGitignore, false);
  assert.deepEqual(config.ignorePaths, []);
  assert.deepEqual(config.ignoreOptions, {
    html: true,
    style: true,
    frontmatter: true,
    markdownLinks: true
  });
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
  assert.throws(
    () => GrammarConfig.parse('english: [word, 42]'),
    /"english" value/
  );
  assert.throws(
    () => GrammarConfig.parse('technicalTerms: [word, 42]'),
    /"technicalTerms" value/
  );
  assert.throws(
    () => GrammarConfig.parse('names: [word, 42]'),
    /"names" value/
  );
  assert.throws(
    () => GrammarConfig.parse('abbreviations: [word, 42]'),
    /"abbreviations" value/
  );
  assert.throws(
    () => GrammarConfig.parse('ignore:\n  html: "yes"'),
    /"ignore\.html" value/
  );
});

test('parses ignore flags from the grammar YAML configuration', () => {
  const config = GrammarConfig.parse(
    'ignore:\n  html: false\n  frontmatter: false'
  );
  assert.deepEqual(config.ignoreOptions, {
    html: false,
    style: true,
    frontmatter: false,
    markdownLinks: true
  });
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
    assert.equal(config.ignoreOptions.frontmatter, true);
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
    assert.deepEqual(config.english, []);
    assert.deepEqual(config.names, []);
    assert.deepEqual(config.abbreviations, []);
    assert.deepEqual(config.technicalTerms, []);
    assert.deepEqual(config.ignoreOptions, {
      html: true,
      style: true,
      frontmatter: true,
      markdownLinks: true
    });
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

  test('sends configured technical terms, names, and abbreviations to LanguageTool', async () => {
    const config = GrammarConfig.parse(
      'words: [ProductName]\nenglish: [workflow]\ntechnicalTerms: [Fachbegriff]\nnames: [Munir]\nabbreviations: [DSGVO]'
    );
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
        config.ignoredWords
      );

      await service.checkText(
        'Munir uses DSGVO, ProductName, workflow and Fachbegriff.'
      );
      assert.deepEqual(new URLSearchParams(requestBody).getAll('ignoredWords'), [
        'ProductName',
        'workflow',
        'Fachbegriff',
        'Munir',
        'DSGVO'
      ]);
    } finally {
      const closed = once(server, 'close');
      server.close();
      await closed;
    }
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

test('enforces uppercase word starts after colons and suppresses matching remote flags', async () => {
  const requests = ['**Wer:** eine Fachkraft.', '**Wer:** Eine Fachkraft.'];
  let requestIndex = 0;
  const server = createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) {
      body += chunk.toString();
    }
    const text = new URLSearchParams(body).get('text') ?? '';
    const index = requestIndex;
    requestIndex += 1;
    const afterColonOffset = text.indexOf(index === 0 ? 'eine' : 'Eine');
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(
      JSON.stringify({
        matches: [
          {
            message: 'Capitalization error after colon',
            offset: afterColonOffset,
            length: 1,
            replacements: [],
            rule: { id: 'DE_CASE', description: 'Capitalization' }
          },
          {
            message: 'Independent spelling error',
            offset: text.indexOf('Fachkraft'),
            length: 1,
            replacements: [],
            rule: { id: 'SPELLING', description: 'Spelling' }
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
      'de-DE',
      `http://127.0.0.1:${address.port}/check`
    );

    const lowercaseMatches = await service.checkText(requests[0], true);
    assert.equal(lowercaseMatches.length, 2);
    assert.equal(
      lowercaseMatches.find((match) => match.rule.id === 'COLON_CAPITALIZATION')
        ?.replacements[0].value,
      'E'
    );

    const uppercaseMatches = await service.checkText(requests[1], true);
    assert.deepEqual(uppercaseMatches.map((match) => match.rule.id), ['SPELLING']);
  } finally {
    const closed = once(server, 'close');
    server.close();
    await closed;
  }
});

test('does not treat gender-inclusive colon forms as sentence punctuation', async () => {
  const text = 'Klient:innen und Mitarbeiter:innen werden begleitet.';
  const genderMarkerOffset = text.indexOf('innen');
  const server = createServer(async (request, response) => {
    request.resume();
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(
      JSON.stringify({
        matches: [
          {
            message: 'Capitalization error after colon',
            offset: genderMarkerOffset,
            length: 1,
            replacements: [],
            rule: { id: 'DE_CASE', description: 'Capitalization' }
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
      'de-DE',
      `http://127.0.0.1:${address.port}/check`
    );

    assert.deepEqual(await service.checkText(text, true), []);
  } finally {
    const closed = once(server, 'close');
    server.close();
    await closed;
  }
});

test('does not flag uppercase sentence starts in Markdown list items', async () => {
  const texts = ['- **Nach Anbruch:** Es gibt keine pauschale Frist.', 'Nach Anbruch.'];
  const server = createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) {
      body += chunk.toString();
    }
    const text = new URLSearchParams(body).get('text') ?? '';
    const offset = text.indexOf('Nach');

    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(
      JSON.stringify({
        matches: [
          {
            message: 'Außer am Satzanfang werden nur Nomen großgeschrieben.',
            offset,
            length: 'Nach'.length,
            replacements: [{ value: 'nach' }],
            rule: { id: 'DE_CASE', description: 'Capitalization' }
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
      'de-DE',
      `http://127.0.0.1:${address.port}/check`
    );

    assert.deepEqual(await service.checkText(texts[0], true), []);
    assert.deepEqual(
      (await service.checkText(texts[1], true)).map(({ rule }) => rule.id),
      ['DE_CASE']
    );
  } finally {
    const closed = once(server, 'close');
    server.close();
    await closed;
  }
});

test('ignores whitespace-only LanguageTool matches in Markdown table layout', async () => {
  const tableText =
    '| Raum-Code | Raum-Typ        |\r\n| --------- | --------------- |\r\n| **B009**  | Bewegungsraum   |';
  const tableWhitespaceOffset = tableText.indexOf('  | Bewegungsraum');
  const proseText = 'normal  spacing';
  const proseWhitespaceOffset = proseText.indexOf('  ');

  const server = createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) {
      body += chunk.toString();
    }
    const submittedText = new URLSearchParams(body).get('text');
    const inTable = submittedText?.startsWith('|') ?? false;

    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(
      JSON.stringify({
        matches: [
          {
            message: 'Repeated spaces',
            offset: inTable ? tableWhitespaceOffset : proseWhitespaceOffset,
            length: 2,
            replacements: [],
            rule: { id: 'WHITESPACE_RULE', description: 'Repeated whitespace' }
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
    const service = new LanguageCheckerService('en-US', `http://127.0.0.1:${address.port}/check`);

    assert.deepEqual(await service.checkText(tableText, true), []);
    assert.equal((await service.checkText(proseText, true)).length, 1);
    assert.equal((await service.checkText(tableText, false)).length, 1);
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
    service.updateConfiguration('en-US', ['ProductName'], {
      html: true,
      style: true,
      frontmatter: false,
      markdownLinks: true
    });
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

test('masks HTML, style blocks, frontmatter, and Markdown link targets before checking', async () => {
  const submittedTexts: string[] = [];
  const server = createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) {
      body += chunk.toString();
    }
    submittedTexts.push(new URLSearchParams(body).get('text') ?? '');
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
    const markdown =
      '---\ntitle: Falschwort\n---\n' +
      '<small style="color: red;">Sichtbarer Text</small>\n' +
      '<style>.class { color: red; }</style>\n' +
      '[Linktext](https://example.invalid/falschwort)\n' +
      '[[studies/hep/incident/1|Selbstdarstellung]]\n' +
      '[[studies/hep/incident/2]]';

    assert.deepEqual(await service.checkText(markdown, true), []);
    const submitted = submittedTexts[0];
    assert.equal(submitted.length, markdown.length);
    assert.equal(submitted.split('\n').length, markdown.split('\n').length);
    assert.equal(submitted.includes('Falschwort'), false);
    assert.equal(submitted.includes('<small'), false);
    assert.equal(submitted.includes('style='), false);
    assert.equal(submitted.includes('.class'), false);
    assert.equal(submitted.includes('Sichtbarer Text'), true);
    assert.equal(submitted.includes('Linktext'), true);
    assert.equal(submitted.includes('example.invalid'), false);
    assert.equal(submitted.includes('studies/hep/incident/1'), false);
    assert.equal(submitted.includes('Selbstdarstellung'), true);
    assert.equal(submitted.includes('studies/hep/incident/2'), false);
  } finally {
    const closed = once(server, 'close');
    server.close();
    await closed;
  }
});

test('does not turn masked Markdown content into repeated-space diagnostics', async () => {
  const markdown = '---\ntitle:  Intro\n---\nvisible  spacing\n';
  const frontmatterWhitespaceOffset = markdown.indexOf('  ');
  const visibleWhitespaceOffset = markdown.lastIndexOf('  ');
  let submittedText = '';
  const server = createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) {
      body += chunk.toString();
    }
    submittedText = new URLSearchParams(body).get('text') ?? '';
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(
      JSON.stringify({
        matches: [frontmatterWhitespaceOffset, visibleWhitespaceOffset].map(
          (offset) => ({
            message: 'Repeated spaces',
            offset,
            length: 2,
            replacements: [],
            rule: { id: 'WHITESPACE_RULE', description: 'Repeated whitespace' }
          })
        )
      })
    );
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

    const matches = await service.checkText(markdown, true);

    assert.equal(submittedText.length, markdown.length);
    assert.notEqual(
      submittedText.slice(
        frontmatterWhitespaceOffset,
        frontmatterWhitespaceOffset + 2
      ),
      '  '
    );
    assert.deepEqual(matches.map((match) => match.offset), [visibleWhitespaceOffset]);
  } finally {
    const closed = once(server, 'close');
    server.close();
    await closed;
  }
});

test('reports repeated spaces after Markdown links locally', async () => {
  const markdown =
    'Empty link: []()  description\n' +
    '[Link](https://example.invalid/path_(one))   more text\n' +
    '[Hard break](url)  \n';
  const server = createServer(async (request, response) => {
    request.resume();
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

    const matches = await service.checkText(markdown, true);
    const expectedOffsets = [
      markdown.indexOf('  description'),
      markdown.indexOf('   more text')
    ];

    assert.deepEqual(
      matches.map(({ offset, length, rule }) => ({ offset, length, rule: rule.id })),
      expectedOffsets.map((offset, index) => ({
        offset,
        length: index === 0 ? 2 : 3,
        rule: 'WHITESPACE_RULE'
      }))
    );
    assert.deepEqual(
      matches.map(({ replacements }) => replacements),
      [[{ value: ' ' }], [{ value: ' ' }]]
    );
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
