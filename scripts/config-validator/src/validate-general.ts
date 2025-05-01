import Ajv, { Schema } from 'ajv';
import * as fs from 'fs';
import * as path from 'path';

// Simple script to validate a chain config against the general chain.schema.json

function validateGeneralConfig(configPath: string): { status: 'ok' | 'error', message: string, details?: any } {
  let schema: Schema;
  try {
    // Construct path relative to the current script file (__dirname), up three levels to project root
    const schemaPath = path.resolve(__dirname, '../../../chain.schema.json');
    const schemaContent = fs.readFileSync(schemaPath, 'utf-8');
    schema = JSON.parse(schemaContent);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      status: 'error',
      message: `Failed to load or parse chain.schema.json: ${errorMessage}`
    };
  }

  let config: any;
  try {
    const configContent = fs.readFileSync(configPath, 'utf-8');
    config = JSON.parse(configContent);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      status: 'error',
      message: `Failed to load or parse config file ${configPath}: ${errorMessage}`
    };
  }

  const ajv = new Ajv();
  let validate;
  try {
    validate = ajv.compile(schema);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      status: 'error',
      message: `Failed to compile schema: ${errorMessage}`
    };
  }

  const valid = validate(config);
  return {
    status: valid ? 'ok' : 'error',
    message: valid ? 'Schema is valid according to chain.schema.json.' : 'Schema is invalid according to chain.schema.json.',
    details: valid ? null : validate.errors
  };
}

// Script execution
(async () => {
  const args = process.argv.slice(2);
  if (args.length !== 1) {
    console.error('Usage: ts-node src/validate-general.ts <path/to/chain-config.json>');
    process.exit(1);
  }

  const configPath = args[0];
  console.log(`Validating general chain config: ${configPath}...`);

  const result = validateGeneralConfig(configPath);

  console.log(`Result: ${result.status === 'ok' ? '[✓]' : '[✗]'} ${result.message}`);
  if (result.status === 'error' && result.details) {
    console.log('Details:', JSON.stringify(result.details, null, 2));
  }

  if (result.status === 'error') {
    process.exit(1);
  } else {
    process.exit(0);
  }
})(); 