import { Validator } from 'jsonschema';
import axios from 'axios';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import * as fs from 'fs';
import * as path from 'path';

// --- Interfaces & Types ---

interface Endpoint {
  address: string;
  tls?: boolean;
}

interface InitiaConfig {
  chain_id: string;
  chain_name: string;
  chain_type: 'initia';
  is_testnet: boolean;
  is_initia_l1: boolean;
  initia_l1_chain_id?: string;
  apis: {
    cosmos_sdk_grpc_endpoint?: Endpoint;
    tendermint_rpc_endpoint?: Endpoint;
    lcd_rest_endpoint?: Endpoint;
  };
}

interface ValidationResult {
  test: string;
  endpoint?: string;
  status: 'ok' | 'error' | 'skipped' | 'warning';
  message: string;
  details?: any;
}

// --- Constants ---

const PROTO_DIR = path.join(__dirname, 'protos');
const PAGINATION_LIMIT = 10000;

// Base URL for Initia registry
const INITIA_REGISTRY_BASE_URL = 'https://raw.githubusercontent.com/initia-labs/initia-registry/main/';

// --- Initia Config Schema ---
// We will load the actual schema from the file system.

// --- Validation Functions ---

function validateSchema(config: any): ValidationResult {
  let schema: any;
  const validator = new Validator();
  try {
    const schemaPath = path.resolve(__dirname, '../../../initia.chain.schema.json');
    const schemaContent = fs.readFileSync(schemaPath, 'utf-8');
    schema = JSON.parse(schemaContent);
    // Pre-add the schema itself to the validator, which can help resolve $refs if needed
    // and potentially helps with draft version detection.
    validator.addSchema(schema, '/initia.chain.schema.json'); 
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
        test: 'Schema Validation',
        status: 'error', // Revert to error
        message: `Failed to load or parse initia.chain.schema.json: ${errorMessage}`
    };
  }

  // Perform validation
  const validationResult = validator.validate(config, schema);

  // Check results
  if (validationResult.valid) {
    return {
        test: 'Schema Validation',
        status: 'ok',
        message: 'Schema is valid according to initia.chain.schema.json.',
        details: null
    };
  } else {
    // Construct error message from validation errors
    const errors = validationResult.errors.map((err: any) => `${err.property}: ${err.message}`).join('; ');
    return {
        test: 'Schema Validation',
        status: 'error', // Revert to error
        message: `Schema is invalid according to initia.chain.schema.json: ${errors}`,
        details: validationResult.errors
    };
  }
}

