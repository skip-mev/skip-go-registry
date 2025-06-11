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

## 🛡️ How Validation Works

### Step-by-Step Process

#### 1. **Discovery Phase** 🔍
```
🔍 Comparing against main...
📁 Found 11 modified assetlist.json files since main
   Modified chains: 1, 10, 56, 137, 250, 1329, 8453, 42161, 42220, 43114, 81457

🔍 Analyzing changes in each chain...
   Chain 1: 45 assets with new/updated CoinGecko IDs
   Chain 10: 23 assets with new/updated CoinGecko IDs
   ...
📊 Total: 218 assets with CoinGecko IDs to validate
```

- **Git Analysis**: Compares current branch against main branch (not just last commit)
- **File Detection**: Finds all modified `assetlist.json` files
- **Change Detection**: For each file, compares base version vs current version to find:
  - New ERC20 assets with CoinGecko IDs
  - Existing assets where CoinGecko IDs were added/changed
- **Asset Matching**: Matches assets by contract address (primary) or symbol (fallback)

#### 2. **Data Fetching Phase** 📊
```
Fetching CoinGecko coins list...
Loaded 17,234 coins from CoinGecko
```

- **Single API Call**: Downloads complete CoinGecko `/coins/list` (no rate limits)
- **Offline Validation**: All validation happens locally after download
- **Comprehensive Database**: 17,000+ tokens across all blockchains

#### 3. **Validation Phase** ✅
```
Validating CoinGecko IDs...
[1/218] Validating CHZ (chiliz)... ✅
[2/218] Validating AAVE (aave)... ✅
[3/218] Validating SNX (havven)... ✅ (known symbol difference)
```

For each asset, the validator performs **3 checks**:

**Check 1: CoinGecko ID Existence**
- Verifies the `coingecko_id` exists in CoinGecko's database
- **FAIL**: ID doesn't exist → ❌ Invalid
- **PASS**: ID found → Continue to Check 2

**Check 2: Symbol Matching** 
- Compares our asset's symbol with CoinGecko's symbol for that ID
- **FAIL**: Symbols don't match AND not in known exceptions → ❌ Invalid  
- **PASS**: Symbols match OR known exception → Continue to Check 3

**Check 3: Data Integrity**
- Ensures asset has required fields (`asset_type`, `erc20_contract_address`, etc.)
- **FAIL**: Missing required fields → ⚠️ Error
- **PASS**: All required fields present → ✅ Valid

#### 4. **Known Symbol Exceptions** 📋
The validator handles 200+ cases where CoinGecko uses different symbols than we do:

**Why these exist:**
- **Historical IDs**: SNX uses `havven` (Synthetix's original name)
- **Descriptive names**: WBTC uses `wrapped-bitcoin`  
- **Rebrands**: MATIC became POL but CoinGecko kept `matic-network`
- **Standardization**: USDC uses `usd-coin`

**How they're validated:**
1. **Manual curation**
2. **Contract verification**: EVM tokens matched by contract address on CoinGecko platforms
3. **Manual verification**: Key tokens (SNX, WBTC, USDC) manually verified on CoinGecko
4. **Testing**: All mappings tested during bulk update of 218 assets

**Example mappings:**
```typescript
'havven': 'snx',           // Synthetix historical ID
'wrapped-bitcoin': 'wbtc', // WBTC descriptive name  
'usd-coin': 'usdc',        // USDC standardization
'ethena-usde': 'usde',     // New token naming
```

#### 5. **Reporting Phase** 📈
```
================================================================================
VALIDATION SUMMARY
================================================================================
Total validated: 218
✅ Valid: 218
❌ Invalid: 0  
⚠️  Errors: 0
================================================================================
✅ All CoinGecko IDs are valid!

📄 Detailed report saved to: validation-report.json
```

- **Real-time progress**: Shows ✅/❌/⚠️ for each asset
- **Summary statistics**: Counts of valid/invalid/errors
- **Detailed failures**: Shows exactly what's wrong for failed validations
- **JSON report**: Complete results saved for analysis
- **Exit codes**: Returns 1 if any invalid IDs found (for CI/CD)

### Validation Logic

#### Symbol Matching Rules
1. **Exact match** (case-insensitive): `USDC` = `usdc` ✅
2. **Known exceptions**: `SNX` ≠ `SNX` but `havven` maps to `snx` ✅  
3. **Unknown mismatch**: `ABC` ≠ `xyz` ❌

#### API Usage
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