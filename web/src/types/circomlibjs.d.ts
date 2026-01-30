declare module "circomlibjs" {
  export interface PoseidonFn {
    (inputs: bigint[]): Uint8Array;
    F: {
      toString(value: Uint8Array): string;
    };
  }

  export function buildPoseidon(): Promise<PoseidonFn>;
}
