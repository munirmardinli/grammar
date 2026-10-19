import axios from "axios";

import type { GrammarIgnoreOptions, Match, Response } from "./type";

class LanguageCheckerService {
  private readonly apiUrl: string;
  private language: string;
  private ignoredWords: readonly string[];
  private ignoreOptions: GrammarIgnoreOptions;

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
  ) {
    this.language = language;
    this.apiUrl = apiUrl;
    this.ignoredWords = ignoredWords;
    this.ignoreOptions = ignoreOptions;
  }

  public updateConfiguration(
    language: string,
    ignoredWords: readonly string[],
    ignoreOptions: GrammarIgnoreOptions,
  ): void {
    this.language = language;
    this.ignoredWords = ignoredWords;
    this.ignoreOptions = ignoreOptions;
  }

  public async checkText(
    text: string,
    isMarkdown: boolean = false,
  ): Promise<Match[]> {
    if (!text || text.trim().length === 0) {
      return [];
    }

    const { text: checkedText, maskedRanges } =
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

      return (response.data.matches ?? []).filter((match) => {
        if (
          maskedRanges.some(
            ({ start, end }) =>
              match.offset < end && match.offset + match.length > start,
          )
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
    } catch (error) {
      console.error("LanguageCheckerService Error:", error);
      return [];
    }
  }

  private static maskIgnoredContent(
    text: string,
    isMarkdown: boolean,
    options: GrammarIgnoreOptions,
  ): { text: string; maskedRanges: Array<{ start: number; end: number }> } {
    const characters = text.split("");
    const maskedRanges: Array<{ start: number; end: number }> = [];
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
      LanguageCheckerService.maskMarkdownLinkTargets(text, maskRange);
    }

    return { text: characters.join(""), maskedRanges };
  }

  private static maskMarkdownLinkTargets(
    text: string,
    maskRange: (start: number, end: number) => void,
  ): void {
    const linkStartPattern = /!?\[([^\]\n]*)\]\(/g;
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
}

export { LanguageCheckerService };
