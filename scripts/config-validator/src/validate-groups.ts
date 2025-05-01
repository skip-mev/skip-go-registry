import { Validator } from 'jsonschema';
import * as fs from 'fs';
import * as path from 'path';

// Simple script to validate a groups config against the groups.schema.json

function validateGroupsConfig(configPath: string): { status: 'ok' | 'error', message: string, details?: any } {
  let schema: any;
  const validator = new Validator();

  try {
    const schemaPath = path.resolve(__dirname, '../../../groups.schema.json');
    const schemaContent = fs.readFileSync(schemaPath, 'utf-8');
    schema = JSON.parse(schemaContent);
    validator.addSchema(schema, '/groups.schema.json');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      status: 'error',
      message: `Failed to load or parse groups.schema.json: ${errorMessage}`
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
      message: `Failed to load or parse groups config file ${configPath}: ${errorMessage}`
    };
  }

  const validationResult = validator.validate(config, schema);

  if (validationResult.valid) {
     return {
        status: 'ok',
        message: 'Groups config is valid according to groups.schema.json.',
        details: null
    };
  } else {
     const errors = validationResult.errors.map((err: any) => `${err.property}: ${err.message}`).join('; ');
     return {
        status: 'error',
        message: `Groups config is invalid according to groups.schema.json: ${errors}`,
        details: validationResult.errors
    };
  }
}

// Script execution
(async () => {
  const args = process.argv.slice(2);
  if (args.length !== 1) {
    console.error('Usage: ts-node src/validate-groups.ts <path/to/groups.json>');
    process.exit(1);
  }

  const configPath = args[0];
  console.log(`Validating groups config: ${configPath}...`);

  const result = validateGroupsConfig(configPath);

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