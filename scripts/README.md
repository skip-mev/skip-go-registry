# Skip Go Registry Scripts

This directory contains validation and utility scripts for maintaining the Skip Go Registry.

## Overview

The scripts are organized into two main categories:

### 1. CoinGecko Validator (`coingecko-validator/`)
Tools for validating CoinGecko IDs in asset listings. This ensures accurate price data integration.

**Key Features:**
- Validates CoinGecko IDs against the official API
- Handles known symbol mismatches (e.g., SNX → havven)
- Supports bulk validation of PR changes
- No rate limiting (uses coins list endpoint)

**Scripts:**
- `validate-pr-changes.ts` - Comprehensive validation of all changes in a PR
- `spot-check-coingecko.ts` - Quick validation of common tokens
- `generate-pr-summary.sh` - Generate PR statistics

**Usage:**
```bash
cd scripts/coingecko-validator
npm install
npm run validate    # Full PR validation
npm run spot-check  # Quick spot check
npm run summary     # PR statistics
```

### 2. Config Validator (`config-validator/`)
Schema validation for chain and asset configurations. Used by CI/CD pipelines.

**Key Features:**
- JSON schema validation for chain.json and assetlist.json
- Special validation for Initia chains (RPC/gRPC connectivity)
- Integrated with GitHub Actions workflow

**Scripts:**
- `validate-schema.ts` - Generic JSON schema validator
- `validate-initia.ts` - Initia-specific chain validation
- `validate.ts` - Wrapper script for local testing

**Usage:**
```bash
cd scripts/config-validator
npm install
# From repository root:
npx ts-node scripts/config-validator/src/validate.ts chains/1/chain.json
```

## Quick Start for Reviewers

When reviewing a PR that adds CoinGecko IDs:

```bash
cd scripts/coingecko-validator
npm install
npm run validate
```

This will:
1. Find all modified assetlist.json files
2. Extract assets with new/changed CoinGecko IDs
3. Validate each ID against CoinGecko's API
4. Report any issues with clear error messages

## Architecture

### CoinGecko Validator Flow
```
Git Diff → Extract Changes → Fetch CoinGecko List → Validate IDs → Report
```

### Config Validator Flow
```
PR Created → CI Triggered → Schema Validation → Initia Checks → Pass/Fail
```

## Key Design Decisions

1. **Offline Validation**: CoinGecko validator downloads the full coins list once, then validates offline. This avoids rate limits and speeds up validation.

2. **Symbol Mapping**: Maintains a curated list of known symbol mismatches between our registry and CoinGecko (200+ mappings).

3. **Git Integration**: Validators analyze the full branch diff against main, not just the last commit, ensuring comprehensive validation.

4. **Exit Codes**: Scripts return non-zero exit codes on validation failure, enabling CI/CD integration.

## Maintenance

### Adding New Symbol Mappings
Edit `validate-pr-changes.ts` and add to the `knownMismatches` object:
```typescript
const knownMismatches: Record<string, string> = {
  'coingecko-id': 'our-symbol',
  // ...
};
```

### Updating Schemas
Schema files are in the repository root:
- `chain.schema.json` - Standard chain configuration
- `initia.chain.schema.json` - Initia-specific chain configuration  
- `assetlist.schema.json` - Asset list configuration

## Troubleshooting

### Network Errors
- Retry after a moment
- Check internet connectivity
- Verify CoinGecko API is accessible

### Symbol Mismatches
- Check if it's a known exception in `knownMismatches`
- Verify the CoinGecko ID on their website
- Add new mapping if legitimate

### Schema Validation Failures
- Check JSON syntax
- Verify required fields are present
- Compare against existing valid files

## Future Improvements

1. **Caching**: Add persistent caching for CoinGecko data
2. **Parallel Validation**: Process multiple chains concurrently
3. **Historical Analysis**: Track CoinGecko ID changes over time
4. **Auto-fix**: Generate fix commits for common issues