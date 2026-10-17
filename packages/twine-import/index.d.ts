// Types for twine-import (the story model types are the same as in story-format). Copyright (c) 2026 LFC Foundry. MIT License.
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

/** One story read from a Twine file, before any conversion. */
export interface TwineStory {
  name: string; ifid: string; format: string; formatVersion: string; startName: string;
  passages: { name: string; tags: string[]; text: string }[];
  stylesheet: string; script: string;
}
export interface TwineImport {
  /** A valid story, already passed through normalizeProject. `project.author` is exactly what the Twine file names ('' if it names none). */
  project: Project;
  /** Plain-words notes: what became rules, what was kept as flagged text, what was left out, whose work it is. */
  report: string[];
  summary: { pages: number; choices: number; items: number; unfinished: number; mode: 'text' | 'rules' };
  kind: 'Twine 2 HTML' | 'Twine 1 HTML' | 'Twee';
  /** Names of every story found in the file (archives hold several). */
  stories: string[];
}
/** Reads Twine 2 HTML (published story or library archive), Twee 3 text or Twine 1 HTML. Throws an Error in plain words if the text is not a Twine story. */
export function twineRead(text: string): { kind: TwineImport['kind']; stories: TwineStory[] };
export function twineConvert(story: TwineStory, opts?: { code?: 'text' | 'rules' }): Omit<TwineImport, 'kind' | 'stories'>;
/** `code: 'rules'` (default here) turns SugarCube/Twine 1/Harlowe code into items and conditions; `'text'` keeps it as flagged words. `story` is a 0-based index into an archive. The author is never changed or supplied. */
export function importTwine(text: string, opts?: { code?: 'text' | 'rules'; story?: number }): TwineImport;
