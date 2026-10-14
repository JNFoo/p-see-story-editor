// Types for story-format. Copyright (c) 2026 JNFoo. MIT License.
export type ItemKind = 'object' | 'state' | 'stat';
export type Valence = '' | 'good' | 'bad';

export interface Item {
  id: string;
  name: string;
  kind: ItemKind;
  show: boolean;
  /** stat only */ lo?: number;
  /** stat only */ hi?: number;
  /** stat only */ start?: number;
  names?: { when: string; name: string }[];
}
export interface Given { id: string; question: string; options: string[] }
export interface Block { text: string; needs: string[]; forbid: string[]; orPrev: boolean }
export interface Check { stat: string; target: number; fail: string }
export interface Choice {
  label: string;
  /** id of the page it leads to; '' = nowhere yet */ to: string;
  needs: string[]; forbid: string[]; gives: string[]; takes: string[];
  adds: Record<string, number>;
  check: Check | null;
  lock: boolean;
  why: string;
}
export interface Passage {
  id: string; name: string; heading: string; ending: boolean; valence: Valence; todo: boolean;
  blocks: Block[]; gives: string[]; takes: string[]; adds: Record<string, number>; sends: Record<string, string>; choices: Choice[];
}
export interface GameOptions { back: 'off' | 'remember' | 'reroll' | 'block'; tracker: boolean; comfort: boolean; odds: boolean; place: boolean; pal: 'paper' | 'night' | 'sepia' | 'ocean' | 'forest' | 'contrast' }
export interface Project {
  format: 'story-editor'; version: number; id: string; title: string; author: string; start: string; rev?: number; savedAt?: string;
  gameFont?: 'system'; game: GameOptions; items: Item[]; givens: Given[]; passages: Passage[];
}

export function makeProject(title?: string): Project;
export function makePassage(name?: string): Passage;
export function makeChoice(label?: string, to?: string): Choice;
export function makeBlock(text?: string): Block;
export function makeItem(name?: string, kind?: ItemKind): Item;
/** Cleans anything (old, hand-written, damaged, hostile) into a valid Project. Throws Error('This file is not a story backup.') if there are no passages. */
export function normalizeProject(raw: unknown): Project;
export function cleanGame(game?: Partial<GameOptions>): GameOptions;
export function kindOf(item: unknown): ItemKind;
/** The virtual condition id meaning "stat `id` is `n` or more". */
export function statTest(id: string, n: number): string;
export function parseStatTest(id: string): { stat: string; n: number } | null;
export function givenOf(project: Project, stateId: string): Given | null;
export function condSummary(project: Project, c: { needs?: string[]; forbid?: string[] }): string;

/** Reads the plain-text story format ([[page]], text, -> label => target | needs: item). `notes` explain anything that was changed. */
export function parseLegacy(text: string): { project: Project; notes: string[] };
/** The compact data a game needs (no editor-only fields). */
export function exportStory(project: Project): Record<string, unknown>;
export function klFingerprint(project: Project): string;
export function klShortIds(story: Record<string, unknown>): Record<string, unknown>;

export interface Found { pid: string; field: 'name' | 'heading' | 'text' | 'label' | 'why'; i: number; pos: number; len: number }
export function storyFind(project: Project, query: string, opt?: { matchCase?: boolean; whole?: boolean }): Found[];
/** Replaces in place; returns how many were changed. `only` is one result of storyFind. */
export function storyReplace(project: Project, query: string, replacement: string, opt?: { matchCase?: boolean; whole?: boolean }, only?: Found): number;
export function storyOrder(project: Project): { id: string; depth: number }[];
/** The whole story as Markdown. */
export function storyManuscript(project: Project): string;
export function storyStats(project: Project): { pages: number; items: number; givens: number; choices: number; words: number; good: number; bad: number };

export const STARTERS: { name: string; shape: string; blurb: string; make: () => Project }[];
export const FIELD_CONTRACT: Record<string, { rules: string[]; display: string[] }>;
export const GAME_DEFAULTS: GameOptions;
export const GAME_OPTIONS: { key: keyof GameOptions; kind: 'flag' | 'choice'; def: unknown; feature: string; label?: string; hint?: string }[];
export const BACK_MODES: string[];
export const PALETTES: Record<string, unknown>;
export const STAT_MIN: number;
export const STAT_MAX: number;
