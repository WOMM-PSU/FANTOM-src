import {
  JOIN_CODE_ALPHABET,
  JOIN_CODE_LENGTH,
} from "./constants";

export type RandomInt = (maxExclusive: number) => number;

const defaultRandomInt: RandomInt = (maxExclusive) => {
  const buffer = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buffer);
  const value = buffer[0] ?? 0;
  return value % maxExclusive;
};

export function normalizeJoinCode(input: string): string {
  return input.trim().toUpperCase().replace(/[\s-]/g, "");
}

export function isValidJoinCode(input: string): boolean {
  const normalized = normalizeJoinCode(input);
  return (
    normalized.length === JOIN_CODE_LENGTH &&
    Array.from(normalized).every((character) =>
      JOIN_CODE_ALPHABET.includes(character),
    )
  );
}

export function generateJoinCode(randomInt: RandomInt = defaultRandomInt): string {
  let code = "";
  for (let index = 0; index < JOIN_CODE_LENGTH; index += 1) {
    code += JOIN_CODE_ALPHABET[randomInt(JOIN_CODE_ALPHABET.length)] ?? "";
  }
  return code;
}
