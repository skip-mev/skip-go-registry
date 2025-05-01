import { Validator } from 'jsonschema'; // Use jsonschema
import * as fs from 'fs';
import * as path from 'path';

// Simple script to validate an assetlist against the assetlist.schema.json

function validateAssetListConfig(configPath: string): { status: 'ok' | 'error', message: string, details?: any } {
  let schema: any; // Use any type for now
  const validator = new Validator();

  try {
    // Construct path relative to the current script file (__dirname), up three levels to project root
    const schemaPath = path.resolve(__dirname, '../../../assetlist.schema.json');
    const schemaContent = fs.readFileSync(schemaPath, 'utf-8');
    schema = JSON.parse(schemaContent);
    // Pre-add schema
    validator.addSchema(schema, '/assetlist.schema.json');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      status: 'error',
      message: `Failed to load or parse assetlist.schema.json: ${errorMessage}`
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
      message: `Failed to load or parse assetlist file ${configPath}: ${errorMessage}`
    };
  }

  // Perform validation
  const validationResult = validator.validate(config, schema);

  if (validationResult.valid) {
     return {
        status: 'ok',
        message: 'Assetlist is valid according to assetlist.schema.json.',
        details: null
    };
  } else {
     const errors = validationResult.errors.map((err: any) => `${err.property}: ${err.message}`).join('; ');
     return {
        status: 'error',
        message: `Assetlist is invalid according to assetlist.schema.json: ${errors}`,
        details: validationResult.errors
    };
  }
}

// Script execution
(async () => {
  const args = process.argv.slice(2);
  if (args.length !== 1) {
    console.error('Usage: ts-node src/validate-assetlist.ts <path/to/assetlist.json>');
    process.exit(1);
  }

  const configPath = args[0];
  console.log(`Validating assetlist: ${configPath}...`);

  const result = validateAssetListConfig(configPath);

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