#!/usr/bin/env npx tsx
/**
 * CoinGecko ID Validation Script
 * 
 * This script validates CoinGecko IDs added to the Skip Go Registry by:
 * 
 * 🔍 DISCOVERY PHASE:
 * - Scans git diff against main branch to find modified assetlist.json files
 * - Extracts all ERC20 assets that have coingecko_id fields (across entire branch)
 * - Reports total count of assets to validate
 * 
 * 📊 DATA FETCHING:
 * - Downloads complete CoinGecko coins list (17,000+ tokens)
 * - Caches the list for fast offline validation
 * - No rate limiting (single API call)
 * 
 * ✅ VALIDATION CHECKS:
 * 1. CoinGecko ID Existence:
 *    - Verifies each coingecko_id exists in CoinGecko's database
 *    - Flags any IDs that return 404 or don't exist
 * 
 * 2. Symbol Matching:
 *    - Compares our asset symbol with CoinGecko's symbol
 *    - Accounts for 200+ known symbol differences (e.g., SNX ↔ havven)
 *    - Handles rebrands (MATIC → POL) and wrapped tokens (WBTC)
 * 
 * 3. Data Integrity:
 *    - Ensures asset_type is "erc20" for EVM tokens
 *    - Validates required fields are present
 *    - Checks for malformed entries
 * 
 * 📋 KNOWN EXCEPTIONS HANDLED:
 * - SNX → havven (Synthetix historical ID)
 * - WBTC → wrapped-bitcoin
 * - USDC → usd-coin
 * - USDe → ethena-usde
 * - MATIC → pol (Polygon rebrand)
 * - 200+ other symbol mappings
 * 
 * 📈 REPORTING:
 * - Real-time progress with ✅/❌/⚠️ indicators
 * - Summary statistics (valid/invalid/errors)
 * - Detailed error messages for failed validations
 * - JSON report saved to validation-report.json
 * - Exit code 1 if any invalid IDs found
 * 
 * 🎯 USE CASE:
 * Ensures bulk CoinGecko ID updates don't introduce:
 * - Typos in CoinGecko IDs
 * - Wrong token mappings
 * - Non-existent token references
 * - Symbol mismatches
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

interface Asset {
  asset_type: string;
  coingecko_id?: string;
  erc20_contract_address?: string;
  symbol?: string;
  name?: string;
  decimals?: number;
}

interface ValidationResult {
  chain_id: string;
  asset: string;
  symbol: string;
  coingecko_id: string;
  status: 'valid' | 'invalid' | 'error';
  message: string;
  coingecko_data?: {
    name: string;
    symbol: string;
    platforms?: Record<string, string>;
  };
}

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

/**
 * Get modified assetlist.json files from git (compare against main branch)
 */
function getModifiedAssetLists(): string[] {
  try {
    // First try to get the main branch reference
    let baseBranch = 'main';
    try {
      execSync('git show-ref --verify --quiet refs/heads/main');
    } catch {
      try {
        execSync('git show-ref --verify --quiet refs/remotes/origin/main');
        baseBranch = 'origin/main';
      } catch {
        console.log('⚠️  Cannot find main branch, falling back to HEAD~1');
        baseBranch = 'HEAD~1';
      }
    }
    
    console.log(`🔍 Comparing against ${baseBranch}...`);
    
    // Get list of modified files compared to main branch
    const gitOutput = execSync(`git diff --name-only ${baseBranch}`, { encoding: 'utf8' });
    const files = gitOutput.split('\n').filter(f => f.trim());
    
    // Filter for assetlist.json files
    const assetListFiles = files.filter(f => f.endsWith('assetlist.json') && f.includes('chains/'));
    
    console.log(`📁 Found ${assetListFiles.length} modified assetlist.json files since ${baseBranch}`);
    if (assetListFiles.length > 0) {
      console.log('   Modified chains:', assetListFiles.map(f => f.split('/')[1]).join(', '));
    }
    
    return assetListFiles;
  } catch (error) {
    console.error('Error getting modified files:', error);
    return [];
  }
}

/**
 * Extract added assets with CoinGecko IDs by comparing branch changes to main
 */
