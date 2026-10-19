import axios from "axios";

import type {
  GrammarIgnoreOptions,
  GrammarRuleOptions,
  Match,
  Response,
} from "./type";

class LanguageCheckerService {
  private readonly apiUrl: string;
  private language: string;
  private ignoredWords: readonly string[];
  private ignoreOptions: GrammarIgnoreOptions;
  private rules: GrammarRuleOptions;

  constructor(
    language: string,
    apiUrl: string = "https://api.languagetool.org/v2/check",
    ignoredWords: readonly string[] = [],
    ignoreOptions: GrammarIgnoreOptions = {
      html: true,
      style: true,
      frontmatter: true,
      markdownLinks: true,
    },
    rules: GrammarRuleOptions = {},
  ) {
    this.language = language;
    this.apiUrl = apiUrl;
    this.ignoredWords = ignoredWords;
    this.ignoreOptions = ignoreOptions;
    this.rules = rules;
  }

  public updateConfiguration(
    language: string,
    ignoredWords: readonly string[],
    ignoreOptions: GrammarIgnoreOptions,
    rules: GrammarRuleOptions = {},
  ): void {
    this.language = language;
    this.ignoredWords = ignoredWords;
    this.ignoreOptions = ignoreOptions;
    this.rules = rules;
  }

  public async checkText(
    text: string,
    isMarkdown: boolean = false,
  ): Promise<Match[]> {
    if (!text || text.trim().length === 0) {
      return [];
    }

    const { text: checkedText, maskedRanges, markdownLinkEnds } =
      LanguageCheckerService.maskIgnoredContent(
        text,
        isMarkdown,
        this.ignoreOptions,
      );

    try {
      const params = new URLSearchParams();
      params.append("text", checkedText);
      params.append("language", this.language);
      for (const word of this.ignoredWords) {
        params.append("ignoredWords", word);
      }

      const response = await axios.post<Response>(this.apiUrl, params, {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        timeout: 5000,
      });

      const ignoredWords = new Set(
        this.ignoredWords.map((word) => word.trim().toLowerCase()),
      );
      const colonStarts = LanguageCheckerService.getColonStarts(checkedText);
      const markdownListItemStarts = isMarkdown
        ? LanguageCheckerService.getMarkdownListItemStarts(text)
        : [];
      const localMatches = colonStarts
        .filter(
          ({ offset, character }) =>
            character === character.toLowerCase() &&
            !LanguageCheckerService.isGenderColonForm(checkedText, offset),
        )
        .map(({ offset, character }): Match => ({
          message: "Nach einem Doppelpunkt wird der nächste Wortanfang großgeschrieben.",
          offset,
          length: 1,
          replacements: [{ value: character.toUpperCase() }],
          rule: {
            id: "COLON_CAPITALIZATION",
            description: "Großschreibung nach Doppelpunkt",
          },
        }));
      const linkWhitespaceMatches = markdownLinkEnds.flatMap(
        (end): Match[] => {
          const whitespace = /^ {2,}(?=\S)/.exec(text.slice(end));
          if (!whitespace) {
            return [];
          }

          const offset = end;
          const length = whitespace[0].length;
          if (
            maskedRanges.some(
              (range) => offset < range.end && offset + length > range.start,
            )
          ) {
            return [];
          }

          return [
            {
              message: "Mehrere Leerzeichen nach einem Markdown-Link.",
              offset,
              length,
              replacements: [{ value: " " }],
              rule: {
                id: "WHITESPACE_RULE",
                description: "Mehrere Leerzeichen",
              },
            },
          ];
        },
      ).filter(({ rule }) => this.rules[rule.id] !== false);

      const remoteMatches = (response.data.matches ?? []).filter((match) => {
        if (this.rules[match.rule.id] === false) {
          return false;
        }

        if (
          maskedRanges.some(
            ({ start, end }) =>
              match.offset < end && match.offset + match.length > start,
          )
        ) {
          return false;
        }

        if (
          linkWhitespaceMatches.some(
            ({ offset, length }) =>
              match.offset < offset + length &&
              match.offset + match.length > offset &&
              /^\s+$/.test(
                checkedText.slice(match.offset, match.offset + match.length),
              ),
          )
        ) {
          return false;
        }

        if (
          isMarkdown &&
          /^\s+$/.test(
            text.slice(match.offset, match.offset + match.length),
          ) &&
          LanguageCheckerService.isMarkdownHardBreak(text, match.offset, match.length)
        ) {
          return false;
        }

        if (
          markdownListItemStarts.some(
            (offset) =>
              match.offset <= offset &&
              match.offset + match.length > offset &&
              checkedText[offset] === checkedText[offset].toUpperCase(),
          ) &&
          LanguageCheckerService.isCapitalizationMatch(match)
        ) {
          return false;
        }

        if (
          colonStarts.some(
            ({ offset, length }) =>
              match.offset < offset + length &&
              match.offset + match.length > offset,
          ) &&
          LanguageCheckerService.isCapitalizationMatch(match)
        ) {
          return false;
        }

        const matchedText = checkedText
          .slice(match.offset, match.offset + match.length)
          .trim()
          .toLowerCase();
        if (ignoredWords.has(matchedText)) {
          return false;
        }

        return !(
          isMarkdown &&
          /^\s+$/.test(
            checkedText.slice(match.offset, match.offset + match.length),
          ) &&
          LanguageCheckerService.isMarkdownTableLayout(text, match.offset)
        );
      });

      return [
        ...remoteMatches,
        ...localMatches,
        ...linkWhitespaceMatches,
      ]
        .filter(({ rule }) => this.rules[rule.id] !== false)
        .sort((left, right) => left.offset - right.offset);
    } catch (error) {
      console.error("LanguageCheckerService Error:", error);
      return [];
    }
  }

