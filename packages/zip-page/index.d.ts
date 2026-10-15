// Types for zip-page. Copyright (c) 2026 LFC Foundry. MIT License.
/** Raw-deflate bytes -> text (RFC 1951: stored, fixed and dynamic blocks). Pure JavaScript, no dependencies. */
export function zipInflate(bytes: Uint8Array): string;
/** The small page that holds `base64OfRawDeflate` and unzips itself when opened. `title` is placed in <title> as given (escape it yourself). */
export function zippedPage(base64OfRawDeflate: string, title: string): string;
/** A finished page as a zipped page (uses CompressionStream; returns the page unchanged where that is missing). */
export function zipPage(html: string): Promise<string>;
export function escapeHtml(s: string): string;
