/**
 * interactions/index.ts
 *
 * Public API surface for the interaction detection subsystem.
 *
 * Consumers import from here — never from interactions internals directly.
 *
 * Exports:
 *   detectInteractions  - The main entry point for interaction detection.
 *   InteractionFlag     - The output type for a single interaction flag.
 *   InteractionSeverity - The severity level union type.
 */

export { detectInteractions } from "./detectInteractions";
export type { InteractionFlag, InteractionSeverity } from "./types";
