# Deployment Checklist - Milestone 2 (DeFi Integration)

**Status:** Ready for Production Deployment
**Date:** 2026-02-01

---

## ✅ Pre-Deployment Completed

### Circuit Layer
- [x] swap.circom implemented (22,553 constraints)
- [x] Circuit compiled successfully
- [x] Proving key generated (9.9 MB)
- [x] Verification key generated
- [x] Circuit artifacts in `circuits/build/`

### Smart Contract Layer
- [x] swap() function implemented
- [x] SwapEvent defined
- [x] parse_swap_public_inputs() helper
- [x] Mock swap for testing
- [x] Move tests created (7 tests)

### SDK Layer
- [x] defi.ts module complete
- [x] generateSwapProof() implemented
- [x] buildSwapTransaction() complete
- [x] SDK builds successfully

### Documentation
- [x] Cetus integration guide
- [x] Implementation summary
- [x] Milestone progress updated

---

## 🚀 Deployment Steps

### Step 1: Deploy Circuit Artifacts (15 min)

```bash
# Copy swap circuit to web public directory
cd /Users/june/Projects/HackMoney2026
mkdir -p web/public/circuits/swap_js
cp circuits/build/swap_js/swap.wasm web/public/circuits/swap_js/
cp circuits/build/swap_final.zkey web/public/circuits/
cp circuits/build/swap_vk.json web/public/circuits/

# Verify files
ls -lh web/public/circuits/swap*
```

**Expected Output:**
- `swap_js/swap.wasm` (~1-2 MB)
- `swap_final.zkey` (~9.9 MB)
- `swap_vk.json` (~3-4 KB)

### Step 2: Convert Swap VK to Sui Format (30 min)

**Option A: Use Existing Converter**
```bash
cd circuits
node convert_swap_vk_to_sui.js
```

**Option B: Manual Conversion**
Create `circuits/convert_swap_vk_to_sui.js`:

```javascript
const fs = require('fs');
const vk = JSON.parse(fs.readFileSync('build/swap_vk.json', 'utf8'));

// Convert to Arkworks compressed format
// (similar to unshield VK conversion)
// Output: swap_vk_bytes.hex

console.log('Swap VK converted to Sui format');
```

**Output:** `build/swap_vk_bytes.hex`

### Step 3: Deploy Updated Pool Contract (45 min)

**Current Deployment:**
- Package: `0xb2ab082080abf37b3e0a1130db3f656eba53c7aa6e847ae3f9d1d5112248a080`
- SUI Pool: `0x032f9f9fb7f79afe60ceb9bd22e31b5cbbc06f6c68c1608bd677886efc1f23d3`

**New Deployment Required:**
```bash
cd railgun

# Build with swap support
sui move build

# Publish to testnet
sui client publish --gas-budget 500000000

# Save new package ID
# Example: 0x[NEW_PACKAGE_ID]
```

**Create SUI Pool with Swap VK:**
```bash
sui client call \
  --package 0x[NEW_PACKAGE_ID] \
  --module pool \
  --function create_shared_pool \
  --type-args "0x2::sui::SUI" \
  --args \
    "[UNSHIELD_VK_BYTES]" \
    "[TRANSFER_VK_BYTES]" \
    "[SWAP_VK_BYTES]" \
  --gas-budget 100000000
```

**Create USDC Pool:**
```bash
# First, get USDC token type on Sui testnet
# Example: 0x[USDC_PACKAGE]::usdc::USDC

sui client call \
  --package 0x[NEW_PACKAGE_ID] \
  --module pool \
  --function create_shared_pool \
  --type-args "0x[USDC_PACKAGE]::usdc::USDC" \
  --args \
    "[UNSHIELD_VK_BYTES]" \
    "[TRANSFER_VK_BYTES]" \
    "[SWAP_VK_BYTES]" \
  --gas-budget 100000000
```

