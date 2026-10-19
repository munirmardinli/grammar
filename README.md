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
Changes to `.grammar.yaml` and `.gitignore` are watched and applied to open
documents without reloading VS Code.

## Pull request automation

Pull requests targeting `main`, including Dependabot pull requests, run the CI
tests and GitHub's CodeQL default setup. The repository requests a Copilot code review and
merges a pull request only after both checks pass and Copilot approves the
current commit. A reviewer requesting changes on the current commit blocks the
merge.

Copilot code review and the Copilot coding agent must be available to the
repository. The coding agent is automatically assigned to every non-draft pull
request, including external and Dependabot pull requests, and may push changes
to them. By default, Copilot leaves comments rather than an approving review,
so automatic merging will remain blocked until Copilot approval reviews are
enabled. A new commit requires a fresh Copilot approval and successful checks
before it can be merged.

## Development

Run `npm install`, then `npm run compile` to type-check and build the extension.
Run `npm test` to type-check and run the TypeScript tests in the VS Code
Extension Host.

## License

MIT
