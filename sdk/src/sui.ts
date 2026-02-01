/**
 * Railgun on Sui - Sui Transaction Builders
 *
 * Builds and executes shield/unshield transactions on Sui.
 */

import {
  SuiClient,
  type SuiTransactionBlockResponse,
} from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { type Keypair } from "@mysten/sui/cryptography";
import { type SuiProof, type SuiVerificationKey, type SuiTransferProof, type Note } from "./types.js";
import { bigIntToBytes, encryptNote } from "./crypto.js";

/**
 * Sui client configuration
 */
export interface SuiConfig {
  /** Sui RPC endpoint */
  rpcUrl: string;
  /** Package ID of deployed railgun contract */
  packageId: string;
  /** Pool object ID (shared object) */
  poolId: string;
}

/**
 * Default testnet configuration
 */
export const TESTNET_CONFIG: Partial<SuiConfig> = {
  rpcUrl: "https://fullnode.testnet.sui.io:443",
};

/**
 * RailgunClient for interacting with the privacy pool
 */
export class RailgunClient {
  private client: SuiClient;
  private config: SuiConfig;

  constructor(config: SuiConfig) {
    this.config = config;
    this.client = new SuiClient({ url: config.rpcUrl });
  }

  /**
   * Get the Sui client instance
   */
  getClient(): SuiClient {
    return this.client;
  }

  /**
   * Create a new privacy pool (one-time setup)
   */
  async createPool<T extends string>(
    coinType: T,
    vk: SuiVerificationKey,
    signer: Keypair
  ): Promise<SuiTransactionBlockResponse> {
    const tx = new Transaction();

    tx.moveCall({
      target: `${this.config.packageId}::pool::create_shared_pool`,
      typeArguments: [coinType],
      arguments: [tx.pure("vector<u8>", Array.from(vk.vkBytes))],
    });

    return await this.client.signAndExecuteTransaction({
      signer,
      transaction: tx,
      options: { showEffects: true, showEvents: true },
    });
  }

  /**
   * Shield tokens into the privacy pool
   */
  async shield<T extends string>(
    coinType: T,
    coinObjectId: string,
    note: Note,
    recipientMpk: bigint,
    signer: Keypair
  ): Promise<SuiTransactionBlockResponse> {
    const tx = new Transaction();

    // Get commitment as bytes
    const commitmentBytes = Array.from(bigIntToBytes(note.commitment));

    // Encrypt note for recipient
    const encryptedNote = Array.from(encryptNote(note, recipientMpk));

    tx.moveCall({
      target: `${this.config.packageId}::pool::shield`,
      typeArguments: [coinType],
      arguments: [
        tx.object(this.config.poolId),
        tx.object(coinObjectId),
        tx.pure("vector<u8>", commitmentBytes),
        tx.pure("vector<u8>", encryptedNote),
      ],
    });

    return await this.client.signAndExecuteTransaction({
      signer,
      transaction: tx,
      options: { showEffects: true, showEvents: true },
    });
  }

  /**
   * Unshield tokens from the privacy pool with ZK proof
   */
  async unshield<T extends string>(
    coinType: T,
    proof: SuiProof,
    amount: bigint,
    recipient: string,
    signer: Keypair
  ): Promise<SuiTransactionBlockResponse> {
    const tx = new Transaction();

    tx.moveCall({
      target: `${this.config.packageId}::pool::unshield`,
      typeArguments: [coinType],
      arguments: [
        tx.object(this.config.poolId),
        tx.pure("vector<u8>", Array.from(proof.proofBytes)),
        tx.pure("vector<u8>", Array.from(proof.publicInputsBytes)),
        tx.pure("u64", amount.toString()),
        tx.pure("address", recipient),
      ],
    });

    return await this.client.signAndExecuteTransaction({
      signer,
      transaction: tx,
      options: { showEffects: true, showEvents: true },
    });
  }

