import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';

/**
 * Executes a validation script (e.g., validate-initia.ts) as a separate process.
 * Handles finding the script, running it via ts-node, and checking the exit code.
 *
 * @param scriptName - The name of the validation script file (e.g., 'validate-initia.ts').
 * @param filePath - The relative path from the project root to the data file to validate.
 * @returns True if the script executed successfully (exit code 0), false otherwise.
 */
function runValidationScript(scriptName: string, filePath: string): boolean {
  const scriptPath = path.resolve(__dirname, scriptName);
  const absoluteFilePath = path.resolve(filePath);

  console.log(`--- Running: ${scriptName} on ${absoluteFilePath} ---`);

  if (!fs.existsSync(scriptPath)) {
    console.error(`[✗] Error: Validation script not found: ${scriptPath}`);
    return false;
  }

  const result = spawnSync(
    'npx',
    ['--no-install', 'ts-node', scriptPath, absoluteFilePath],
    {
      stdio: 'inherit',
      shell: true,
      encoding: 'utf-8'
    }
  );

  if (result.error) {
    console.error(`[✗] Error executing script ${scriptName}: ${result.error.message}`);
    return false;
  }

  if (result.status !== 0) {
    console.error(`[✗] Script ${scriptName} failed with exit code ${result.status}`);
    return false;
  }

  console.log(`--- Completed: ${scriptName} ---`);
  return true;
}

/**
 * Executes the generic validate-schema.ts script as a separate process.
 * Handles finding the script, running it via ts-node with schema and data paths, and checking the exit code.
 *
 * @param schemaPathRelative - Relative path from the project root to the schema file.
 * @param dataPathRelative - Relative path from the project root to the data file.
 * @returns True if the script executed successfully (exit code 0), false otherwise.
 */
function runGenericSchemaValidator(schemaPathRelative: string, dataPathRelative: string): boolean {
  const scriptPath = path.resolve(__dirname, 'validate-schema.ts');
  const absoluteSchemaPath = path.resolve(schemaPathRelative);
  const absoluteDataPath = path.resolve(dataPathRelative);

  console.log(`--- Running: validate-schema.ts on ${absoluteDataPath} using ${absoluteSchemaPath} ---`);

  if (!fs.existsSync(scriptPath)) {
    console.error(`[✗] Error: Validation script not found: ${scriptPath}`);
    return false;
  }

  const result = spawnSync(
    'npx',
    ['--no-install', 'ts-node', scriptPath, schemaPathRelative, dataPathRelative],
    {
      stdio: 'inherit',
      shell: true,
      encoding: 'utf-8'
    }
  );

  if (result.error) {
    console.error(`[✗] Error executing script validate-schema.ts: ${result.error.message}`);
    return false;
  }

  if (result.status !== 0) {
    console.error(`[✗] Script validate-schema.ts failed with exit code ${result.status}`);
    return false;
  }

  console.log(`--- Completed: validate-schema.ts ---`);
  return true;
}

/**
 * Main entry point for the local validation CLI wrapper.
 * Takes a single file path argument, determines the file type,
 * and dispatches to the appropriate validation script runner.
 */
async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 1) {
    console.error('Usage: ts-node src/validate.ts <path/to/file.json>');
    process.exit(1);
  }

  const relativeFilePath = args[0];
  const absoluteFilePath = path.resolve(relativeFilePath);

  if (!fs.existsSync(absoluteFilePath)) {
    console.error(`Error: File not found: ${absoluteFilePath}`);
    process.exit(1);
  }

  console.log(`Validating file: ${absoluteFilePath}`);

  let success = false;
  const fileName = path.basename(relativeFilePath);

  if (fileName === 'chain.json') {
    console.log("Detected chain.json. Checking chain_type...");
    try {
      const configContent = fs.readFileSync(relativeFilePath, 'utf-8');
      const config = JSON.parse(configContent);

      if (config?.chain_type === 'initia') {
        console.log("Chain type is 'initia'.");
        success = runValidationScript('validate-initia.ts', relativeFilePath);
      } else {
        console.log(`Chain type is '${config?.chain_type || 'missing'}'.`);
        success = runGenericSchemaValidator('chain.schema.json', relativeFilePath);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[✗] Error reading or parsing ${relativeFilePath}: ${errorMessage}`);
      success = false;
    }
  } else if (fileName === 'assetlist.json') {
    success = runGenericSchemaValidator('assetlist.schema.json', relativeFilePath);
  } else if (fileName === 'groups.json') {
    success = runGenericSchemaValidator('groups.schema.json', relativeFilePath);
  } else if (fileName === 'group_assets.json') {
    success = runGenericSchemaValidator('group_assets.schema.json', relativeFilePath);
  } else {
    console.log(`Skipping file (unrecognized type): ${fileName}`);
    success = true;
  }

  console.log('\n--- Overall Result ---');
  if (success) {
    console.log('[✓] Validation successful or file skipped.');
    process.exit(0);
  } else {
    console.error('[✗] Validation failed.');
    process.exit(1);
  }
}

main().catch(error => {
  console.error("An unexpected error occurred:", error);
  process.exit(1);
}); 