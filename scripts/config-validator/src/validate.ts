import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';

// Helper function to run a validation script
function runValidationScript(scriptName: string, filePath: string): boolean {
  const scriptPath = path.resolve(__dirname, scriptName);
  const absoluteFilePath = path.resolve(filePath); // Ensure absolute path for the target file

  console.log(`--- Running: ${scriptName} on ${absoluteFilePath} ---`);

  // Check if script exists before running
  if (!fs.existsSync(scriptPath)) {
    console.error(`[✗] Error: Validation script not found: ${scriptPath}`);
    return false;
  }

  // We use spawnSync to easily capture status and see output directly
  const result = spawnSync(
    'npx',
    ['--no-install', 'ts-node', scriptPath, absoluteFilePath], // '--no-install' prevents accidental installs if ts-node isn't found via npx resolution
    {
      stdio: 'inherit', // Pass through stdout/stderr
      shell: true,      // Use shell for npx resolution
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

// Main validation logic
async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 1) {
    console.error('Usage: ts-node src/validate.ts <path/to/file.json>');
    process.exit(1);
  }

  const relativeFilePath = args[0];
  const absoluteFilePath = path.resolve(relativeFilePath); // Get absolute path

  if (!fs.existsSync(absoluteFilePath)) {
    console.error(`Error: File not found: ${absoluteFilePath}`);
    process.exit(1);
  }

  console.log(`Validating file: ${absoluteFilePath}`);

  let success = false;
  const fileName = path.basename(absoluteFilePath);

  if (fileName === 'chain.json') {
    console.log("Detected chain.json. Checking chain_type...");
    try {
      const configContent = fs.readFileSync(absoluteFilePath, 'utf-8');
      const config = JSON.parse(configContent);

      if (config?.chain_type === 'initia') {
        console.log("Chain type is 'initia'.");
        success = runValidationScript('validate-initia.ts', absoluteFilePath);
      } else {
        console.log(`Chain type is '${config?.chain_type || 'missing'}'.`);
        success = runValidationScript('validate-general.ts', absoluteFilePath);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[✗] Error reading or parsing ${absoluteFilePath}: ${errorMessage}`);
      success = false;
    }
  } else if (fileName === 'assetlist.json') {
    success = runValidationScript('validate-assetlist.ts', absoluteFilePath);
  } else if (fileName === 'groups.json') {
    success = runValidationScript('validate-groups.ts', absoluteFilePath);
  } else if (fileName === 'group_assets.json') {
    success = runValidationScript('validate-group-assets.ts', absoluteFilePath);
  } else {
    console.log(`Skipping file (unrecognized type): ${fileName}`);
    success = true; // Treat unrecognized types as success (matching CI workflow)
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