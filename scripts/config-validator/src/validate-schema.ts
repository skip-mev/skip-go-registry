import { Validator } from 'jsonschema';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Generic script to validate a JSON data file against a specified JSON schema file.
 * Used for non-Initia chains, assetlists, groups, and group assets.
 */

/**
 * Loads a schema and data file, then validates the data against the schema using jsonschema.
 *
 * @param schemaPathRelative - Relative path from the project root to the schema file.
 * @param dataPathRelative - Relative path from the project root to the data file.
 * @returns An object indicating validation status ('ok' or 'error'), a message, and validation details on error.
 */
function validateGenericSchema(schemaPathRelative: string, dataPathRelative: string): { status: 'ok' | 'error', message: string, details?: any } {
  let schema: any;
  const validator = new Validator();

  // Resolve paths relative to the current working directory (project root)
  const absoluteSchemaPath = path.resolve(schemaPathRelative);
  const absoluteDataPath = path.resolve(dataPathRelative);

  const schemaFileName = path.basename(absoluteSchemaPath);
  const dataFileName = path.basename(absoluteDataPath);

  // Load Schema
  try {
    if (!fs.existsSync(absoluteSchemaPath)) {
      throw new Error(`Schema file not found: ${absoluteSchemaPath}`);
    }
    const schemaContent = fs.readFileSync(absoluteSchemaPath, 'utf-8');
    schema = JSON.parse(schemaContent);
    validator.addSchema(schema, `/${schemaFileName}`); // Add schema with a base URI
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      status: 'error',
      message: `Failed to load or parse schema ${schemaFileName}: ${errorMessage}`
    };
  }

  // Load Data File
  let data: any;
  try {
    if (!fs.existsSync(absoluteDataPath)) {
      throw new Error(`Data file not found: ${absoluteDataPath}`);
    }
    const dataContent = fs.readFileSync(absoluteDataPath, 'utf-8');
    data = JSON.parse(dataContent);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      status: 'error',
      message: `Failed to load or parse data file ${dataFileName}: ${errorMessage}`
    };
  }

  // Perform Validation
  const validationResult = validator.validate(data, schema);

  if (validationResult.valid) {
     return {
        status: 'ok',
        message: `${dataFileName} is valid according to ${schemaFileName}.`,
        details: null
    };
  } else {
     const errors = validationResult.errors.map((err: any) => `${err.property}: ${err.message}`).join('; ');
     return {
        status: 'error',
        message: `${dataFileName} is invalid according to ${schemaFileName}: ${errors}`,
        details: validationResult.errors
    };
  }
}

// Script Execution
(async () => {
  const args = process.argv.slice(2);
  if (args.length !== 2) {
    console.error('Usage: ts-node src/validate-schema.ts <relative/path/to/schema.json> <relative/path/to/data.json>');
    process.exit(1);
  }

  const schemaPathArg = args[0];
  const dataPathArg = args[1];

  console.log(`Validating ${dataPathArg} against schema ${schemaPathArg}...`);

  // Pass relative paths as received from args
  const result = validateGenericSchema(schemaPathArg, dataPathArg);

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