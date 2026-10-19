# Security Policy

## Supported versions

Security fixes are provided for the latest published version of the extension.
Please update to the latest version before reporting an issue.

## Reporting a vulnerability

Please do not report security vulnerabilities in public issues or discussions.
Use GitHub's **Report a vulnerability** feature on this repository to send a
private report to the maintainers. If that option is unavailable, contact the
maintainer through the contact information on the repository owner's GitHub
profile and ask for a private channel.

Include, where possible:

- The affected extension version and VS Code version.
- A description of the security impact and affected functionality.
- Reproduction steps or a minimal proof of concept.
- Any relevant configuration, with secrets and personal information removed.

Please allow maintainers reasonable time to investigate and prepare a fix
before disclosing the issue publicly. There is no security bounty program.

## Data and external services

The extension sends the contents of supported open documents to the public
LanguageTool API at `https://api.languagetool.org/v2/check` for spelling and
grammar analysis. Do not use it with confidential or sensitive text unless
sending that text to this third-party service is acceptable. Ignore settings
control which documents or words the extension checks; they do not make
transmitted text private.
