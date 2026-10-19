import axios from "axios";

import type { Match, Response } from "./type";

class LanguageCheckerService {
  private readonly apiUrl: string;
  private readonly language: string;
  private readonly ignoredWords: readonly string[];

  constructor(
    language: string,
    apiUrl: string = "https://api.languagetool.org/v2/check",
    ignoredWords: readonly string[] = [],
  ) {
    this.language = language;
    this.apiUrl = apiUrl;
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

      return response.data.matches ?? [];
    } catch (error) {
      console.error("LanguageCheckerService Error:", error);
      return [];
    }
  }
}

export { LanguageCheckerService };