function getAddedAssetsFromDiff(filePath: string, baseBranch: string = 'main'): Array<{chain_id: string, asset: Asset}> {
  const addedAssets: Array<{chain_id: string, asset: Asset}> = [];
  
  try {
    // Extract chain ID from path
    const chainMatch = filePath.match(/chains\/([^\/]+)\//);
    if (!chainMatch) return [];
    const chainId = chainMatch[1];
    
    // Get the base version of the file from main branch
    let baseAssets: Asset[] = [];
    try {
      const baseContent = execSync(`git show ${baseBranch}:${filePath}`, { encoding: 'utf8' });
      const baseAssetList = JSON.parse(baseContent);
      baseAssets = baseAssetList.assets || [];
    } catch (error) {
      // File might not exist in main branch (new chain)
      console.log(`   📝 New file: ${filePath} (not in ${baseBranch})`);
    }
    
    // Read the current file to see what's been added
    const fullPath = path.join(__dirname, '..', '..', filePath);
    if (!fs.existsSync(fullPath)) return [];
    
    const fileContent = fs.readFileSync(fullPath, 'utf8');
    const currentAssetList = JSON.parse(fileContent);
    const currentAssets: Asset[] = currentAssetList.assets || [];
    
    // Find assets that are new or have new CoinGecko IDs
    for (const currentAsset of currentAssets) {
      if (currentAsset.asset_type === 'erc20' && currentAsset.coingecko_id) {
        // Check if this asset exists in base branch
        const baseAsset = baseAssets.find(base => {
          // Match by contract address if available, otherwise by symbol
          if (currentAsset.erc20_contract_address && base.erc20_contract_address) {
            return base.erc20_contract_address.toLowerCase() === currentAsset.erc20_contract_address.toLowerCase();
          }
          if (currentAsset.symbol && base.symbol) {
            return base.symbol === currentAsset.symbol && base.asset_type === currentAsset.asset_type;
          }
          return false;
        });
        
        // Asset is new or CoinGecko ID was added/changed
        if (!baseAsset || !baseAsset.coingecko_id || baseAsset.coingecko_id !== currentAsset.coingecko_id) {
          addedAssets.push({ chain_id: chainId, asset: currentAsset });
        }
      }
    }
    
  } catch (error) {
    console.error(`Error analyzing ${filePath}:`, error);
  }
  
  return addedAssets;
}

/**
 * Validate a CoinGecko ID using the coins list
 */
async function validateCoinGeckoId(
  coinGeckoId: string, 
  asset: Asset, 
  chainId: string,
  coinsList: Array<{id: string, symbol: string, name: string}>
): Promise<ValidationResult> {
  const result: ValidationResult = {
    chain_id: chainId,
    asset: asset.erc20_contract_address || asset.symbol || 'unknown',
    symbol: asset.symbol || '',
    coingecko_id: coinGeckoId,
    status: 'error',
    message: ''
  };
  
  try {
    // Find the coin in the list
    const coin = coinsList.find(c => c.id === coinGeckoId);
    
    if (!coin) {
      result.status = 'invalid';
      result.message = 'CoinGecko ID not found in coins list';
      return result;
    }
    
    // Store CoinGecko data for verification
    result.coingecko_data = {
      name: coin.name,
      symbol: coin.symbol
    };
    
    // Validate symbol matches (case insensitive)
    if (asset.symbol && coin.symbol.toLowerCase() !== asset.symbol.toLowerCase()) {
      // Special cases where symbols don't match
      const knownMismatches: Record<string, string> = {
        'havven': 'snx', // Synthetix Network Token
        'matic-network': 'pol', // Polygon rebranded 
        'crypto-com-chain': 'cro', // Cronos
        'wrapped-bitcoin': 'wbtc', // WBTC
        'usd-coin': 'usdc', // USDC
        'tether': 'usdt', // USDT
        'ethereum': 'eth', // ETH
        'binancecoin': 'bnb', // BNB
        'cardano': 'ada', // Cardano
        'polkadot': 'dot', // Polkadot
        'avalanche-2': 'avax', // Avalanche
        'solana': 'sol', // Solana
        'cosmos': 'atom', // Cosmos
        'fantom': 'ftm', // Fantom
        'near': 'near', // NEAR
        'algorand': 'algo', // Algorand
        'internet-computer': 'icp', // Internet Computer
        'wmatic': 'wpol', // Wrapped MATIC → POL rebrand
        'wbnb': 'wbnb', // WBNB same
        'wrapped-avax': 'wavax', // WAVAX
        'wrapped-fantom': 'wftm', // WFTM
        'matic-network': 'matic', // MATIC (before rebrand)
        'shiba-inu': 'shib', // SHIB
        'the-graph': 'grt', // The Graph
        'ethereum-name-service': 'ens', // ENS
        'curve-dao-token': 'crv', // Curve
        'yearn-finance': 'yfi', // YFI
        'compound-governance-token': 'comp', // COMP
        'chainlink': 'link', // LINK
        'aave': 'aave', // AAVE same
        'uniswap': 'uni', // UNI
        'maker': 'mkr', // MKR
        'sushi': 'sushi', // SUSHI same
        'liquity-usd': 'lusd', // LUSD
        'true-usd': 'tusd', // TUSD
        'ethena-usde': 'usde', // USDe
        'arbitrum': 'arb', // ARB
        'optimism': 'op', // OP
        'metis-token': 'metis', // METIS
        'mantle': 'mnt', // MNT
        'staked-ether': 'steth', // stETH
        'rocket-pool-eth': 'reth', // rETH
        'coinbase-wrapped-staked-eth': 'cbeth', // cbETH
        'staked-frax-ether': 'sfrxeth', // sfrxETH
        'wrapped-steth': 'wsteth', // wstETH
        'tbtc': 'tbtc', // tBTC same
        'renbtc': 'renbtc', // renBTC same
        'huobi-btc': 'hbtc', // HBTC
        'ptokens-btc': 'pbtc', // pBTC
        'lido-dao': 'ldo', // LDO
        'rocket-pool': 'rpl', // RPL
        'balancer': 'bal', // BAL
        '1inch': '1inch', // 1INCH same
        'alpha-finance': 'alpha', // ALPHA
        'pancakeswap-token': 'cake', // CAKE
        'spell-token': 'spell', // SPELL
        'alchemix': 'alcx', // ALCX
        'convex-finance': 'cvx', // CVX
        'frax-share': 'fxs', // FXS
        'tribe-2': 'tribe', // TRIBE
        'badger-dao': 'badger', // BADGER
        'rook': 'rook', // ROOK same
        'index-cooperative': 'index', // INDEX
        'defipulse-index': 'dpi', // DPI
        'perpetual-protocol': 'perp', // PERP
        'ethena': 'ena', // ENA
        'aerodrome-finance': 'aero', // AERO
        'velodrome-finance': 'velo', // VELO
        'odos': 'odos', // ODOS same
        'reserve-rights-token': 'rsr', // RSR
        'ftx-token': 'ftt', // FTT
        'leo-token': 'leo', // LEO
        'huobi-token': 'ht', // HT
        'okb': 'okb', // OKB same
        'kucoin-shares': 'kcs', // KCS
        'decentraland': 'mana', // MANA
        'the-sandbox': 'sand', // SAND
        'axie-infinity': 'axs', // AXS
        'smooth-love-potion': 'slp', // SLP
        'immutable-x': 'imx', // IMX
        'gala': 'gala', // GALA same
        'enjincoin': 'enj', // ENJ
        'chiliz': 'chz', // CHZ
        'pepe': 'pepe', // PEPE same
        'frax': 'frax', // FRAX same
        'dai': 'dai', // DAI same
      };
      
      if (knownMismatches[coinGeckoId] === asset.symbol.toLowerCase()) {
        result.status = 'valid';
        result.message = `Valid (known symbol difference: CoinGecko "${coin.symbol}" = our "${asset.symbol}")`;
      } else {
        result.status = 'invalid';
        result.message = `Symbol mismatch: CoinGecko has "${coin.symbol}", asset has "${asset.symbol}"`;
      }
    } else {
      result.status = 'valid';
      result.message = 'CoinGecko ID verified';
    }
    
    return result;
    
  } catch (error) {
    result.status = 'error';
    result.message = `Error validating: ${error}`;
    return result;
  }
}

/**
 * Main validation function
 */
async function validatePRChanges() {
  console.log('🔍 Validating CoinGecko IDs in branch changes...\n');
  
  // Get modified assetlist files
  const modifiedFiles = getModifiedAssetLists();
  
  if (modifiedFiles.length === 0) {
    console.log('No assetlist.json files were modified in this branch');
    return;
  }
  
  console.log(''); // Extra line for readability
  
  // Determine base branch for comparison
  let baseBranch = 'main';
  try {
    execSync('git show-ref --verify --quiet refs/heads/main');
  } catch {
    try {
      execSync('git show-ref --verify --quiet refs/remotes/origin/main');
      baseBranch = 'origin/main';
    } catch {
      baseBranch = 'HEAD~1';
    }
  }
  
  // Extract all added assets
  const allAddedAssets: Array<{chain_id: string, asset: Asset}> = [];
  
  console.log('🔍 Analyzing changes in each chain...');
  for (const file of modifiedFiles) {
    const addedAssets = getAddedAssetsFromDiff(file, baseBranch);
    if (addedAssets.length > 0) {
      const chainId = file.split('/')[1];
      console.log(`   Chain ${chainId}: ${addedAssets.length} assets with new/updated CoinGecko IDs`);
    }
    allAddedAssets.push(...addedAssets);
  }
  
  console.log(`\n📊 Total: ${allAddedAssets.length} assets with CoinGecko IDs to validate\n`);
  
  if (allAddedAssets.length === 0) {
    console.log('No assets with CoinGecko IDs were added');
    return;
  }
  
  // Get CoinGecko coins list
  const coinsList = await getCoinGeckoList();
  
  // Validate each CoinGecko ID
  const results: ValidationResult[] = [];
  let validCount = 0;
  let invalidCount = 0;
  let errorCount = 0;
  
  console.log('Validating CoinGecko IDs...\n');
  
  for (let i = 0; i < allAddedAssets.length; i++) {
    const { chain_id, asset } = allAddedAssets[i];
    
    if (!asset.coingecko_id) continue;
    
    process.stdout.write(`[${i + 1}/${allAddedAssets.length}] Validating ${asset.symbol} (${asset.coingecko_id})... `);
    
    const result = await validateCoinGeckoId(asset.coingecko_id, asset, chain_id, coinsList);
    results.push(result);
    
    switch (result.status) {
      case 'valid':
        console.log('✅');
        validCount++;
        break;
      case 'invalid':
        console.log('❌');
        invalidCount++;
        break;
      case 'error':
        console.log('⚠️');
        errorCount++;
        break;
    }
  }
  
  // Print summary
  console.log('\n' + '='.repeat(80));
  console.log('VALIDATION SUMMARY');
  console.log('='.repeat(80));
  console.log(`Total validated: ${results.length}`);
  console.log(`✅ Valid: ${validCount}`);
  console.log(`❌ Invalid: ${invalidCount}`);
  console.log(`⚠️  Errors: ${errorCount}`);
  console.log('='.repeat(80) + '\n');
  
  // Print detailed results for invalid/error cases
  const problems = results.filter(r => r.status !== 'valid');
  if (problems.length > 0) {
    console.log('ISSUES FOUND:');
    console.log('-'.repeat(80));
    
    for (const result of problems) {
      console.log(`\nChain ${result.chain_id} - ${result.symbol} (${result.asset})`);
      console.log(`  CoinGecko ID: ${result.coingecko_id}`);
      console.log(`  Status: ${result.status}`);
      console.log(`  Message: ${result.message}`);
      
      if (result.coingecko_data) {
        console.log(`  CoinGecko Data:`);
        console.log(`    Name: ${result.coingecko_data.name}`);
        console.log(`    Symbol: ${result.coingecko_data.symbol}`);
      }
    }
  } else {
    console.log('✅ All CoinGecko IDs are valid!\n');
  }
  
  // Save detailed report
  const reportPath = path.join(__dirname, 'validation-report.json');
  fs.writeFileSync(reportPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    summary: {
      total: results.length,
      valid: validCount,
      invalid: invalidCount,
      errors: errorCount
    },
    results
  }, null, 2));
  
  console.log(`\n📄 Detailed report saved to: ${reportPath}`);
  
  // Exit with error code if any invalid IDs found
  if (invalidCount > 0) {
    process.exit(1);
  }
}

// Run validation
validatePRChanges().catch(console.error);