// Types for contract-kit. Copyright (c) 2026 LFC Foundry. MIT License.
export * from './core';
export function guarded(file: string, args?: string[], seconds?: number): { ok: boolean; timedOut: boolean; status: number | null; signal: string | null };
