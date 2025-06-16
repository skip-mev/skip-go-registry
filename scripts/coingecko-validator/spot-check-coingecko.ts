#!/usr/bin/env npx tsx
import * as fs from 'fs';
import * as path from 'path';

interface SampleCheck {
  symbol: string;
  expected_id: string;
  chain_id: string;
  contract?: string;
}

// Sample of tokens to spot check - covers various types
const SAMPLE_TOKENS: SampleCheck[] = [
  // Major tokens
  { symbol: 'UNI', expected_id: 'uniswap', chain_id: '1', contract: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984' },
  { symbol: 'LINK', expected_id: 'chainlink', chain_id: '1', contract: '0x514910771AF9Ca656af840dff83E8264EcF986CA' },
  { symbol: 'AAVE', expected_id: 'aave', chain_id: '1', contract: '0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9' },
  
  // Special cases
  { symbol: 'SNX', expected_id: 'havven', chain_id: '1', contract: '0xC011a73ee8576Fb46F5E1c5751cA3B9Fe0af2a6F' },
  { symbol: 'USDe', expected_id: 'ethena-usde', chain_id: '1', contract: '0x4c9EDD5852cd905f086C759E8383e09bff1E68B3' },
  
  // Cross-chain
  { symbol: 'WBTC', expected_id: 'wrapped-bitcoin', chain_id: '10' },
  { symbol: 'frxUSD', expected_id: 'frax-usd', chain_id: '137' },
  { symbol: 'FRAX', expected_id: 'frax-share', chain_id: '1', contract: '0x3432B6A60D23Ca0dFCa7761B7ab56459D9C964D0' },
  { symbol: 'FRAX', expected_id: 'frax-share', chain_id: '10', contract: '0x67CCEA5bb16181E7b4109c9c2143c24a1c2205Be' },
  { symbol: 'FRAX', expected_id: 'frax-share', chain_id: '137', contract: '0x3e121107F6F22DA4911079845a470757aF4e1A1b' },
  { symbol: 'MKR', expected_id: 'maker', chain_id: '42161' },
  
  // agETH on multiple chains
  { symbol: 'agETH', expected_id: 'kelp-gain', chain_id: '1', contract: '0xe1B4d34E8754600962Cd944B535180Bd758E6c2e' },
  { symbol: 'agETH', expected_id: 'kelp-gain', chain_id: '10', contract: '0x1bD0Fe8E92a157D3ef66C9FB9e38621252b407c2' },
  { symbol: 'agETH', expected_id: 'kelp-gain', chain_id: '42161', contract: '0x1bD0Fe8E92a157D3ef66C9FB9e38621252b407c2' },
  
  // Stablecoins
  { symbol: 'USDC', expected_id: 'usd-coin', chain_id: '1' },
  { symbol: 'DAI', expected_id: 'dai', chain_id: '10' },
];

// Cache for CoinGecko coins list
let coinGeckoList: Array<{id: string, symbol: string, name: string}> | null = null;

async function getCoinGeckoList(): Promise<Array<{id: string, symbol: string, name: string}>> {
  if (coinGeckoList) return coinGeckoList;
  
  console.log('Fetching CoinGecko coins list...');
  const response = await fetch('https://api.coingecko.com/api/v3/coins/list');
  if (!response.ok) {
    throw new Error(`Failed to fetch CoinGecko list: ${response.status}`);
  }
  
  coinGeckoList = await response.json();
  console.log(`Loaded ${coinGeckoList!.length} coins from CoinGecko\n`);
  return coinGeckoList!;
}

async function checkCoinGeckoId(check: SampleCheck, coinsList: Array<{id: string, symbol: string, name: string}>): Promise<boolean> {
  try {
    // Find the coin in the list
    const coin = coinsList.find(c => c.id === check.expected_id);
    
    if (!coin) {
      console.log(`❌ ${check.symbol}: CoinGecko ID "${check.expected_id}" not found in coins list`);
      return false;
    }
    
    // Check symbol matches (with known exceptions)
    const symbolMatches = coin.symbol.toLowerCase() === check.symbol.toLowerCase() ||
      (check.expected_id === 'havven' && check.symbol === 'SNX') ||
      (check.expected_id === 'matic-network' && coin.symbol.toLowerCase() === 'pol') ||
      (check.expected_id === 'wrapped-bitcoin' && check.symbol === 'WBTC') ||
      (check.expected_id === 'usd-coin' && check.symbol === 'USDC') ||
      (check.expected_id === 'dai' && check.symbol === 'DAI') ||
      (check.expected_id === 'frax-usd' && check.symbol === 'frxUSD') ||
      (check.expected_id === 'frax-share' && check.symbol === 'FRAX') ||
      (check.expected_id === 'frax' && check.symbol === 'FRAX') ||
      (check.expected_id === 'maker' && check.symbol === 'MKR') ||
      (check.expected_id === 'kelp-gain' && check.symbol === 'agETH');
    
    if (!symbolMatches) {
      console.log(`⚠️  ${check.symbol}: Symbol mismatch - CoinGecko has "${coin.symbol}"`);
      return false;
    }
    
    console.log(`✅ ${check.symbol}: "${check.expected_id}" is correct (${coin.name})`);
    return true;
    
  } catch (error) {
    console.log(`❌ ${check.symbol}: Error checking - ${error}`);
    return false;
  }
}

async function spotCheck() {
  console.log('🔍 Spot-checking CoinGecko ID mappings...\n');
  
  // Get CoinGecko coins list
  const coinsList = await getCoinGeckoList();
  
  let successCount = 0;
  
  for (const check of SAMPLE_TOKENS) {
    const success = await checkCoinGeckoId(check, coinsList);
    if (success) successCount++;
  }
  
  console.log(`\n✅ ${successCount}/${SAMPLE_TOKENS.length} spot checks passed`);
  
  if (successCount < SAMPLE_TOKENS.length) {
    console.log('\n⚠️  Some mappings may need review');
    process.exit(1);
  }
}

// Also create a quick stats script
async function generateStats() {
  console.log('\n📊 Generating PR statistics...\n');
  
  try {
    // Count modified files
    const { execSync } = require('child_process');
    const modifiedFiles = execSync('git diff --name-only HEAD~1 | grep assetlist.json | wc -l', { encoding: 'utf8' }).trim();
    
    // Count added assets
    const diffOutput = execSync('git diff HEAD~1 | grep "^+" | grep "coingecko_id" | wc -l', { encoding: 'utf8' }).trim();
    
    console.log(`📁 Modified assetlist.json files: ${modifiedFiles}`);
    console.log(`🪙 Assets with CoinGecko IDs added: ${diffOutput}`);
    
    // Show breakdown by chain
    console.log('\n📍 Breakdown by chain:');
    const chains = execSync('git diff --name-only HEAD~1 | grep assetlist.json | cut -d/ -f2 | sort | uniq', { encoding: 'utf8' });
    
    for (const chain of chains.split('\n').filter((c: string) => c)) {
      const count = execSync(`git diff HEAD~1 -- chains/${chain}/assetlist.json | grep "^+" | grep "coingecko_id" | wc -l`, { encoding: 'utf8' }).trim();
      console.log(`   Chain ${chain}: ${count} assets`);
    }
    
  } catch (error) {
    console.error('Error generating stats:', error);
  }
}

// Run both checks
async function main() {
  await spotCheck();
  await generateStats();
}

main().catch(console.error);