import { Validator } from 'jsonschema';
import axios from 'axios';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Represents connection details for a chain endpoint.
 */
interface Endpoint {
  address: string;
  tls?: boolean;
}

/**
 * Represents the structure of an Initia chain configuration file.
 */
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

/**
 * Represents the result of a single validation test.
 */
interface ValidationResult {
  test: string;
  endpoint?: string;
  status: 'ok' | 'error' | 'skipped' | 'warning';
  message: string;
  details?: any;
}

const PROTO_DIR = path.join(__dirname, 'protos');
const PAGINATION_LIMIT = 10000;
const INITIA_REGISTRY_BASE_URL = 'https://raw.githubusercontent.com/initia-labs/initia-registry/main/';

/**
 * Validates the structure of the loaded configuration object against the initia.chain.schema.json.
 * @param config The configuration object loaded from the JSON file.
 * @returns A ValidationResult indicating success or failure of schema validation.
 */
function validateSchema(config: any): ValidationResult {
  let schema: any;
  const validator = new Validator();
  try {
    const schemaPath = path.resolve(__dirname, '../../../initia.chain.schema.json');
    const schemaContent = fs.readFileSync(schemaPath, 'utf-8');
    schema = JSON.parse(schemaContent);
    validator.addSchema(schema, '/initia.chain.schema.json');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
        test: 'Schema Validation',
        status: 'error',
        message: `Failed to load or parse initia.chain.schema.json: ${errorMessage}`
    };
  }

  const validationResult = validator.validate(config, schema);

  if (validationResult.valid) {
    return {
        test: 'Schema Validation',
        status: 'ok',
        message: 'Schema is valid according to initia.chain.schema.json.',
        details: null
    };
  } else {
    const errors = validationResult.errors.map((err: any) => `${err.property}: ${err.message}`).join('; ');
    return {
        test: 'Schema Validation',
        status: 'error',
        message: `Schema is invalid according to initia.chain.schema.json: ${errors}`,
        details: validationResult.errors
    };
  }
}

/**
 * Compares the provided Initia config against the official Initia registry data.
 * Fetches chain.json and assetlist.json from the registry and compares key fields.
 * @param config The loaded InitiaConfig object.
 * @returns An array of ValidationResult objects for each comparison.
 */
async function checkRegistry(config: InitiaConfig): Promise<ValidationResult[]> {
  if (config.chain_type !== 'initia') {
    return [{ test: 'Registry Check', status: 'skipped', message: 'Registry check only applies to chain_type: initia' }];
  }

  const results: ValidationResult[] = [];
  const prefix = config.is_testnet ? 'testnets/' : 'mainnets/';
  const chainPath = config.chain_name.replace(/-/g, '');
  const registryChainJsonUrl = `${INITIA_REGISTRY_BASE_URL}${prefix}${chainPath}/chain.json`;
  const registryAssetListUrl = `${INITIA_REGISTRY_BASE_URL}${prefix}${chainPath}/assetlist.json`;

  try {
    const response = await axios.get(registryChainJsonUrl, { timeout: 10000 });
    const registryChainJson = response.data;

    if (!registryChainJson || typeof registryChainJson !== 'object') {
      results.push({ test: 'Registry chain.json Fetch', status: 'error', message: `Failed to fetch or parse valid JSON from ${registryChainJsonUrl}` });
    } else {
      results.push({ test: 'Registry chain.json Fetch', status: 'ok', message: `Successfully fetched registry data from ${registryChainJsonUrl}` });

      if (config.chain_id !== registryChainJson.chain_id) {
        results.push({ test: 'Registry Chain ID Match', status: 'error', message: `Chain ID mismatch: Config (${config.chain_id}) vs Registry (${registryChainJson.chain_id})` });
      } else {
        results.push({ test: 'Registry Chain ID Match', status: 'ok', message: `Chain ID matches registry (${config.chain_id}).` });
      }

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
      }

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
      }

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
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    results.push({ test: 'Registry chain.json Fetch', status: 'error', message: `Failed to fetch registry chain.json: ${errorMessage}` });
  }

  try {
    const response = await axios.get(registryAssetListUrl, { timeout: 10000 });
    const registryAssetList = response.data;
    if (!registryAssetList || !Array.isArray(registryAssetList.assets)) {
        results.push({ test: 'Registry AssetList Fetch', status: 'error', message: `Failed to fetch or parse valid asset list from ${registryAssetListUrl}` });
    } else {
        const count = registryAssetList.assets.length;
        results.push({ test: 'Registry AssetList Fetch', status: 'ok', message: `Successfully fetched assetlist.json with ${count} assets.` });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    results.push({ test: 'Registry AssetList Fetch', status: 'error', message: `Failed to fetch registry assetlist.json: ${errorMessage}` });
  }

  return results;
}