// Registry Check (Uses Initia logic)
async function checkRegistry(config: InitiaConfig): Promise<ValidationResult[]> {
  // Type guard to ensure we have Initia-specific fields
  if (config.chain_type !== 'initia') {
    return [{ test: 'Registry Check', status: 'skipped', message: 'Registry check only applies to chain_type: initia' }];
  }

  const results: ValidationResult[] = [];
  const prefix = config.is_testnet ? 'testnets/' : 'mainnets/';
  // Assuming chain_name is suitable for path derivation, adjust if needed
  const chainPath = config.chain_name.replace(/-/g, ''); // Path derivation logic from web app
  const registryChainJsonUrl = `${INITIA_REGISTRY_BASE_URL}${prefix}${chainPath}/chain.json`;
  const registryAssetListUrl = `${INITIA_REGISTRY_BASE_URL}${prefix}${chainPath}/assetlist.json`;

  // --- Check chain.json --- 
  try {
    const response = await axios.get(registryChainJsonUrl, { timeout: 10000 });
    const registryChainJson = response.data;

    if (!registryChainJson || typeof registryChainJson !== 'object') {
      results.push({ test: 'Registry chain.json Fetch', status: 'error', message: `Failed to fetch or parse valid JSON from ${registryChainJsonUrl}` });
      // Don't return early, allow assetlist check to run
    } else {
      results.push({ test: 'Registry chain.json Fetch', status: 'ok', message: `Successfully fetched registry data from ${registryChainJsonUrl}` });

      // Compare Chain ID
      if (config.chain_id !== registryChainJson.chain_id) {
        results.push({ test: 'Registry Chain ID Match', status: 'error', message: `Chain ID mismatch: Config (${config.chain_id}) vs Registry (${registryChainJson.chain_id})` });
      } else {
        results.push({ test: 'Registry Chain ID Match', status: 'ok', message: `Chain ID matches registry (${config.chain_id}).` });
      }

      // Compare gRPC Endpoint
      // NOTE: Verify the path `apis.grpc[0].address` in the actual Initia registry structure
      const grpcRegistry = registryChainJson.apis?.grpc?.[0]?.address;
      const grpcConfig = config.apis.cosmos_sdk_grpc_endpoint?.address;
      if (grpcConfig) {
        if (!grpcRegistry) {
          results.push({ test: 'Registry gRPC Match', status: 'error', message: `gRPC endpoint present in config (${grpcConfig}) but not found in registry.` });
        } else if (grpcConfig !== grpcRegistry) {
          results.push({ test: 'Registry gRPC Match', status: 'error', message: `gRPC endpoint mismatch: Config (${grpcConfig}) vs Registry (${grpcRegistry})` });
        } else {
          results.push({ test: 'Registry gRPC Match', status: 'ok', message: `gRPC endpoint matches registry (${grpcConfig}).` });
        }
      } else if (grpcRegistry) {
          results.push({ test: 'Registry gRPC Match', status: 'error', message: `gRPC endpoint missing in config but present in registry (${grpcRegistry}).` });
      } // else: neither has it, no mismatch

      // Compare RPC Endpoint
      // NOTE: Verify the path `apis.rpc[0].address` in the actual Initia registry structure
      const rpcRegistry = registryChainJson.apis?.rpc?.[0]?.address;
      const rpcConfig = config.apis.tendermint_rpc_endpoint?.address;
       if (rpcConfig) {
        if (!rpcRegistry) {
          results.push({ test: 'Registry RPC Match', status: 'error', message: `RPC endpoint present in config (${rpcConfig}) but not found in registry.` });
        } else if (rpcConfig !== rpcRegistry) {
          results.push({ test: 'Registry RPC Match', status: 'error', message: `RPC endpoint mismatch: Config (${rpcConfig}) vs Registry (${rpcRegistry})` });
        } else {
          results.push({ test: 'Registry RPC Match', status: 'ok', message: `RPC endpoint matches registry (${rpcConfig}).` });
        }
      } else if (rpcRegistry) {
          results.push({ test: 'Registry RPC Match', status: 'error', message: `RPC endpoint missing in config but present in registry (${rpcRegistry}).` });
      } // else: neither has it, no mismatch

      // Compare REST/LCD Endpoint
      // NOTE: Verify the path `apis.rest[0].address` in the actual Initia registry structure
      const restRegistry = registryChainJson.apis?.rest?.[0]?.address;
      const restConfig = config.apis.lcd_rest_endpoint?.address;
      if (restConfig) {
        if (!restRegistry) {
          results.push({ test: 'Registry REST/LCD Match', status: 'error', message: `REST/LCD endpoint present in config (${restConfig}) but not found in registry.` });
        } else if (restConfig !== restRegistry) {
          results.push({ test: 'Registry REST/LCD Match', status: 'error', message: `REST/LCD endpoint mismatch: Config (${restConfig}) vs Registry (${restRegistry})` });
        } else {
          results.push({ test: 'Registry REST/LCD Match', status: 'ok', message: `REST/LCD endpoint matches registry (${restConfig}).` });
        }
      } else if (restRegistry) {
          results.push({ test: 'Registry REST/LCD Match', status: 'error', message: `REST/LCD endpoint missing in config but present in registry (${restRegistry}).` });
      } // else: neither has it, no mismatch
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    results.push({ test: 'Registry chain.json Fetch', status: 'error', message: `Failed to fetch registry chain.json: ${errorMessage}` });
  }

  // --- Check assetlist.json --- 
  try {
    const response = await axios.get(registryAssetListUrl, { timeout: 10000 });
    const registryAssetList = response.data;
    if (!registryAssetList || !Array.isArray(registryAssetList.assets)) {
        results.push({ test: 'Registry AssetList Fetch', status: 'error', message: `Failed to fetch or parse valid asset list from ${registryAssetListUrl}` });
    } else {
        const count = registryAssetList.assets.length;
        results.push({ test: 'Registry AssetList Fetch', status: 'ok', message: `Successfully fetched assetlist.json with ${count} assets.` });
        // Optional: Add specific asset comparisons here if needed (e.g., staking denom)
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    results.push({ test: 'Registry AssetList Fetch', status: 'error', message: `Failed to fetch registry assetlist.json: ${errorMessage}` });
  }

  return results;
}

// --- RPC Check Function (Adapted from web app) ---
async function checkRpc(endpoint: Endpoint): Promise<ValidationResult> {
  const result: ValidationResult = { test: 'RPC Check', endpoint: endpoint.address, status: 'error', message: 'Connection failed' };
  try {
    // Requires @cosmjs/tendermint-rpc if not already installed (should be handled if adapting from cosmjs checks later)
    // For now, use a simple axios check for status endpoint if @cosmjs isn't a direct dependency yet.
    const url = endpoint.address.endsWith('/') ? `${endpoint.address}status` : `${endpoint.address}/status`;
    const response = await axios.get(url, { timeout: 5000 });
    if (response.status === 200 && response.data?.result?.node_info?.network) {
      result.status = 'ok';
      result.message = `Connected. Chain ID: ${response.data.result.node_info.network}`;
      result.details = { chainId: response.data.result.node_info.network };
    } else {
      result.message = `Unexpected status code ${response.status} or missing network info in RPC /status.`;
    }
  } catch (error) {
    if (axios.isAxiosError(error)) {
      result.message = `Connection failed: ${error.message} (Status: ${error.response?.status})`;
    } else {
      const errorMessage = error instanceof Error ? error.message : String(error);
      result.message = `Connection failed: ${errorMessage}`;
    }
  }
  return result;
}

// --- LCD Check Function (Adapted from web app) ---
async function checkLcd(endpoint: Endpoint): Promise<ValidationResult> {
  const result: ValidationResult = { test: 'LCD/REST Check', endpoint: endpoint.address, status: 'error', message: 'Connection failed' };
  try {
    const url = endpoint.address.endsWith('/') ? `${endpoint.address}cosmos/base/tendermint/v1beta1/node_info` : `${endpoint.address}/cosmos/base/tendermint/v1beta1/node_info`;
    const response = await axios.get(url, { timeout: 5000 }); // 5 second timeout
    if (response.status === 200 && response.data?.default_node_info?.network) {
      result.status = 'ok';
      result.message = `Connected. Chain ID: ${response.data.default_node_info.network}`;
      result.details = { chainId: response.data.default_node_info.network };
    } else {
        result.message = `Unexpected status code ${response.status} or missing network info.`;
    }
  } catch (error) {
     if (axios.isAxiosError(error)) {
            result.message = `Connection failed: ${error.message} (Status: ${error.response?.status})`;
        } else {
            const errorMessage = error instanceof Error ? error.message : String(error);
            result.message = `Connection failed: ${errorMessage}`;
        }
  }
  return result;
}

// --- gRPC Helper Functions (Adapted from existing project) ---

async function performGrpcQuery(endpoint: Endpoint, serviceName: string, protoFileName: string, methodName: string, requestData: any = {}): Promise<ValidationResult> {
  const result: ValidationResult = { test: `gRPC: ${serviceName}/${methodName}`, endpoint: endpoint.address, status: 'error', message: 'Query failed' };
  try {
    const protoPath = path.join(PROTO_DIR, protoFileName);
    if (!fs.existsSync(protoPath)) {
      throw new Error(`Proto file not found: ${protoPath}`);
    }

    const packageDefinition = protoLoader.loadSync(protoPath, {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
      includeDirs: [PROTO_DIR]
    });

    // Dynamically access the service descriptor
    const protoDescriptor = grpc.loadPackageDefinition(packageDefinition);
    const serviceDefinition = serviceName.split('.').reduce((obj, key) => obj?.[key], protoDescriptor as any);

    if (!serviceDefinition || !serviceDefinition[methodName]) {
         // Try finding the service constructor (common pattern)
        const ServiceConstructor = serviceName.split('.').reduce((obj, key) => obj?.[key], protoDescriptor as any);
        if (!ServiceConstructor) {
             throw new Error(`Service definition ${serviceName} not found in proto descriptor.`);
        }
        const credentials = endpoint.tls ? grpc.credentials.createSsl() : grpc.credentials.createInsecure();
        const client = new ServiceConstructor(endpoint.address, credentials);

        if (typeof client[methodName] !== 'function') {
            throw new Error(`Method ${methodName} not found on service ${serviceName}`);
        }

         // Perform query using client instance
        return new Promise((resolve) => {
            const deadline = new Date();
            deadline.setSeconds(deadline.getSeconds() + 10); // 10 second timeout
            client[methodName](requestData, { deadline }, (err: grpc.ServiceError | null, response: any) => {
                if (err) {
                     // Check for the specific error case to treat as a warning
                    if (
                        serviceName === 'ibc.core.client.v1.Query' &&
                        methodName === 'ClientStates' &&
                        err.code === grpc.status.INTERNAL && // Code 13
                        err.message?.includes('{ValuePerByte}') // Specific message content
                    ) {
                        result.status = 'warning'; // Set status to warning
                        result.message = err.message; // Use original error message
                        // Optional: Include details if needed even for warnings
                        // result.details = { warning: err.details };
                    } else {
                        // Handle all other errors as actual errors
                        result.message = `gRPC query failed: ${err.message}`;
                        result.status = 'error';
                    }
                } else {
                    result.status = 'ok';
                    result.message = 'Query successful.';
                    result.details = response; // Include response for inspection
                }
                resolve(result);
            });
        });

    } else {
         throw new Error(`Could not correctly load service definition ${serviceName} or method ${methodName}. Check proto structure.`);
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    result.message = `gRPC setup or query error: ${errorMessage}`;
    result.status = 'error'; // Ensure setup errors are still errors
    return result;
  }
}

async function checkGrpcServices(endpoint: Endpoint): Promise<ValidationResult[]> {
  const results: ValidationResult[] = [];
  const pagination = { pagination: { limit: String(PAGINATION_LIMIT), count_total: false } };

  // Basic Connectivity Check (similar to quick-check)
  const connResult: ValidationResult = { test: 'gRPC Connection', endpoint: endpoint.address, status: 'error', message: 'Connection failed' };
  const credentials = endpoint.tls ? grpc.credentials.createSsl() : grpc.credentials.createInsecure();
  const client = new grpc.Client(endpoint.address, credentials);
  try {
    await new Promise<void>((resolve, reject) => {
      const deadline = new Date();
      deadline.setSeconds(deadline.getSeconds() + 5);
      client.waitForReady(deadline, (err) => {
        if (err) {
          connResult.message = `Connection failed: ${err.message}`;
          reject(err);
        } else {
          connResult.status = 'ok';
          connResult.message = 'gRPC connection established.';
          resolve();
        }
        client.close();
      });
    });
  } catch (err) {
      // Error message is already set in the promise rejection
  }
  results.push(connResult);

  // Only proceed if connection is ok
  if (connResult.status !== 'ok') {
    // Add skipped results for other gRPC tests
    const skippedTests = [
      'cosmos.bank.v1beta1.Query/TotalSupply',
      'cosmos.staking.v1beta1.Query/Params',
      'ibc.applications.transfer.v1.Query/DenomTraces',
      'ibc.core.channel.v1.Query/Channels',
      'ibc.core.client.v1.Query/ClientStates',
      'cosmos.base.tendermint.v1beta1.Service/GetNodeInfo'
    ];
    skippedTests.forEach(testName => {
      results.push({ test: `gRPC: ${testName}`, endpoint: endpoint.address, status: 'skipped', message: 'Skipped due to connection failure.' });
    });
    return results;
  }

  // Bank TotalSupply
  results.push(await performGrpcQuery(endpoint, 'cosmos.bank.v1beta1.Query', 'cosmos/bank/v1beta1/query.proto', 'TotalSupply', pagination));

  // Staking Params
  results.push(await performGrpcQuery(endpoint, 'cosmos.staking.v1beta1.Query', 'cosmos/staking/v1beta1/query.proto', 'Params'));

  // IBC DenomTraces
  results.push(await performGrpcQuery(endpoint, 'ibc.applications.transfer.v1.Query', 'ibc/applications/transfer/v1/query.proto', 'DenomTraces', pagination));

  // IBC Channels
  results.push(await performGrpcQuery(endpoint, 'ibc.core.channel.v1.Query', 'ibc/core/channel/v1/query.proto', 'Channels', pagination));

  // IBC ClientStates
  results.push(await performGrpcQuery(endpoint, 'ibc.core.client.v1.Query', 'ibc/core/client/v1/query.proto', 'ClientStates', pagination));

  // Tendermint GetNodeInfo
  results.push(await performGrpcQuery(endpoint, 'cosmos.base.tendermint.v1beta1.Service', 'cosmos/base/tendermint/v1beta1/query.proto', 'GetNodeInfo'));

  // Add any Initia-specific gRPC checks here if known

  return results;
}

// --- Main Validation Logic ---

async function validateInitiaConfig(configPath: string): Promise<ValidationResult[]> {
  const allResults: ValidationResult[] = [];

  // 1. Load Config
  let config: InitiaConfig;
  try {
    const rawConfig = fs.readFileSync(configPath, 'utf-8');
    config = JSON.parse(rawConfig);
    allResults.push({ test: 'Load Config', status: 'ok', message: `Successfully loaded config from ${configPath}` });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    allResults.push({ test: 'Load Config', status: 'error', message: `Failed to load or parse config: ${errorMessage}` });
    return allResults; // Stop validation if config cannot be loaded
  }

  // 2. Validate Schema
  // First, basic structural check to see if chain_type exists
  if (typeof config !== 'object' || !config?.chain_type) {
       allResults.push({ test: 'Schema Validation', status: 'error', message: 'Config is missing chain_type field.' });
       return allResults;
  }
  
  // Use Initia schema directly as this tool is specific to Initia
  const schemaResult = validateSchema(config);
  allResults.push(schemaResult);
  if (schemaResult.status === 'error') {
    // Optional: Stop further checks if schema is invalid
     // return allResults;
  }

  // 3. Check Registry
  if (schemaResult.status === 'ok') {
      const registryResults = await checkRegistry(config);
      allResults.push(...registryResults);
  } else {
       allResults.push({ test: 'Registry Check', status: 'skipped', message: 'Skipped due to schema validation failure.' });
  }

  // 4. Check Endpoints
  const { cosmos_sdk_grpc_endpoint, tendermint_rpc_endpoint, lcd_rest_endpoint } = config.apis;

  // gRPC Checks
  if (cosmos_sdk_grpc_endpoint) {
    const grpcResults = await checkGrpcServices(cosmos_sdk_grpc_endpoint);
    allResults.push(...grpcResults);
  } else {
    allResults.push({ test: 'gRPC Checks', status: 'skipped', message: 'No gRPC endpoint defined in config.' });
  }

  // RPC Check
  if (tendermint_rpc_endpoint) {
    allResults.push(await checkRpc(tendermint_rpc_endpoint));
  } else {
    allResults.push({ test: 'RPC Check', status: 'skipped', message: 'No RPC endpoint defined in config.' });
  }

  // LCD Check
  if (lcd_rest_endpoint) {
    allResults.push(await checkLcd(lcd_rest_endpoint));
  } else {
    allResults.push({ test: 'LCD/REST Check', status: 'skipped', message: 'No LCD/REST endpoint defined in config.' });
  }
  
  // Optional: Add Chain ID consistency check between endpoints
  // ... (logic similar to web app if needed)

  return allResults;
}

// --- Script Execution ---

(async () => {
  const args = process.argv.slice(2);
  if (args.length !== 1) {
    console.error('Usage: ts-node src/validate-initia.ts <path/to/initia-config.json>');
    // Or for compiled: node dist/validate-initia.js <path/to/initia-config.json>
    process.exit(1);
  }

  const configPath = args[0];
  console.log(`Validating Initia config: ${configPath}...\n`);

  const results = await validateInitiaConfig(configPath);

  console.log('--- Validation Results ---');
  let hasError = false;
  results.forEach(result => { // Simplified error checking loop
    let prefix = '[?]';
    if (result.status === 'ok') prefix = '[✓]';
    if (result.status === 'warning') prefix = '[!] ' // Keep warning symbol
    if (result.status === 'error') {
        prefix = '[✗]';
        hasError = true;
    }
    if (result.status === 'skipped') prefix = '[-]';

    console.log(`${prefix} ${result.test}${result.endpoint ? ' (' + result.endpoint + ')' : ''}: ${result.message}`);
    // Only show details for actual errors
    if (result.status === 'error' && result.details) {
      console.log('   Details:', JSON.stringify(result.details, null, 2));
    }
  });

  console.log('\n--- Summary ---');
  if (hasError) {
    console.error('Validation Failed! See errors above.');
    process.exit(1);
  } else {
    // No need to check for warnings explicitly for exit code if errors take priority
    console.log('Validation Successful!');
    process.exit(0);
  }
})(); 