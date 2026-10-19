import { readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";

import ignore from "ignore";
import { minimatch } from "minimatch";
import { parse } from "yaml";

import type { GrammarIgnoreOptions } from "./type";

class GrammarConfig {
  private static readonly defaultLanguage = "de-DE";
  private static readonly defaultIgnoreOptions: GrammarIgnoreOptions = {
    html: true,
    style: true,
    frontmatter: true,
    markdownLinks: true,
  };

  private constructor(
    public readonly language: string,
    public readonly useGitignore: boolean,
    public readonly ignorePaths: string[],
    public readonly words: string[],
    public readonly english: string[],
    public readonly technicalTerms: string[],
    public readonly names: string[],
    public readonly abbreviations: string[],
    public readonly ignoreOptions: GrammarIgnoreOptions,
  ) {}

  public get ignoredWords(): string[] {
    return [
      ...this.words,
      ...this.english,
      ...this.technicalTerms,
      ...this.names,
      ...this.abbreviations,
    ];
  }

  public static defaults(): GrammarConfig {
    return new GrammarConfig(
      GrammarConfig.defaultLanguage,
      false,
      [],
      [],
      [],
      [],
      [],
      [],
      { ...GrammarConfig.defaultIgnoreOptions },
    );
  }

  public static parse(content: string): GrammarConfig {
    const parsed: unknown = parse(content);

    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      throw new TypeError("The .grammar.yaml file must contain a YAML object.");
    }

    const config = parsed as Record<string, unknown>;

    if (config.language !== undefined && typeof config.language !== "string") {
      throw new TypeError(
        'The "language" value in .grammar.yaml must be a string.',
      );
    }
    if (
      config.useGitignore !== undefined &&
      typeof config.useGitignore !== "boolean"
    ) {
      throw new TypeError(
        'The "useGitignore" value in .grammar.yaml must be a boolean.',
      );
    }
    if (
      config.ignorePaths !== undefined &&
      !GrammarConfig.isStringArray(config.ignorePaths)
    ) {
      throw new TypeError(
        'The "ignorePaths" value in .grammar.yaml must be an array of strings.',
      );
    }
    if (
      config.words !== undefined &&
      !GrammarConfig.isStringArray(config.words)
    ) {
      throw new TypeError(
        'The "words" value in .grammar.yaml must be an array of strings.',
      );
    }
    if (
      config.english !== undefined &&
      !GrammarConfig.isStringArray(config.english)
    ) {
      throw new TypeError(
        'The "english" value in .grammar.yaml must be an array of strings.',
      );
    }
    if (
      config.technicalTerms !== undefined &&
      !GrammarConfig.isStringArray(config.technicalTerms)
    ) {
      throw new TypeError(
        'The "technicalTerms" value in .grammar.yaml must be an array of strings.',
      );
    }
    if (
      config.names !== undefined &&
      !GrammarConfig.isStringArray(config.names)
    ) {
      throw new TypeError(
        'The "names" value in .grammar.yaml must be an array of strings.',
      );
    }
    if (
      config.abbreviations !== undefined &&
      !GrammarConfig.isStringArray(config.abbreviations)
    ) {
      throw new TypeError(
        'The "abbreviations" value in .grammar.yaml must be an array of strings.',
      );
    }
    if (
      config.ignore !== undefined &&
      (typeof config.ignore !== "object" ||
        config.ignore === null ||
        Array.isArray(config.ignore))
    ) {
      throw new TypeError(
        'The "ignore" value in .grammar.yaml must be an object.',
      );
    }

    const ignoreOptions = {
      ...GrammarConfig.defaultIgnoreOptions,
    };
    if (config.ignore !== undefined) {
      const ignoreConfig = config.ignore as Record<string, unknown>;
      for (const key of Object.keys(ignoreOptions) as Array<
        keyof GrammarIgnoreOptions
      >) {
        const value = ignoreConfig[key];
        if (value !== undefined && typeof value !== "boolean") {
          throw new TypeError(
            `The "ignore.${key}" value in .grammar.yaml must be a boolean.`,
          );
        }
        if (typeof value === "boolean") {
          ignoreOptions[key] = value;
        }
      }
    }

    return new GrammarConfig(
      typeof config.language === "string"
        ? config.language
        : GrammarConfig.defaultLanguage,
      typeof config.useGitignore === "boolean" ? config.useGitignore : false,
      GrammarConfig.isStringArray(config.ignorePaths) ? config.ignorePaths : [],
      GrammarConfig.isStringArray(config.words) ? config.words : [],
      GrammarConfig.isStringArray(config.english) ? config.english : [],
      GrammarConfig.isStringArray(config.technicalTerms)
        ? config.technicalTerms
        : [],
      GrammarConfig.isStringArray(config.names) ? config.names : [],
      GrammarConfig.isStringArray(config.abbreviations)
        ? config.abbreviations
        : [],
      ignoreOptions,
    );
  }

  public static async load(workspacePath: string): Promise<GrammarConfig> {
    let content: string;

    try {
      content = await readFile(join(workspacePath, ".grammar.yaml"), "utf8");
    } catch (error) {
      if (GrammarConfig.isFileMissing(error)) {
        return GrammarConfig.defaults();
      }

      throw error;
    }

    return GrammarConfig.parse(content);
  }

  public static async loadGitignore(
    workspacePath: string,
  ): Promise<ReturnType<typeof ignore>> {
    try {
      const content = await readFile(join(workspacePath, ".gitignore"), "utf8");
      return ignore().add(content);
    } catch (error) {
      if (GrammarConfig.isFileMissing(error)) {
        return ignore();
      }

      throw error;
    }
  }

  public isPathIgnored(
    filePath: string,
    workspacePath: string,
    gitignore: ReturnType<typeof ignore>,
  ): boolean {
    const documentPath = relative(workspacePath, filePath);
    if (
      !documentPath ||
      documentPath === ".." ||
      documentPath.startsWith(`..${sep}`)
    ) {
      return false;
    }

    const relativePath = documentPath.split(sep).join("/");

    return (
      this.ignorePaths.some((pattern) =>
        minimatch(relativePath, pattern, { dot: true }),
      ) ||
      (this.useGitignore && gitignore.ignores(relativePath))
    );
  }

  private static isStringArray(value: unknown): value is string[] {
    return (
      Array.isArray(value) && value.every((item) => typeof item === "string")
    );
  }

  private static isFileMissing(error: unknown): boolean {
    return (
      error instanceof Error &&
      "code" in error &&
      typeof error.code === "string" &&
      error.code === "ENOENT"
    );
  }
}

export { GrammarConfig };
