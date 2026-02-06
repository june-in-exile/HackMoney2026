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
