export interface Replacement {
  value: string;
}

export interface Match {
  message: string;
  shortMessage?: string;
  offset: number;
  length: number;
  replacements: Replacement[];
  rule: {
    id: string;
    description: string;
  };
}

export interface Response {
  matches: Match[];
}

export interface GrammarIgnoreOptions {
  html: boolean;
  style: boolean;
  frontmatter: boolean;
  markdownLinks: boolean;
}

export type GrammarRuleOptions = Record<string, boolean>;

export type DebounceTimer = ReturnType<typeof setTimeout>;
