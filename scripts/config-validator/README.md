# Chain/Assetlist Configuration Validator

This directory contains scripts used by the CI workflow to validate configuration files for chains and assetlists within the registry.

## Purpose

The goal is to ensure that any new or modified configuration files submitted via Pull Request adhere to the defined schemas and, for Initia chains, pass additional functional checks.

## CI Workflow Process

The main workflow is defined in `.github/workflows/config_validation.yml`.

1.  **Trigger:** Runs on pull requests that modify any `.json` file under the `chains/` directory.
2.  **Identify Changes:** Uses the `tj-actions/changed-files` action to get a list of modified/added JSON files.
3.  **Install Dependencies:** Sets up Node.js and installs dependencies defined in `package.json` (primarily `jsonschema` for validation).
4.  **Dispatch Validation:** For each changed JSON file:
    *   If the file is named `chain.json`:
        *   It reads the `.chain_type` field using `jq`.
        *   If `chain_type` is `initia`, it runs `src/validate-initia.ts`.
        *   Otherwise, it runs `src/validate-schema.ts chain.schema.json <data-file-path>`.
    *   If the file is named `assetlist.json`, it runs `src/validate-schema.ts assetlist.schema.json <data-file-path>`.
    *   Other `.json` files are skipped.
5.  **Report Status:** If any validation script fails (exits with a non-zero status code), the workflow step fails.

## Validation Scripts

*   **`src/validate-initia.ts`**: Validates Initia `chain.json` files against `../../initia.chain.schema.json`. Also performs functional checks:
    *   Compares config against the official Initia registry.
    *   Checks RPC, gRPC, and LCD endpoint connectivity and basic queries.
*   **`src/validate-schema.ts`**: Generic script to validate a JSON data file against a specified JSON schema file. Takes schema path and data path as arguments. Used for non-Initia chains and assetlists.

Both scripts use the `jsonschema` library for schema validation.

## Adding New Chains

1.  **Create Directory:** Add a new directory under `chains/` (e.g., `chains/mynewchain-1/`).
2.  **Add Config Files:** Add `chain.json` and `assetlist.json`.
3.  **Schema Compliance:** Ensure the content of your files complies with the corresponding root schema file (`chain.schema.json`, `initia.chain.schema.json`, `assetlist.schema.json`).
4.  **Initia Specifics:** If adding an Initia chain, make sure `chain_type` is set to `initia` and all endpoints are functional.
5.  **Submit PR:** When you submit a Pull Request with these changes, the CI workflow will automatically run the validation.

## Local Testing

To test validation locally before committing or creating a PR, you can use the wrapper script `src/validate.ts`.

1.  **Install Dependencies:** Make sure you've run `npm install` within this directory (`scripts/config-validator`).
2.  **Run Validation:** From the **root** of the repository, execute:
    ```bash
    npx ts-node scripts/config-validator/src/validate.ts <path/to/your/file.json>
    ```
    Replace `<path/to/your/file.json>` with the actual path to the `chain.json` or `assetlist.json` file you want to test.

    The script will automatically detect the file type, determine if a chain is Initia, and run the appropriate validation script (`validate-initia.ts` or `validate-schema.ts` with the correct arguments). 