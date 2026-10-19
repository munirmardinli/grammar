import axios from "axios";

import type { Match, Response } from "./type";

class LanguageCheckerService {
  private readonly apiUrl: string;
  private language: string;
  private ignoredWords: readonly string[];

  constructor(
    language: string,
    apiUrl: string = "https://api.languagetool.org/v2/check",
    ignoredWords: readonly string[] = [],
  ) {
    this.language = language;
    this.apiUrl = apiUrl;
    this.ignoredWords = ignoredWords;
  }

  public updateConfiguration(language: string, ignoredWords: readonly string[]): void {
    this.language = language;
    this.ignoredWords = ignoredWords;
  }

  public async checkText(text: string): Promise<Match[]> {
    if (!text || text.trim().length === 0) {
      return [];
    }

    try {
      const params = new URLSearchParams();
      params.append("text", text);
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
        const matchedText = text
          .slice(match.offset, match.offset + match.length)
          .trim()
          .toLowerCase();
        return !ignoredWords.has(matchedText);
      });
    } catch (error) {
      console.error("LanguageCheckerService Error:", error);
      return [];
    }
  }
}

export { LanguageCheckerService };
