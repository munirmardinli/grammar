# Change Log

All notable changes to the "grammar" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

### Added

- Added configurable ignore lists for English terms, technical terms, names, and abbreviations.
- Added capitalization checks after colons, with support for gender-inclusive forms and sentence starts in Markdown list items.
- Added Markdown-aware filtering for HTML, style blocks, frontmatter, and link targets.

### Changed

- Extended `.grammar.yaml` configuration and documentation for ignored terms and Markdown content.

### Fixed

- Detects repeated spaces after Markdown links while preserving Markdown hard breaks and table layout.