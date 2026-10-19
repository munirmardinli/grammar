# Spell & Grammar Checker

This VS Code extension checks spelling and grammar in German text using the
LanguageTool public API. It adds diagnostics to plaintext, Markdown, and
Git-commit documents, and provides quick fixes for suggested replacements.

## Requirements

Text is sent to `https://api.languagetool.org/v2/check` for analysis. Do not use
the extension with sensitive text unless sending it to that service is
acceptable.

## Grammar configuration

Add a `.grammar.yaml` file to the root of your VS Code workspace:

```yaml
language: de-DE
useGitignore: true
ignorePaths:
  - "src/**/*.sh"
  - "src/**/*.yml"
  - "src/**/*.yaml"
  - "src/**/*.json"
  - "src/**/*.md"
  - ".vscode/**/*.json"
words:
  - ProductName
  - custom term
```

`language` selects the LanguageTool language, `useGitignore` enables rules from
the workspace-root `.gitignore`, `ignorePaths` skips matching workspace files,
and `words` are sent to LanguageTool as words to ignore. All fields are
optional; defaults are `de-DE`, `false`, and empty lists.

## Development

Run `npm install`, then `npm run compile` to type-check and build the extension.
Run `npm test` to type-check and run the TypeScript tests in the VS Code
Extension Host.

## License

MIT
