// Types for story-map. Copyright (c) 2026 JNFoo. MIT License.
import type { Project } from '../story-format/index.js';
export * from '../story-format/index.js';

export interface MapNode { id: string; pages: string[]; run: boolean; w: number; h: number; x: number; y: number; layer: number; loose: boolean }
export interface MapEdge { from: string; to: string; srcs: { pid: string; ci: number; label: string; gated: boolean }[]; gated: boolean; kind: 'fwd' | 'back' | 'flat' | 'self'; pts: unknown[] }
export interface Layout { nodes: MapNode[]; edges: MapEdge[]; width: number; height: number; dir: 'LR' | 'TB'; order: Record<string, number>; view?: string; G?: Graph }
export interface Graph { nodes: { id: string; pages: string[]; run: boolean; w?: number; h?: number }[]; edges: unknown[]; groupOf: Record<string, string>; runs: string[][]; hidden: unknown; imp: Importance; links: { from: string; to: string }[] }
export interface Importance { choke: Record<string, boolean>; traffic: Record<string, number>; goal: unknown; spine: string[]; depth: Record<string, number> }

export const MAP_W: number;
export const MAP_H: number;
/** What to draw: boxes and arrows. opts: as (Given answers), fold (merge straight runs), open, merge (combine parallel arrows). Set n.w and n.h on every node before calling layered(). */
export function mapGraph(project: Project, opts?: { as?: Record<string, string>; fold?: boolean; open?: Record<string, boolean>; merge?: boolean }): Graph;
export function mapImportance(project: Project, ids: string[], links: { from: string; to: string }[]): Importance;
export function layered(G: Graph, opts?: { dir?: 'LR' | 'TB'; root?: string; spine?: boolean; lane?: (n: unknown) => number; prev?: Record<string, number>; gapLayer?: number; gapNode?: number }): Layout;
export function arcLayout(G: Graph, base: Layout): unknown;
export function matrixLayout(G: Graph, base: Layout): unknown;
export function shapeLayout(project: Project, G: Graph): unknown;

/** One call: graph + boxes + layered drawing. view: 'flow' (left to right, default), 'down', 'spine' (choke points on one line). */
export function layoutStory(project: Project, opts?: { view?: 'flow' | 'down' | 'spine'; as?: Record<string, string>; fold?: boolean; open?: Record<string, boolean>; merge?: boolean }): Layout;
/** A dependency-free SVG drawing of a flow/down/spine layout. */
export function toSvg(layout: Layout, project: Project): string;

export interface Playtest { runs: number; ids: string[]; paths: unknown; results: unknown; ends: unknown; visits: Record<string, number>; moves: unknown; through: unknown; outcome: { good: number; bad: number; neutral: number; stuck: number } }
/** Seeded simulated players using the game's own rules. mode: 'random' | 'first' | 'curious'. */
export function playtest(project: Project, opts?: { runs?: number; mode?: 'random' | 'first' | 'curious'; as?: Record<string, string> }): Playtest;
export function playtestCount(pt: Playtest, pick: unknown): unknown;
export function playtestFilter(pt: Playtest, sel: unknown): unknown;
export function mapMetrics(layout: Layout, ms: number, groups: Record<string, string>, prevPos: Record<string, [number, number]> | null, quick: boolean): { scores: Record<string, number | null>; raw: Record<string, number> };
export const MAP_TASKS: Record<string, { label: string; w: Record<string, number> }>;
export function mapTaskScore(scores: Record<string, number | null>, task: string): number;
export function mapReach(root: number, outs: number[][], skip: number): number[];
export function mapPlaceLine(...args: unknown[]): unknown;
export function mapCrossPairs(...args: unknown[]): unknown;
