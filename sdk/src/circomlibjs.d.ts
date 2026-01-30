/**
 * Type declarations for circomlibjs
 */
declare module "circomlibjs" {
  export interface F {
    toString(value: unknown): string;
  }

  export interface Poseidon {
    (inputs: bigint[]): unknown;
    F: F;
  }

  export function buildPoseidon(): Promise<Poseidon>;
}
