// Types for contract-kit. Copyright (c) 2026 LFC Foundry. MIT License.
export interface Random { rnd(): number; int(lo: number, hi: number): number; pick<T>(list: T[]): T }
export function seeded(seed?: number): Random;

export interface AgreeResult<I = unknown> {
  ok: boolean;
  /** how many inputs were tried (all of them when ok, up to and including the first difference otherwise) */
  runs: number;
  failure: null | { n: number; seed: number; input: I; a: { value?: unknown; error?: string }; b: { value?: unknown; error?: string } };
}
export function agree<I = unknown>(opts: {
  generate: (random: Random) => I;
  a: (input: I) => unknown;
  b: (input: I) => unknown;
  /** the part of each answer that must match (default: all of it) */
  view?: (result: any, input: I) => unknown;
  same?: (x: unknown, y: unknown) => boolean;
  runs?: number;
  seed?: number;
}): AgreeResult<I>;

export function watchReads<T extends object>(obj: T, root: string, children?: Record<string, string>, reads?: Set<string>): { proxy: T; reads: Set<string> };

export function checkFieldTable(opts: {
  table: Record<string, { rules: string[]; display: string[] }>;
  samples?: Record<string, object[]>;
  reads?: Set<string>;
}): string[];

export function guarded(file: string, args?: string[], seconds?: number): { ok: boolean; timedOut: boolean; status: number | null };
