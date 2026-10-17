// Types for story-outline (the story model types are the same as in story-format). Copyright (c) 2026 LFC Foundry. MIT License.
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
  id: string; name: string; heading: string; ending: boolean; valence: Valence; todo: boolean; color: '' | 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | 'gray'; note: string;
  blocks: Block[]; gives: string[]; takes: string[]; adds: Record<string, number>; sends: Record<string, string>; choices: Choice[];
}
export interface GameOptions { back: 'off' | 'remember' | 'reroll' | 'block'; tracker: boolean; comfort: boolean; odds: boolean; place: boolean; pal: 'paper' | 'night' | 'sepia' | 'ocean' | 'forest' | 'contrast' }
export interface Lang { id: string; name: string; code: string; t: Record<string, string> }
export interface Project {
  format: 'story-editor'; version: number; id: string; title: string; author: string; start: string; rev?: number; savedAt?: string;
  gameFont?: 'system'; lang0?: string; lang0c?: string; langs?: Lang[]; game: GameOptions; items: Item[]; givens: Given[]; passages: Passage[];
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

/** An outline read into pages, before it is put into any story. */
export interface OutlinePage { name: string; ending: boolean; valence: '' | 'good' | 'bad'; texts: string[]; choices: { label: string; to: string }[] }
export interface ParsedOutline { pages: OutlinePage[]; issues: string[]; lines: number }
/** Reads an outline. Never throws; whatever could not be used is listed in `issues` in plain words. */
export function parseOutline(text: string): ParsedOutline;
/** The pages to add to `proj`: names made unique, choices pointed at pages, endings given no choices. Changes nothing in `proj`. */
export function outlinePlan(parsed: ParsedOutline, proj: Pick<Project, 'passages'>): { pages: Passage[]; empties: Passage[]; blank: Passage | null; issues: string[] };
/** A whole new story from an outline. `project` is null (and `issues` says why) if the outline holds no pages. The first page is the start page. */
export function outlineToProject(text: string, title?: string): { project: Project | null; issues: string[] };
