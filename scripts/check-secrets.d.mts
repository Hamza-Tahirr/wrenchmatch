// Types for scripts/check-secrets.mjs (used by tests/unit/check-secrets.test.ts).

export type SecretFinding = { line: number; kind: string; preview: string };
export type LocalSecret = { key: string; value: string };

export declare const SECRET_PATTERNS: ReadonlyArray<readonly [string, RegExp]>;
export declare function blockedPathReason(file: string): string | null;
export declare function localSecretValues(root: string): LocalSecret[];
export declare function scanText(text: string, localValues?: readonly LocalSecret[]): SecretFinding[];
export declare function main(argv?: string[]): number;
