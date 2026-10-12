// Types for story-player. Copyright (c) 2026 JNFoo. MIT License.
import type { Project, Passage } from '../story-format/index.js';
export * from '../story-check/index.js';

/** One finished game page (a string). The project is cleaned first. Options: CSS @font-face text if you want the game to carry a font. */
export function buildGame(project: unknown, opts?: { fonts?: string; fontsLite?: string }): string;
/** The same page zipped so it unzips itself when opened (smaller). Falls back to the plain page where CompressionStream is missing. */
export function buildZippedGame(project: unknown, opts?: { fonts?: string; fontsLite?: string }): Promise<string>;
export function buildGameHtml(project: Project, assets: { parts: typeof GAME_PARTS; fonts?: string; fontsLite?: string; features?: string[] }): string;
export function klFeatures(story: unknown): string[];
export function zipPage(html: string): Promise<string>;
export function zippedPage(base64OfRawDeflate: string, title: string): string;
export const GAME_PARTS: { js: { head: string; feats: Record<string, string> }; css: Record<string, string> };

export interface Session {
  readonly page: Passage;
  /** the paragraphs the player sees on this page */ readonly text: string[];
  readonly ended: boolean;
  /** shown choices; locked ones cannot be picked. odds is the percent chance for a dice check, otherwise null. */
  readonly choices: { index: number; label: string; locked: boolean; why: string; odds: number | null }[];
  readonly inventory: { things: string[]; numbers: Record<string, number> };
  readonly flags: Record<string, boolean | number>;
  readonly trail: { from: string; choice: string; to: string }[];
  readonly answers: { question: string; answer: string }[];
  /** Picks the shown choice number `index`. Throws if it is locked, missing, or the story has ended. Returns the dice roll for a check. */
  choose(index: number): { roll?: number; passed?: boolean };
}
/** Plays a story from code with the game's own rules. opts.rng returns 0..1 (default Math.random); opts.givens answers the start-of-story questions; opts.from starts on a given page id. */
export function createSession(project: Project, opts?: { rng?: () => number; givens?: Record<string, string>; from?: string }): Session;