/**
 * Checks the connectivity and fetches the chain ID from a Tendermint RPC endpoint.
 * @param endpoint The endpoint details.
 * @returns A ValidationResult indicating connectivity status.
 */
async function checkRpc(endpoint: Endpoint): Promise<ValidationResult> {
  const result: ValidationResult = { test: 'RPC Check', endpoint: endpoint.address, status: 'error', message: 'Connection failed' };
  try {
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

/**
 * Checks the connectivity and fetches the chain ID from an LCD/REST endpoint.
 * @param endpoint The endpoint details.
 * @returns A ValidationResult indicating connectivity status.
 */
async function checkLcd(endpoint: Endpoint): Promise<ValidationResult> {
  const result: ValidationResult = { test: 'LCD/REST Check', endpoint: endpoint.address, status: 'error', message: 'Connection failed' };
  try {
    const url = endpoint.address.endsWith('/') ? `${endpoint.address}cosmos/base/tendermint/v1beta1/node_info` : `${endpoint.address}/cosmos/base/tendermint/v1beta1/node_info`;
    const response = await axios.get(url, { timeout: 5000 });
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

/**
 * Performs a gRPC query against a specified service and method.
 * Handles loading proto files and potential errors.
 * @param endpoint The gRPC endpoint details.
 * @param serviceName The fully qualified service name (e.g., cosmos.bank.v1beta1.Query).
 * @param protoFileName The name of the .proto file relative to the PROTO_DIR.
 * @param methodName The name of the method to call.
 * @param requestData Optional data to send with the request.
 * @returns A ValidationResult for the query.
 */
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

    const protoDescriptor = grpc.loadPackageDefinition(packageDefinition);
    const serviceDefinition = serviceName.split('.').reduce((obj, key) => obj?.[key], protoDescriptor as any);

    if (!serviceDefinition || !serviceDefinition[methodName]) {
        const ServiceConstructor = serviceName.split('.').reduce((obj, key) => obj?.[key], protoDescriptor as any);
        if (!ServiceConstructor) {
             throw new Error(`Service definition ${serviceName} not found in proto descriptor.`);
        }
        const credentials = endpoint.tls ? grpc.credentials.createSsl() : grpc.credentials.createInsecure();
        const client = new ServiceConstructor(endpoint.address, credentials);

        if (typeof client[methodName] !== 'function') {
            throw new Error(`Method ${methodName} not found on service ${serviceName}`);
        }

        return new Promise((resolve) => {
            const deadline = new Date();
            deadline.setSeconds(deadline.getSeconds() + 10);
            client[methodName](requestData, { deadline }, (err: grpc.ServiceError | null, response: any) => {
                if (err) {
                    // Check for the specific error case to treat as a warning
                    if (
                        serviceName === 'ibc.core.client.v1.Query' &&
                        methodName === 'ClientStates' &&
                        err.code === grpc.status.INTERNAL &&
                        err.message?.includes('{ValuePerByte}')
                    ) {
                        result.status = 'warning';
                        result.message = err.message;
                    } else {
                        result.message = `gRPC query failed: ${err.message}`;
                        result.status = 'error';
                    }
                } else {
                    result.status = 'ok';
                    result.message = 'Query successful.';
                    result.details = response;
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
    result.status = 'error';
    return result;
  }
}

/**
 * Checks connectivity and performs standard gRPC queries against an endpoint.
 * @param endpoint The gRPC endpoint details.
 * @returns An array of ValidationResult objects for the gRPC checks.
 */
async function checkGrpcServices(endpoint: Endpoint): Promise<ValidationResult[]> {
  const results: ValidationResult[] = [];
  const pagination = { pagination: { limit: String(PAGINATION_LIMIT), count_total: false } };

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
  }
  results.push(connResult);

  if (connResult.status !== 'ok') {
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

  results.push(await performGrpcQuery(endpoint, 'cosmos.bank.v1beta1.Query', 'cosmos/bank/v1beta1/query.proto', 'TotalSupply', pagination));
  results.push(await performGrpcQuery(endpoint, 'cosmos.staking.v1beta1.Query', 'cosmos/staking/v1beta1/query.proto', 'Params'));
  results.push(await performGrpcQuery(endpoint, 'ibc.applications.transfer.v1.Query', 'ibc/applications/transfer/v1/query.proto', 'DenomTraces', pagination));
  results.push(await performGrpcQuery(endpoint, 'ibc.core.channel.v1.Query', 'ibc/core/channel/v1/query.proto', 'Channels', pagination));
  results.push(await performGrpcQuery(endpoint, 'ibc.core.client.v1.Query', 'ibc/core/client/v1/query.proto', 'ClientStates', pagination));
  results.push(await performGrpcQuery(endpoint, 'cosmos.base.tendermint.v1beta1.Service', 'cosmos/base/tendermint/v1beta1/query.proto', 'GetNodeInfo'));

  return results;
}

/**
 * Main validation function for an Initia chain configuration file.
 * Loads the config, validates its schema, checks against the registry, and tests endpoints.
 * @param configPath The absolute path to the chain configuration file.
 * @returns A promise resolving to an array of all validation results.
 */
async function validateInitiaConfig(configPath: string): Promise<ValidationResult[]> {
  const allResults: ValidationResult[] = [];

  let config: InitiaConfig;
  try {
    const rawConfig = fs.readFileSync(configPath, 'utf-8');
    config = JSON.parse(rawConfig);
    allResults.push({ test: 'Load Config', status: 'ok', message: `Successfully loaded config from ${configPath}` });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    allResults.push({ test: 'Load Config', status: 'error', message: `Failed to load or parse config: ${errorMessage}` });
    return allResults;
  }

  if (typeof config !== 'object' || !config?.chain_type) {
       allResults.push({ test: 'Schema Validation', status: 'error', message: 'Config is missing chain_type field.' });
       return allResults;
  }
  
  const schemaResult = validateSchema(config);
  allResults.push(schemaResult);
  if (schemaResult.status === 'error') {
  }

  if (schemaResult.status === 'ok') {
      const registryResults = await checkRegistry(config);
      allResults.push(...registryResults);
  } else {
       allResults.push({ test: 'Registry Check', status: 'skipped', message: 'Skipped due to schema validation failure.' });
  }

  const { cosmos_sdk_grpc_endpoint, tendermint_rpc_endpoint, lcd_rest_endpoint } = config.apis;

  if (cosmos_sdk_grpc_endpoint) {
    const grpcResults = await checkGrpcServices(cosmos_sdk_grpc_endpoint);
    allResults.push(...grpcResults);
  } else {
    allResults.push({ test: 'gRPC Checks', status: 'skipped', message: 'No gRPC endpoint defined in config.' });
  }

  if (tendermint_rpc_endpoint) {
    allResults.push(await checkRpc(tendermint_rpc_endpoint));
  } else {
    allResults.push({ test: 'RPC Check', status: 'skipped', message: 'No RPC endpoint defined in config.' });
  }

  if (lcd_rest_endpoint) {
    allResults.push(await checkLcd(lcd_rest_endpoint));
  } else {
    allResults.push({ test: 'LCD/REST Check', status: 'skipped', message: 'No LCD/REST endpoint defined in config.' });
  }

  return allResults;
}

// Script execution entry point
(async () => {
  const args = process.argv.slice(2);
  if (args.length !== 1) {
    console.error('Usage: ts-node src/validate-initia.ts <path/to/initia-config.json>');
    process.exit(1);
  }

  const configPath = args[0];
  console.log(`Validating Initia config: ${configPath}...\n`);

  const results = await validateInitiaConfig(configPath);

  console.log('--- Validation Results ---');
  let hasError = false;
  results.forEach(result => {
    let prefix = '[?]';
    if (result.status === 'ok') prefix = '[✓]';
    if (result.status === 'warning') prefix = '[!] ' 
    if (result.status === 'error') {
        prefix = '[✗]';
        hasError = true;
    }
    if (result.status === 'skipped') prefix = '[-]';

    console.log(`${prefix} ${result.test}${result.endpoint ? ' (' + result.endpoint + ')' : ''}: ${result.message}`);
    if (result.status === 'error' && result.details) {
      console.log('   Details:', JSON.stringify(result.details, null, 2));
    }
  });

  console.log('\n--- Summary ---');
  if (hasError) {
    console.error('Validation Failed! See errors above.');
    process.exit(1);
  } else {
    console.log('Validation Successful!');
    process.exit(0);
  }
})();