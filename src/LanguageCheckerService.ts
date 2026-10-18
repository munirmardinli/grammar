import axios from 'axios';

import type { Match, Response } from './type';

class LanguageCheckerService {
  private readonly apiUrl: string;
  private readonly language: string;

  constructor(language: string = 'de-DE', apiUrl: string = 'https://api.languagetool.org/v2/check') {
    this.language = language;
    this.apiUrl = apiUrl;
  }

  public async checkText(text: string): Promise<Match[]> {
    if (!text || text.trim().length === 0) {
      return [];
    }

    try {
      const params = new URLSearchParams();
      params.append('text', text);
      params.append('language', this.language);

      const response = await axios.post<Response>(this.apiUrl, params, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        timeout: 5000
      });

      return response.data.matches ?? [];
    } catch (error) {
      console.error('LanguageCheckerService Error:', error);
      return [];
    }
  }
}

export { LanguageCheckerService };
