/**
 * Type declarations for circomlibjs
 * This is the unified type definition used across the entire project.
 */
declare module "circomlibjs" {
  export interface F {
    toString(value: Uint8Array): string;
  }

  export interface Poseidon {
    (inputs: bigint[]): Uint8Array;
    F: F;
  }

  export function buildPoseidon(): Promise<Poseidon>;
}
