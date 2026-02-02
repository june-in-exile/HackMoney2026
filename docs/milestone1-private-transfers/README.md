# Milestone 1: Private Transfers (0zk-to-0zk)

## Overview

Enable private peer-to-peer transfers between shielded addresses without exiting the privacy pool. Users can send tokens to other users' shielded addresses while keeping sender, recipient, and amount completely private.

## Why This Feature?

**Current Limitation:**

- Users can only shield (public→private) or unshield (private→public)
- Every transaction requires exiting the privacy pool
- Transaction graph analysis can link deposits to withdrawals

**With Private Transfers:**

- Users transact within the privacy pool indefinitely
- Increases anonymity set size (more transactions = better privacy)
- Enables privacy-preserving payments and commerce
- Foundation for all other privacy features (DeFi, relayer network)

## ⚠️ MVP Limitations & Warnings

### 1. Viewing Key Derivation from MPK (Temporary)

**Problem:**
In production, users should share their viewing public key explicitly. However, for MVP testing simplicity, we use `mpkToViewingPublicKeyUnsafe(mpk)` which deterministically derives a viewing public key from MPK.

**Why This is NOT Secure:**

- Anyone with recipient's MPK can compute their viewing public key
- However, only the owner (with spending key) can derive the matching private key to decrypt
- This creates a chicken-and-egg problem for proper ECDH

**For Production:**

- Recipients should export and share their viewing public key: `deriveViewingPublicKey(spendingKey)`
- Senders use the explicitly shared viewing PK for encryption
- Update UI to accept viewing PK as input (64-char hex string)

**Current Code:**

```typescript
// ⚠️ TEMPORARY - MVP only!
const recipientViewingPk = mpkToViewingPublicKeyUnsafe(recipientMpkBigInt);
```

### 2. Decryption Requires Spending Key

**Current Behavior:**
The `decryptNote()` function requires the full spending key to derive the viewing private key and decrypt. This means:

- Only the owner can decrypt their notes ✅
- Notes cannot be decrypted with viewing key alone (need spending key)

**For Auditing/View-Only Access:**
If you want to allow third parties to view notes without spending capability, you'd need to:

1. Export viewing private key separately
2. Add `decryptNoteWithViewingKey(encryptedData, viewingPrivateKey)` variant
3. Never expose spending key to auditors
