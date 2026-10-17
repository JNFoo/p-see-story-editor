// Types for contract-kit/core (no Node-only parts). Copyright (c) 2026 LFC Foundry. MIT License.
export interface Random { rnd(): number; int(lo: number, hi: number): number; pick<T>(list: T[]): T }
/** rnd() is in [0, 1). */
export function seeded(seed?: number): Random;

/** What one implementation said for one input: its answer, or that it threw (with the message; non-Error throws are turned into text). */
export type Side = { value: unknown; threw?: undefined } | { threw: true; error: string };

export interface Failure<I = unknown> {
  /** which run failed (1 is the first) */
  n: number;
  /** the seed that replays it */
  seed: number;
  input: I;
  a: Side;
  b: Side;
  /** only with `shrink`: the input cut down while it kept failing in the same way */
  smallest?: { input: I; a: Side; b: Side; tries: number };
}
export interface AgreeResult<I = unknown> {
  ok: boolean;
  /** how many inputs were tried (all of them when ok, up to and including the first difference otherwise) */
  runs: number;
  /** null when ok; { missing } when an `expect`ed tag never appeared */
  failure: null | Failure<I> | { missing: string[] };
  /** how many inputs had each tag (only when `tags` was given) */
  tags?: Record<string, number>;
  /** true when `seconds` ran out before all runs were done */
  stopped?: boolean;
}
export interface AgreeOptions<I = unknown> {
  generate: (random: Random) => I;
  a: (input: I) => unknown;
  b: (input: I) => unknown;
  /** the part of each answer that must match (default: all of it) */
  view?: (result: any, input: I) => unknown;
  /** default: deepEqual */
  same?: (x: unknown, y: unknown) => boolean;
  /** 'differ' (default): a throw is always a difference. 'compare': two throws with the same message agree. */
  errors?: 'differ' | 'compare';
  /** copy each side's input (default structuredClone); false to hand both sides the same object */
  clone?: false | ((input: I) => I);
  /** true to cut a failing input down; or a function listing smaller versions of a value */
  shrink?: boolean | ((value: any) => Iterable<any>);
  /** names the features an input has, for the tag counts */
  tags?: (input: I) => string[];
  /** tags that must appear at least once, or the run fails */
  expect?: string[];
  /** stop early after this many seconds */
  seconds?: number;
  runs?: number;
  seed?: number;
}
export function agree<I = unknown>(opts: AgreeOptions<I>): AgreeResult<I>;
/** Like `agree` for implementations that return promises. */
export function agreeAsync<I = unknown>(opts: AgreeOptions<I>): Promise<AgreeResult<I>>;

export function shrink<T>(input: T, fails: (candidate: T) => boolean, opts?: { candidates?: (value: any) => Iterable<any>; limit?: number }): { input: T; tries: number };
export function shrinkAsync<T>(input: T, fails: (candidate: T) => boolean | Promise<boolean>, opts?: { candidates?: (value: any) => Iterable<any>; limit?: number }): Promise<{ input: T; tries: number }>;
/** The default list of smaller versions of a value. */
export function smaller(value: any): Generator<any>;
export function deepEqual(a: unknown, b: unknown): boolean;

export function watchReads<T extends object>(obj: T, root: string, children?: Record<string, string>, reads?: Set<string>): { proxy: T; reads: Set<string> };

export type FieldTable = Record<string, { rules?: string[]; display?: string[] }>;
export function checkFieldTable(opts: { table: FieldTable; samples?: Record<string, object[]>; reads?: Set<string> }): string[];
export function checkKept(opts: { table: FieldTable; pairs?: Record<string, Array<[before: any, after: any]>> }): string[];
