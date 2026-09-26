// Typed IPC surface for the frontend. Always go through this module rather than
// raw `invoke` strings; `bindings.ts` is generated from the Rust commands.
export { commands, events } from "./bindings";
export type * from "./bindings";