  /**
   * Transfer tokens privately within the pool (0zk-to-0zk transfer)
   */
  async transfer<T extends string>(
    coinType: T,
    proof: SuiTransferProof,
    encryptedNotes: Uint8Array[],
    signer: Keypair
  ): Promise<SuiTransactionBlockResponse> {
    if (encryptedNotes.length !== 2) {
      throw new Error(`Expected 2 encrypted notes, got ${encryptedNotes.length}`);
    }

    const tx = new Transaction();

    tx.moveCall({
      target: `${this.config.packageId}::pool::transfer`,
      typeArguments: [coinType],
      arguments: [
        tx.object(this.config.poolId),
        tx.pure("vector<u8>", Array.from(proof.proofBytes)),
        tx.pure("vector<u8>", Array.from(proof.publicInputsBytes)),
        tx.pure(
          "vector<vector<u8>>",
          encryptedNotes.map((n) => Array.from(n))
        ),
      ],
    });

    return await this.client.signAndExecuteTransaction({
      signer,
      transaction: tx,
      options: { showEffects: true, showEvents: true },
    });
  }

  /**
   * Get current pool state
   */
  async getPoolState<T extends string>(
    coinType: T
  ): Promise<{
    merkleRoot: Uint8Array;
    noteCount: number;
    balance: bigint;
  }> {
    const pool = await this.client.getObject({
      id: this.config.poolId,
      options: { showContent: true },
    });

    if (!pool.data?.content || pool.data.content.dataType !== "moveObject") {
      throw new Error("Failed to fetch pool state");
    }

    const fields = pool.data.content.fields as Record<string, unknown>;

    // Parse merkle tree state
    const merkleTree = fields.merkle_tree as Record<string, unknown>;
    const root = merkleTree.root as number[];
    const nextIndex = Number(merkleTree.next_index);

    // Parse balance
    const balance = fields.balance as Record<string, unknown>;
    const balanceValue = BigInt((balance.value as string) || "0");

    return {
      merkleRoot: new Uint8Array(root),
      noteCount: nextIndex,
      balance: balanceValue,
    };
  }

  /**
   * Check if a nullifier has been spent
   */
  async isNullifierSpent(nullifier: bigint): Promise<boolean> {
    // This would require reading the nullifier registry from the pool
    // For now, return false (not implemented)
    console.warn("isNullifierSpent not fully implemented");
    return false;
  }

  /**
   * Query recent ShieldEvents from the pool
   * Note: WebSocket subscriptions are deprecated in Sui SDK.
   * Use polling with queryEvents instead.
   */
  async queryShieldEvents(
    limit: number = 50
  ): Promise<
    Array<{
      position: number;
      commitment: Uint8Array;
      encryptedNote: Uint8Array;
      txDigest: string;
    }>
  > {
    const events = await this.client.queryEvents({
      query: {
        MoveEventType: `${this.config.packageId}::pool::ShieldEvent`,
      },
      limit,
      order: "descending",
    });

    return events.data.map((event) => {
      const fields = event.parsedJson as Record<string, unknown>;
      return {
        position: Number(fields.position),
        commitment: new Uint8Array(fields.commitment as number[]),
        encryptedNote: new Uint8Array(fields.encrypted_note as number[]),
        txDigest: event.id.txDigest,
      };
    });
  }

  /**
   * Query recent UnshieldEvents from the pool
   */
  async queryUnshieldEvents(
    limit: number = 50
  ): Promise<
    Array<{
      nullifier: Uint8Array;
      recipient: string;
      amount: bigint;
      txDigest: string;
    }>
  > {
    const events = await this.client.queryEvents({
      query: {
        MoveEventType: `${this.config.packageId}::pool::UnshieldEvent`,
      },
      limit,
      order: "descending",
    });

    return events.data.map((event) => {
      const fields = event.parsedJson as Record<string, unknown>;
      return {
        nullifier: new Uint8Array(fields.nullifier as number[]),
        recipient: fields.recipient as string,
        amount: BigInt(fields.amount as string),
        txDigest: event.id.txDigest,
      };
    });
  }

