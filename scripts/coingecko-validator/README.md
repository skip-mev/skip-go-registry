# CoinGecko ID Validator

This directory contains validation tools for verifying CoinGecko IDs in the Skip Go Registry.

## 🚀 Quick Start

### For Reviewers (Recommended)
```bash
cd scripts/coingecko-validator
npm install
npm run validate
```

### For PR Summary
```bash
cd scripts/coingecko-validator
npm run summary
```

## 📁 Tools Overview

### `validate-pr-changes.ts` ⭐ **Recommended for Reviewers**
- **Purpose**: Comprehensive validation of all changes
- **What it does**: Validates every CoinGecko ID added in the PR
- **Runtime**: ~10 seconds for 280+ assets
- **Features**:
  - Uses CoinGecko `/coins/list` API (no rate limits)
  - Checks symbol matches with known exceptions
  - Generates detailed validation report
  - Exit code 1 if any invalid IDs found

### `spot-check-coingecko.ts`
- **Purpose**: Spot check sample of common tokens
- **What it does**: Validates 10 representative tokens
- **Features**: Quick confidence check with statistics

### `generate-pr-summary.sh`
- **Purpose**: Generate PR overview statistics
- **What it does**: Shows files modified, assets added, breakdown by chain

## 🛡️ Validation Logic

### Symbol Matching
The validator handles special cases where CoinGecko symbols differ from our symbols:

- `SNX` ↔ `havven` (Synthetix historical ID)
- `WBTC` ↔ `wrapped-bitcoin`
- `USDC` ↔ `usd-coin`
- `USDe` ↔ `ethena-usde`
- Many others...

### API Usage
- Uses `https://api.coingecko.com/api/v3/coins/list`
- No rate limiting (single request for full list)
- Validates against 17,000+ coins
- Offline validation after initial fetch

## 📊 Expected Results

For the bulk CoinGecko ID update PR:
- **280+ ERC20 assets** with CoinGecko IDs
- **11 EVM chains** updated
- **All major DeFi tokens** included (UNI, LINK, AAVE, SNX, etc.)

## 🔧 How to Use

### Full Validation (10 seconds)
```bash
cd scripts/coingecko-validator
npm install
npm run validate
```
**Expected output:**
```
🔍 Validating CoinGecko IDs in PR changes...
Found 280 assets with CoinGecko IDs to validate
[1/280] Validating CHZ (chiliz)... ✅
[2/280] Validating AAVE (aave)... ✅
...
VALIDATION SUMMARY
✅ Valid: 280
❌ Invalid: 0
⚠️  Errors: 0
✅ All CoinGecko IDs are valid!
```

## 🚨 Troubleshooting

### If validation fails:
1. Check the detailed error messages
2. Verify the CoinGecko ID exists: `curl https://api.coingecko.com/api/v3/coins/{id}`
3. Check for symbol mismatches in the known exceptions list

### Common issues:
- **Network errors**: Retry after a moment
- **Symbol mismatches**: Check if it's a known exception case
- **Missing IDs**: Verify the CoinGecko ID is correct

## 🎯 Quality Assurance

This validation suite ensures:
- ✅ All CoinGecko IDs exist and are valid
- ✅ Symbol mappings are correct (with known exceptions)
- ✅ No typos or invalid IDs
- ✅ Special cases handled (SNX→havven, etc.)
- ✅ Comprehensive coverage of all changes