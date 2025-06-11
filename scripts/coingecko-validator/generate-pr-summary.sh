#!/bin/bash

echo "==================================="
echo "PR VALIDATION SUMMARY"
echo "==================================="
echo ""

# Count stats
MODIFIED_FILES=$(git diff --name-only HEAD~1 | grep assetlist.json | wc -l | tr -d ' ')
ADDED_COINGECKO=$(git diff HEAD~1 | grep "^+" | grep "coingecko_id" | wc -l | tr -d ' ')
CHAINS=$(git diff --name-only HEAD~1 | grep assetlist.json | cut -d/ -f2 | sort | uniq | wc -l | tr -d ' ')

echo "📊 Changes Overview:"
echo "  - Modified Files: $MODIFIED_FILES assetlist.json files"
echo "  - Chains Updated: $CHAINS chains"
echo "  - CoinGecko IDs Added: $ADDED_COINGECKO assets"
echo ""

echo "📍 Changes by Chain:"
git diff --name-only HEAD~1 | grep assetlist.json | cut -d/ -f2 | sort | uniq | while read chain; do
  count=$(git diff HEAD~1 -- chains/$chain/assetlist.json | grep "^+" | grep "coingecko_id" | wc -l | tr -d ' ')
  printf "  - Chain %-10s: %3s assets\n" "$chain" "$count"
done
echo ""

echo "🔍 Sample Added Tokens:"
echo "  First 10 tokens with CoinGecko IDs:"
git diff HEAD~1 | grep -B2 "coingecko_id" | grep "symbol" | grep "^+" | head -10 | sed 's/+.*"symbol": "/  - /' | sed 's/",$//'
echo ""

echo "✅ Validation Checklist:"
echo "  [ ] All entries have asset_type: 'erc20'"
echo "  [ ] All entries have erc20_contract_address"
echo "  [ ] All entries have coingecko_id"
echo "  [ ] Symbol mappings are correct"
echo "  [ ] No duplicate entries"
echo ""

echo "🛠️ To validate CoinGecko IDs, run:"
echo "  cd scripts/coingecko-validator && npm install && npm run validate"
echo ""
echo "==================================="