// Typed IPC surface for the frontend. Always go through this module rather than
// raw `invoke` strings; `bindings.ts` is generated from the Rust commands.
import type { Settings as SettingsWire } from "./bindings";

export { commands, events } from "./bindings";
export type * from "./bindings";

/**
 * The wire types, tightened to what Rust actually sends:
 * - every field present: the structs are `#[serde(default)]` (so older files
 *   load), which specta renders as optional;
 * - `f64` as `number`: specta types it `number | null` because NaN serializes
 *   as null, but settings never contain NaN (validation replaces it).
 */
type Complete<T> = T extends readonly unknown[]
  ? T
  : T extends object
    ? { [K in keyof T]-?: Complete<NumberNotNull<Exclude<T[K], undefined>>> }
    : T;
type NumberNotNull<T> = [T] extends [number | null] ? (null extends T ? number : T) : T;

export type Settings = Complete<SettingsWire>;
