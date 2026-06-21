export type JumpKind = 'snake' | 'ladder';

export interface Jump {
  from: number;
  to: number;
  kind: JumpKind;
}

/** Declarative board: custom boards are new data, zero code changes. */
export interface BoardDefinition {
  size: number;
  jumps: readonly Jump[];
}