  private static maskIgnoredContent(
    text: string,
    isMarkdown: boolean,
    options: GrammarIgnoreOptions,
  ): {
    text: string;
    maskedRanges: Array<{ start: number; end: number }>;
    markdownLinkEnds: number[];
  } {
    const characters = text.split("");
    const maskedRanges: Array<{ start: number; end: number }> = [];
    let markdownLinkEnds: number[] = [];
    const maskRange = (start: number, end: number): void => {
      for (let index = start; index < end; index += 1) {
        if (characters[index] !== "\n" && characters[index] !== "\r") {
          characters[index] = "-";
        }
      }
      maskedRanges.push({ start, end });
    };

    if (options.frontmatter && isMarkdown) {
      const frontmatter =
        /^(?:\uFEFF)?---[ \t]*\r?\n[\s\S]*?^(?:---|\.\.\.)[ \t]*(?:\r?$)/m.exec(
          text,
        );
      if (frontmatter) {
        maskRange(frontmatter.index, frontmatter.index + frontmatter[0].length);
      }
    }

    if (options.style) {
      const styleBlocks = /<style\b[^>]*>[\s\S]*?<\/style\s*>/gi;
      for (const match of text.matchAll(styleBlocks)) {
        const start = match.index;
        if (start !== undefined) {
          maskRange(start, start + match[0].length);
        }
      }
    }

    if (options.html) {
      const htmlMarkup =
        /<!--[\s\S]*?-->|<\/?[A-Za-z][A-Za-z0-9:-]*(?:\s+(?:"[^"]*"|'[^']*'|[^'">])*)?\s*\/?>/g;
      for (const match of text.matchAll(htmlMarkup)) {
        const start = match.index;
        if (start !== undefined) {
          maskRange(start, start + match[0].length);
        }
      }
    }

    if (options.markdownLinks && isMarkdown) {
      markdownLinkEnds = LanguageCheckerService.maskMarkdownLinkTargets(
        text,
        maskRange,
      );
      LanguageCheckerService.maskObsidianLinkTargets(text, maskRange);
    }

    return { text: characters.join(""), maskedRanges, markdownLinkEnds };
  }

  private static maskMarkdownLinkTargets(
    text: string,
    maskRange: (start: number, end: number) => void,
  ): number[] {
    const linkStartPattern = /!?\[([^\]\n]*)\]\(/g;
    const linkEnds: number[] = [];
    for (const match of text.matchAll(linkStartPattern)) {
      const start = match.index;
      if (start === undefined) {
        continue;
      }

      const labelStart = start + match[0].indexOf("[") + 1;
      const labelEnd = labelStart + match[1].length;
      let depth = 1;
      let end = labelEnd + 2;
      let escaped = false;

      for (; end < text.length; end += 1) {
        const character = text[end];
        if (escaped) {
          escaped = false;
        } else if (character === "\\") {
          escaped = true;
        } else if (character === "(") {
          depth += 1;
        } else if (character === ")") {
          depth -= 1;
          if (depth === 0) {
            end += 1;
            break;
          }
        } else if (character === "\n") {
          break;
        }
      }

      if (depth === 0) {
        maskRange(start, labelStart);
        maskRange(labelEnd, end);
        linkEnds.push(end);
      }
    }
    return linkEnds;
  }

  private static maskObsidianLinkTargets(
    text: string,
    maskRange: (start: number, end: number) => void,
  ): void {
    const linkPattern = /\[\[([^\]\n]+)\]\]/g;
    for (const match of text.matchAll(linkPattern)) {
      const start = match.index;
      if (start === undefined) {
        continue;
      }

      const linkContent = match[1];
      const targetEnd = linkContent.indexOf("|");
      const targetStart = start + 2;
      const targetLength = targetEnd === -1 ? linkContent.length : targetEnd;
      if (targetEnd === -1) {
        maskRange(start, start + match[0].length);
      } else {
        maskRange(start, targetStart);
        maskRange(targetStart, targetStart + targetLength + 1);
        maskRange(start + match[0].length - 2, start + match[0].length);
      }
    }
  }

  private static isMarkdownTableLayout(text: string, offset: number): boolean {
    const lines = text.split(/\r?\n/);
    const targetLine = text.slice(0, offset).split(/\r?\n/).length - 1;
    if (targetLine >= lines.length) {
      return false;
    }

    const isTableRow = (line: string): boolean => line.includes('|');
    const isTableSeparator = (line: string): boolean =>
      /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);

    return lines.some(
      (line, index) =>
        isTableSeparator(line) &&
        index > 0 &&
        isTableRow(lines[index - 1]) &&
        targetLine >= index - 1 &&
        (() => {
          let tableEnd = index;
          while (tableEnd + 1 < lines.length && isTableRow(lines[tableEnd + 1])) {
            tableEnd += 1;
          }
          return targetLine <= tableEnd;
        })()
    );
  }

  private static isMarkdownHardBreak(
    text: string,
    offset: number,
    length: number,
  ): boolean {
    const lineStart = text.lastIndexOf("\n", offset - 1) + 1;
    const lineEndIndex = text.indexOf("\n", offset);
    const lineEnd = lineEndIndex === -1 ? text.length : lineEndIndex;
    const line = text.slice(lineStart, lineEnd).replace(/\r$/, "");
    const trailingSpaces = / {2,}$/.exec(line);

    if (!trailingSpaces) {
        return false;
    }

    const hardBreakStart = lineStart + trailingSpaces.index;
    return (
        offset < lineStart + line.length &&
        offset + length > hardBreakStart
    );
  }

  private static getColonStarts(
    text: string,
  ): Array<{ offset: number; length: number; character: string }> {
    const starts: Array<{ offset: number; length: number; character: string }> =
      [];
    const pattern = /:\s*(?:[*_~`]*\s*)([A-Za-zÄÖÜäöüß])/g;
    for (const match of text.matchAll(pattern)) {
      const character = match[1];
      const offset = match.index + match[0].lastIndexOf(character);
      starts.push({ offset, length: 1, character });
    }
    return starts;
  }

  private static isGenderColonForm(text: string, followingOffset: number): boolean {
    const colonOffset = text.lastIndexOf(":", followingOffset);
    const precedingCharacter = text.slice(colonOffset - 1, colonOffset);
    const between = text.slice(colonOffset + 1, followingOffset);

    return (
      colonOffset >= 1 &&
      /\p{L}/u.test(precedingCharacter) &&
      /^[*_~`]*$/.test(between)
    );
  }

  private static getMarkdownListItemStarts(text: string): number[] {
    const starts: number[] = [];
    const listItem = /^[ \t]{0,3}(?:[-+*]|\d{1,9}[.)])[ \t]+[*_~`]*/gmu;

    for (const match of text.matchAll(listItem)) {
      const offset = match.index + match[0].length;
      if (/\p{L}/u.test(text[offset] ?? "")) {
        starts.push(offset);
      }
    }

    return starts;
  }

  private static isCapitalizationMatch(match: Match): boolean {
    return /case|capital|uppercase|sentence.?start|groß|gross/i.test(
      `${match.rule.id} ${match.rule.description} ${match.message}`,
    );
  }
}

export { LanguageCheckerService };