  /**
   * Query recent TransferEvents from the pool
   */
  async queryTransferEvents(
    limit: number = 50
  ): Promise<
    Array<{
      inputNullifiers: Uint8Array[];
      outputCommitments: Uint8Array[];
      outputPositions: number[];
      encryptedNotes: Uint8Array[];
      txDigest: string;
    }>
  > {
    const events = await this.client.queryEvents({
      query: {
        MoveEventType: `${this.config.packageId}::pool::TransferEvent`,
      },
      limit,
      order: "descending",
    });

    return events.data.map((event) => {
      const fields = event.parsedJson as Record<string, unknown>;
      return {
        inputNullifiers: (fields.input_nullifiers as number[][]).map(
          (n) => new Uint8Array(n)
        ),
        outputCommitments: (fields.output_commitments as number[][]).map(
          (c) => new Uint8Array(c)
        ),
        outputPositions: (fields.output_positions as string[]).map((p) => Number(p)),
        encryptedNotes: (fields.encrypted_notes as number[][]).map(
          (n) => new Uint8Array(n)
        ),
        txDigest: event.id.txDigest,
      };
    });
  }
}

/**
 * Build a shield transaction (for manual signing)
 */
export function buildShieldTransaction<T extends string>(
  packageId: string,
  poolId: string,
  coinType: T,
  coinObjectId: string,
  commitment: Uint8Array,
  encryptedNote: Uint8Array
): Transaction {
  const tx = new Transaction();

  tx.moveCall({
    target: `${packageId}::pool::shield`,
    typeArguments: [coinType],
    arguments: [
      tx.object(poolId),
      tx.object(coinObjectId),
      tx.pure("vector<u8>", Array.from(commitment)),
      tx.pure("vector<u8>", Array.from(encryptedNote)),
    ],
  });

  return tx;
}

/**
 * Build an unshield transaction (for manual signing)
 */
export function buildUnshieldTransaction<T extends string>(
  packageId: string,
  poolId: string,
  coinType: T,
  proof: SuiProof,
  amount: bigint,
  recipient: string
): Transaction {
  const tx = new Transaction();

  tx.moveCall({
    target: `${packageId}::pool::unshield`,
    typeArguments: [coinType],
    arguments: [
      tx.object(poolId),
      tx.pure("vector<u8>", Array.from(proof.proofBytes)),
      tx.pure("vector<u8>", Array.from(proof.publicInputsBytes)),
      tx.pure("u64", amount.toString()),
      tx.pure("address", recipient),
    ],
  });

  return tx;
}

/**
 * Build a transfer transaction (for manual signing)
 */
export function buildTransferTransaction<T extends string>(
  packageId: string,
  poolId: string,
  coinType: T,
  proof: SuiTransferProof,
  encryptedNotes: Uint8Array[]
): Transaction {
  if (encryptedNotes.length !== 2) {
    throw new Error(`Expected 2 encrypted notes, got ${encryptedNotes.length}`);
  }

  const tx = new Transaction();

  tx.moveCall({
    target: `${packageId}::pool::transfer`,
    typeArguments: [coinType],
    arguments: [
      tx.object(poolId),
      tx.pure("vector<u8>", Array.from(proof.proofBytes)),
      tx.pure("vector<u8>", Array.from(proof.publicInputsBytes)),
      tx.pure(
        "vector<vector<u8>>",
        encryptedNotes.map((n) => Array.from(n))
      ),
    ],
  });

  return tx;
}

/**
 * Convert hex string to Uint8Array
 */
export function hexToBytes(hex: string): Uint8Array {
  const cleanHex = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(cleanHex.substr(i * 2, 2), 16);
  }
  return bytes;
}

/**
 * Convert Uint8Array to hex string
 */
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
