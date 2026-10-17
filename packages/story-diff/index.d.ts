// Types for story-diff. Copyright (c) 2026 LFC Foundry. MIT License.

/** The story as JSON text or as an object. Only `id`, `title`, `author`, `start`, `items`, `givens`, `game`, `langs` and `passages` are looked at. */
export type StoryCopy = string | { id?: string; passages?: { id: string; name?: string }[]; [key: string]: unknown };

/**
 * What changed between two copies of a story, in plain words. `text` is a short label such as "Add page “The Cellar”" or "Delete a choice on “Start”".
 * `pid` is the id of the page most worth showing (the one that changed, was added or was deleted), or '' when no single page is involved.
 * It names the first kind of change it finds, not every change. Never throws: copies it cannot read give "Edit the story".
 */
export function describeChange(before: StoryCopy, after: StoryCopy): { text: string; pid: string };
