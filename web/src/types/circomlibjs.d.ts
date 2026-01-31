/**
 * Type declarations for circomlibjs
 *
 * NOTE: This file mirrors the type definition in @octopus/sdk/src/circomlibjs.d.ts
 * Keep both files in sync when making changes.
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
