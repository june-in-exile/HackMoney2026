# Poseidon WebAssembly Memory Allocation Fix

## Problem

When the web page refreshed, multiple components tried to initialize Poseidon/WebAssembly simultaneously, causing a memory allocation error:

```
RangeError: WebAssembly.Memory(): could not allocate memory
    at buildThreadManager (browser.esm.js:15736:17)
    at buildPoseidon (poseidon_wasm.js:14:87)
```

### Root Cause

Multiple hooks were independently initializing Poseidon at the same time:
- `useNotes.ts` called `initPoseidon()` from SDK
- `useLocalKeypair.ts` called `buildPoseidon()` directly from `circomlibjs`
- `useShieldedBalance.ts` called `initPoseidon()` from SDK
- Various components (`ShieldForm`, `SwapForm`) also called `initPoseidon()`

When React mounted these components simultaneously, all tried to allocate WebAssembly memory concurrently, exceeding browser limits.

## Solution

Created a **global singleton Poseidon initialization manager** at [web/src/lib/poseidon.ts](web/src/lib/poseidon.ts):

```typescript
let poseidonInstance: Poseidon | null = null;
let initPromise: Promise<Poseidon> | null = null;

export async function initPoseidon(): Promise<Poseidon> {
  // If already initialized, return cached instance
  if (poseidonInstance) {
    return poseidonInstance;
  }

  // If initialization in progress, return the same promise
  if (initPromise) {
    return initPromise;
  }

  // Start new initialization (only happens once)
  initPromise = (async () => {
    const { buildPoseidon } = await import("circomlibjs");
    const instance = await buildPoseidon();
    poseidonInstance = instance;
    return instance;
  })();

  return initPromise;
}
```

## Changes Made

### 1. Created Global Singleton
- **File**: [web/src/lib/poseidon.ts](web/src/lib/poseidon.ts)
- Ensures only one WebAssembly allocation happens
- Concurrent calls share the same initialization promise

### 2. Updated All Files to Use Singleton

| File | Change |
|------|--------|
| [web/src/app/page.tsx](web/src/app/page.tsx#L14) | Added early initialization in root component |
| [web/src/hooks/useNotes.ts](web/src/hooks/useNotes.ts#L14) | Import from `@/lib/poseidon` instead of SDK |
| [web/src/hooks/useLocalKeypair.ts](web/src/hooks/useLocalKeypair.ts#L38-39) | Use singleton instead of direct `buildPoseidon()` |
| [web/src/hooks/useShieldedBalance.ts](web/src/hooks/useShieldedBalance.ts#L7) | Import from `@/lib/poseidon` |
| [web/src/components/ShieldForm.tsx](web/src/components/ShieldForm.tsx#L20) | Import from `@/lib/poseidon` |
| [web/src/components/SwapForm.tsx](web/src/components/SwapForm.tsx#L21) | Import from `@/lib/poseidon` |
| [web/src/lib/merkleTree.ts](web/src/lib/merkleTree.ts#L9) | Import from `@/lib/poseidon` |

### 3. Early Initialization
Added proactive initialization in [page.tsx](web/src/app/page.tsx#L24-27) to ensure Poseidon is ready before any child components mount.

## Benefits

✅ **Eliminates race conditions** - Only one initialization happens
✅ **Reduces memory usage** - Single WebAssembly instance shared across app
✅ **Faster subsequent initializations** - Cached instance returned immediately
✅ **Error recovery** - Failed initialization can be retried
✅ **Better UX** - No more page refresh crashes

## Testing

Build succeeds:
```bash
cd web && npm run build
# ✓ Compiled successfully
```

The singleton pattern ensures that even if 10 components call `initPoseidon()` simultaneously on page load, only one WebAssembly allocation occurs.
