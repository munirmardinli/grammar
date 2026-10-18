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

export type DebounceTimer = ReturnType<typeof setTimeout>;
