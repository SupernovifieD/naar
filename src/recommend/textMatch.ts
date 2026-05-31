export type TextMatchMode = "phrase" | "token";

export type TextMatchTerm = {
  value: string;
  mode?: TextMatchMode;
};

export function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[./:@]/g, " ")
    .replace(/[^a-z0-9+_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenize(value: string): Set<string> {
  const normalized = normalizeText(value);
  if (normalized.length === 0) return new Set<string>();
  const output = new Set<string>(normalized.split(" ").filter(Boolean));

  for (const token of [...output]) {
    if (token.includes("-")) {
      for (const part of token.split("-")) {
        if (part) output.add(part);
      }
    }
    if (token.includes("_")) {
      for (const part of token.split("_")) {
        if (part) output.add(part);
      }
    }
  }

  return output;
}

export function containsPhrase(normalizedText: string, phrase: string): boolean {
  const normalizedPhrase = normalizeText(phrase);
  if (!normalizedPhrase) return false;
  if (normalizedText === normalizedPhrase) return true;
  const haystack = ` ${normalizedText} `;
  const needle = ` ${normalizedPhrase} `;
  return haystack.includes(needle);
}

export function containsAnyToken(tokens: Set<string>, values: string[]): boolean {
  return values.some((value) => {
    const term = normalizeText(value);
    return term ? tokens.has(term) : false;
  });
}

export function containsAllTokens(tokens: Set<string>, values: string[]): boolean {
  return values.every((value) => {
    const term = normalizeText(value);
    return term ? tokens.has(term) : false;
  });
}

export function matchesTerm(
  normalizedText: string,
  tokens: Set<string>,
  term: TextMatchTerm | string
): boolean {
  const descriptor = typeof term === "string"
    ? ({ value: term, mode: "phrase" } satisfies TextMatchTerm)
    : term;
  const mode = descriptor.mode ?? "phrase";
  const normalizedValue = normalizeText(descriptor.value);
  if (!normalizedValue) return false;

  if (mode === "token") {
    return tokens.has(normalizedValue);
  }
  return containsPhrase(normalizedText, normalizedValue);
}
