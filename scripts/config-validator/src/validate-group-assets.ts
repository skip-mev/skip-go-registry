import { Validator } from 'jsonschema';
import * as fs from 'fs';
import * as path from 'path';

// Simple script to validate a group assets config against the group_assets.schema.json

function validateGroupAssetsConfig(configPath: string): { status: 'ok' | 'error', message: string, details?: any } {
  let schema: any;
  const validator = new Validator();

  try {
    const schemaPath = path.resolve(__dirname, '../../../group_assets.schema.json');
    const schemaContent = fs.readFileSync(schemaPath, 'utf-8');
    schema = JSON.parse(schemaContent);
    validator.addSchema(schema, '/group_assets.schema.json');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      status: 'error',
      message: `Failed to load or parse group_assets.schema.json: ${errorMessage}`
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
      message: `Failed to load or parse group assets config file ${configPath}: ${errorMessage}`
    };
  }

  const validationResult = validator.validate(config, schema);

  if (validationResult.valid) {
     return {
        status: 'ok',
        message: 'Group assets config is valid according to group_assets.schema.json.',
        details: null
    };
  } else {
     const errors = validationResult.errors.map((err: any) => `${err.property}: ${err.message}`).join('; ');
     return {
        status: 'error',
        message: `Group assets config is invalid according to group_assets.schema.json: ${errors}`,
        details: validationResult.errors
    };
  }
}

// Script execution
(async () => {
  const args = process.argv.slice(2);
  if (args.length !== 1) {
    console.error('Usage: ts-node src/validate-group-assets.ts <path/to/group_assets.json>');
    process.exit(1);
  }

  const configPath = args[0];
  console.log(`Validating group assets config: ${configPath}...`);

  const result = validateGroupAssetsConfig(configPath);

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