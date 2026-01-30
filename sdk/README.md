# @octopus/sdk

TypeScript SDK for Railgun on Sui privacy protocol.

## Installation

```bash
npm install @octopus/sdk
```

## Quick Start

```typescript
import {
  initPoseidon,
  generateKeypair,
  createNote,
  generateUnshieldProof,
  convertProofToSui,
  RailgunClient,
} from "@octopus/sdk";

// 1. Initialize (required once)
await initPoseidon();

// 2. Generate keypair
const keypair = generateKeypair();
console.log("Master Public Key:", keypair.masterPublicKey);

// 3. Create a note (for shielding)
const note = createNote(
  keypair.masterPublicKey,
  123456789n,  // token ID
  1000000000n  // amount (1 SUI)
);

// 4. Generate proof for unshield
const { proof, publicSignals } = await generateUnshieldProof({
  note,
  leafIndex: 0,
  pathElements,  // from Merkle tree
  keypair,
});

// 5. Convert to Sui format
const suiProof = convertProofToSui(proof, publicSignals);

// 6. Execute on Sui
const client = new RailgunClient({
  rpcUrl: "https://fullnode.testnet.sui.io:443",
  packageId: "0x...",
  poolId: "0x...",
});

await client.unshield("0x2::sui::SUI", suiProof, amount, recipient, signer);
```

## API Reference

### Initialization

```typescript
// Initialize Poseidon hash (call once at startup)
await initPoseidon();
```

### Key Management

```typescript
// Generate random keypair
const keypair = generateKeypair();

// Derive from existing spending key
const keypair = deriveKeypair(spendingKey);

// Keypair structure
interface RailgunKeypair {
  spendingKey: bigint;      // Private
  nullifyingKey: bigint;    // Private
  masterPublicKey: bigint;  // Can be shared
}
```

### Note Operations

```typescript
// Create a new note
const note = createNote(recipientMpk, tokenId, amount, random?);

// Compute nullifier (for spending)
const nullifier = computeNullifier(nullifyingKey, leafIndex);

// Build Merkle proof for single-leaf tree (testing)
const { pathElements, root } = buildSingleLeafProof(commitment);
```

### Proof Generation

```typescript
// Generate unshield proof
const { proof, publicSignals } = await generateUnshieldProof(spendInput, config?);

// Verify locally
const isValid = await verifyProofLocal(proof, publicSignals, config?);

// Convert to Sui format
const suiProof = convertProofToSui(proof, publicSignals);

// Load verification key
const vk = loadVerificationKey(vkPath?);
```

### Sui Interactions

```typescript
const client = new RailgunClient(config);

// Shield tokens
await client.shield(coinType, coinObjectId, note, recipientMpk, signer);

// Unshield tokens
await client.unshield(coinType, proof, amount, recipient, signer);

// Get pool state
const state = await client.getPoolState(coinType);
```

## Demo

Run the interactive demo:

```bash
npm run demo
```

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Run demo
npm run demo
```

## Circuit Requirements

The SDK requires compiled circuit files in `../circuits/build/`:

- `unshield_js/unshield.wasm` - Circuit WASM
- `unshield_final.zkey` - Proving key
- `unshield_vk.json` - Verification key

To compile circuits:

```bash
cd ../circuits
npm install
./compile_unshield.sh
```

## License

MIT
