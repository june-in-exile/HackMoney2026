# Unshield Fund Loss Issue Analysis

**Status**: 🔴 CRITICAL - Fund loss vulnerability
**Date**: 2026-02-05
**Priority**: P0 - Immediate fix required

---

## Executive Summary

**Problem**: Users lose funds when unshielding amounts smaller than their note values.

**Example**:
- User has notes: 0.01 SUI and 0.02 SUI
- User wants to unshield: 0.01 SUI
- **Result**: 0.02 SUI note is destroyed, but only 0.01 SUI transferred
- **Loss**: 0.01 SUI permanently lost ❌

**Root Cause**: Architectural mismatch between circuit (proves note ownership), contract (accepts arbitrary amount), and frontend (selects largest note).

**Fix**: Frontend smart note selection + warning modal (5-6 hours, no contract/circuit changes needed)

---

## Problem Statement

用户报告了严重的资金损失问题：
- 有 0.01 SUI 和 0.02 SUI 两个 notes
- 想要 unshield 0.01 SUI
- 结果：0.02 SUI 的 note 被选中并销毁
- 实际转到用户地址的只有 0.01 SUI
- **剩余的 0.01 SUI 永久丢失**

---

## Root Cause Analysis

### 1. Note Selection Logic Issue

**File**: [frontend/src/components/UnshieldForm.tsx:99-103](../frontend/src/components/UnshieldForm.tsx#L99-L103)

```typescript
// 按金额从大到小排序
const sortedNotes = unspentNotes.sort((a, b) => Number(b.note.value - a.note.value));
// 选择第一个满足条件的 note（即最大的）
const noteToSpend = sortedNotes.find(n => n.note.value >= amountMist);
```

**问题**: 总是选择**最大的**满足条件的 note，而不考虑是否会造成资金损失。

### 2. Amount Mismatch Architecture

**核心设计缺陷** - 三层架构之间的金额处理不一致：

| 层级 | 如何处理金额 | 问题 |
|------|-------------|------|
| **Circuit** ([circuits/unshield.circom:26](../circuits/unshield.circom#L26)) | `value` 是 private input，用于计算 commitment | ❌ 不在 public inputs 中 |
| **Public Inputs** ([circuits/unshield.circom:60](../circuits/unshield.circom#L60)) | 只包含 `merkle_root` 和 `nullifier` (64 bytes) | ❌ 没有 commitment 或 value |
| **Contract** ([contracts/sources/pool.move:588](../contracts/sources/pool.move#L588)) | 接受独立的 `amount: u64` 参数 | ❌ 不验证是否等于 note value |
| **Transfer** ([contracts/sources/pool.move:619](../contracts/sources/pool.move#L619)) | 转账 `amount` 给 recipient | ⚠️ 任何金额都可以，只要 pool 余额足够 |

**资金损失流程**:

```
1. ZK Circuit 证明:
   - 用户拥有 0.02 SUI note
   - commitment = Poseidon(NPK, token, 0.02 SUI)
   - 电路验证通过 ✓

2. Public Inputs (64 bytes):
   - merkle_root (32 bytes)
   - nullifier (32 bytes)
   - ❌ commitment 是 PRIVATE，不在 public inputs 中

3. Contract Verification:
   - 验证 merkle_root 有效 ✓
   - 验证 nullifier 未使用 ✓
   - 验证 ZK proof 正确 ✓
   - 标记 nullifier 为已使用 (0.02 note 永久销毁)
   - ❌ 不验证 amount 参数是否等于 note value

4. Token Transfer:
   - 转账 amount = 0.01 SUI (用户输入)
   - ❌ 不是 note 的实际 value (0.02 SUI)

5. Result:
   - 0.02 SUI note 永久销毁 ✓
   - 用户收到 0.01 SUI ✓
   - 0.01 SUI 永久丢失 ❌❌❌
```

### 3. No Change Mechanism

- **Unshield 电路**: 1-input, 0-output 设计（不支持找零）
- **Transfer 电路**: 2-input, 2-output（可以创建找零 note）
- **结论**: Unshield 不支持部分 unshield + 找零

---

## Recommended Solution: Phase 1 (Immediate Fix)

**Timeline**: 5-6 hours
**Risk**: Low
**Breaking Changes**: None

**Strategy**: Smart note selection + mandatory warning modal

### Why This Approach?

✅ **No circuit recompilation** (saves 30-60 min)
✅ **No contract redeployment** (reduces risk)
✅ **Quick implementation** (5-6 hours)
✅ **Eliminates accidental fund loss**
✅ **Can iterate post-hackathon**

### Implementation Overview

1. **Smart Note Selection**:
   - Priority 1: Select exact-match note (value === amount)
   - Priority 2: Select smallest suitable note (minimize loss)
   - Never select note > amount without explicit confirmation

2. **Warning Modal**:
   - Bright red UI with fund loss calculation
   - Clear guidance to use Transfer instead
   - Require explicit "I Understand" confirmation

3. **UI Enhancements**:
   - Show all available notes with amounts
   - Mark exact matches with green checkmark
   - Add helper tips about Transfer tab

---

## Critical Files to Modify

### Primary Changes

1. **[frontend/src/components/UnshieldForm.tsx:99-160](../frontend/src/components/UnshieldForm.tsx#L99-L160)**
   - Refactor note selection logic (lines 99-110)
   - Split submission into prepare + execute phases
   - Add warning state management
   - Update form UI with helper text

2. **[frontend/src/components/FundLossWarning.tsx](../frontend/src/components/FundLossWarning.tsx)** (new)
   - Create reusable warning modal component
   - Bright red design with clear fund loss calculation
   - Alternative action guidance (use Transfer instead)

### Supporting Changes

3. **[frontend/src/lib/utils.ts](../frontend/src/lib/utils.ts)**
   - Add utility functions for note selection

### Testing

4. **[frontend/src/components/__tests__/UnshieldForm.test.tsx](../frontend/src/components/__tests__/UnshieldForm.test.tsx)** (new)
5. **[frontend/e2e/unshield-fund-loss.spec.ts](../frontend/e2e/unshield-fund-loss.spec.ts)** (new)

---

## Future Phases (Post-Hackathon)

### Phase 2: Contract Hardening
**Timeline**: 7-8 hours
- Add `commitment` to circuit public inputs (96 bytes total)
- Modify contract to verify `amount` matches commitment value
- Requires circuit recompilation and contract redeployment

### Phase 3: Circuit Redesign
**Timeline**: 3-4 days
- Redesign unshield.circom as 1-input, 2-output
- Support automatic change note creation
- Perfect UX: unshield any amount with automatic change handling

---

**Estimated Timeline**: 5-6 hours
**Breaking Changes**: None
**Deployment Required**: Frontend only (hot reload)
**Risk Level**: Low
