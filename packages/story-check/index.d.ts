// Types for story-check. Copyright (c) 2026 LFC Foundry. MIT License.
import type { Project } from '../story-format/index.js';
export * from '../story-format/index.js';

export interface Finding { pid: string; msg: string }
export interface PathStep { [key: string]: unknown }
export interface EndingReport {
  pid: string; name: string; heading: string; valence: '' | 'good' | 'bad';
  /** false: no player can ever get here. null: the check was cut short before it could tell. */ reachable: boolean | null;
  /** how many different situations (page + things held + numbers) can arrive here */ situations: number;
  /** one shortest way there */ path: PathStep[];
}
export interface Analysis {
  /** things that break the story: dead ends, choices to nowhere, endings nobody can reach */ problems: Finding[];
  warnings: Finding[];
  notes: Finding[];
  endings: EndingReport[];
  /** how many situations were explored */ states: number;
  grouped: boolean; pruned: boolean;
  /** true if the limit was hit before every situation was seen; verdicts that need the rest are then 'unknown', never wrong */ truncated: boolean;
  samples: unknown; explain: (...args: unknown[]) => unknown; canArrive: (...args: unknown[]) => unknown;
  /** Why can't I reach page `pid`? */ why(pid: string): { reachable: boolean | null; isStart: boolean; incoming: unknown[] };
}
/** Checks a story exactly. `limit` caps the number of situations explored (default 200000). opt.prune forces dead-number pruning on or off. */
export function analyze(project: Project, limit?: number, opt?: { prune?: boolean }): Analysis;
export interface Structure {
  label: string; tip: string; facts: string[]; forks: number; merges: number; depth: number; endings: number;
  bottlenecks: { pid: string; name: string; gates: number }[]; hubs: unknown[]; sorter: unknown; spine: string[];
}
/** The shape of the story as a map (ignores items and numbers). Cheap enough to run after every edit. */
export function analyzeStructure(project: Project): Structure;
export function virtualRefs(project: Project): { id: string; label: string }[];

/** The game rules, by name: use them to play a story yourself. `flags` is the player's state (objects, states, "v:<stat>" numbers). */
export type Flags = Record<string, boolean | number>;
export function klStatMap(items: Project['items']): Record<string, [number, number, number]>;
export function klInit(flags: Flags, st: ReturnType<typeof klStatMap>): Flags;
export function klArrive(flags: Flags, page: unknown, st: ReturnType<typeof klStatMap>): Flags;
export function klChoose(flags: Flags, choice: unknown, st: ReturnType<typeof klStatMap>): Flags;
export function klAdd(next: Flags, adds: Record<string, number>, st: ReturnType<typeof klStatMap>): void;
export function klVisibleBlocks(page: unknown, flags: Flags): unknown[];
export function klVisibleChoices(page: unknown, flags: Flags): unknown[];
export function klShown(page: unknown, flags: Flags): unknown[];
export function klCondOk(c: unknown, flags: Flags): boolean;
export function klHas(flags: Flags, id: string): boolean;
export function klTarget(flags: Flags, choice: unknown, roll: number): string;
export function klOdds(flags: Flags, check: unknown): number;