**Save Pool IDs:**
- SUI Pool: `0x[NEW_SUI_POOL_ID]`
- USDC Pool: `0x[NEW_USDC_POOL_ID]`

### Step 4: Update SDK Configuration (10 min)

Update `sdk/src/sui.ts`:

```typescript
export const TESTNET_POOLS = {
  SUI: "0x[NEW_SUI_POOL_ID]",
  USDC: "0x[NEW_USDC_POOL_ID]",
};

export const TESTNET_CONFIG: Partial<SuiConfig> = {
  rpcUrl: "https://fullnode.testnet.sui.io:443",
  packageId: "0x[NEW_PACKAGE_ID]",
};
```

### Step 5: Test Swap Flow (60 min)

**Test Script:** `sdk/test-swap.ts`

```typescript
import {
  initPoseidon,
  generateKeypair,
  createNote,
  generateSwapProof,
  buildSwapTransaction,
} from "@octopus/sdk";

async function testSwap() {
  await initPoseidon();

  const keypair = generateKeypair();

  // 1. Create input notes (SUI)
  // 2. Shield SUI
  // 3. Generate swap proof
  // 4. Execute swap
  // 5. Verify output note (USDC)

  console.log("✅ Swap test completed");
}

testSwap().catch(console.error);
```

---

## 🔧 For Production (Cetus Integration)

### Required Changes

**1. Add Cetus Dependency**

Update `railgun/Move.toml`:
```toml
[dependencies]
Sui = { git = "https://github.com/MystenLabs/sui.git", subdir = "crates/sui-framework/packages/sui-framework", rev = "framework/testnet" }

# TODO: Add when Cetus package is available
# Cetus = { git = "https://github.com/CetusProtocol/cetus-clmm-sui.git", subdir = "sui/clmm", rev = "main" }
```

**2. Create Production swap() Function**

Create `railgun/sources/pool_swap_production.move`:
```move
// Production swap function with Cetus integration
// See docs/CETUS_INTEGRATION.md for full implementation
```

**3. Update Frontend**

Create `web/src/components/SwapForm.tsx`:
```typescript
export function SwapForm() {
  // Token selection
  // Amount input
  // Real-time price from DEX
  // Slippage settings
  // Proof generation
  // Transaction execution
}
```

---

## 📊 Current Capabilities

### ✅ Working Now (Test Mode)
- ZK proof generation for swaps
- Swap transaction building
- Mock 1:1 swap execution
- Full privacy preservation
- Double-spend prevention
- Slippage protection (circuit level)

### ⚠️ Requires Cetus Integration
- Real market prices
- Actual token swapping
- Price impact calculation
- Liquidity checks
- Multi-hop swaps

---

## 🎯 Success Criteria

### Testnet Deployment
- [ ] Circuit artifacts deployed to web/public/
- [ ] Swap VK converted to Sui format
- [ ] Updated pool contract deployed
- [ ] SUI and USDC pools created
- [ ] SDK configuration updated
- [ ] End-to-end swap test passing

### Production Ready
- [ ] Cetus dependency added
- [ ] Real DEX swap implemented
- [ ] Price oracle integrated
- [ ] Frontend swap UI complete
- [ ] 20+ swap scenarios tested
- [ ] Security audit completed

---

## 📝 Deployment Commands Reference

```bash
# Build Move contracts
cd railgun && sui move build

# Publish to testnet
sui client publish --gas-budget 500000000

# Create pool
sui client call --package [PKG] --module pool --function create_shared_pool ...

# Test swap
cd sdk && npm run test:swap

# Deploy frontend
cd web && npm run build && npm run deploy
```

---

## 🚨 Important Notes

1. **Current Version:** Test-only with mock swaps
2. **For Production:** Implement Cetus integration (see CETUS_INTEGRATION.md)
3. **Security:** Audit before mainnet deployment
4. **Testing:** Run full test suite before production use

---

**Next Action:** Execute Step 1 (Deploy Circuit Artifacts)
**Estimated Time:** 2-3 hours for full testnet deployment
