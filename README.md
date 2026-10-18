# Spell & Grammar Checker

This VS Code extension checks spelling and grammar in German text using the
LanguageTool public API. It adds diagnostics to plaintext, Markdown, and
Git-commit documents, and provides quick fixes for suggested replacements.

## Requirements

Text is sent to `https://api.languagetool.org/v2/check` for analysis. Do not use
the extension with sensitive text unless sending it to that service is
acceptable.

## Development

Run `npm install`, then `npm run compile` to type-check, lint, and build the
extension. Run `npm test` to build and execute the extension tests in VS Code.

## License

MIT
