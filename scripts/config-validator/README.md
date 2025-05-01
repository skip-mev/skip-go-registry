# Chain/Assetlist/Groups Configuration Validator

This directory contains scripts used by the CI workflow to validate configuration files for chains, assetlists, and groups within the registry.

## Purpose

The goal is to ensure that any new or modified configuration files submitted via Pull Request adhere to the defined schemas and, for Initia chains, pass additional functional checks.

## CI Workflow Process

The main workflow is defined in `.github/workflows/config_validation.yml`.

1.  **Trigger:** Runs on pull requests that modify any `.json` file under the `chains/` or `groups/` directories.
2.  **Identify Changes:** Uses the `tj-actions/changed-files` action to get a list of modified/added JSON files.
3.  **Install Dependencies:** Sets up Node.js and installs dependencies defined in `package.json` (primarily `jsonschema` for validation).
4.  **Dispatch Validation:** For each changed JSON file:
    *   If the file is named `chain.json`:
        *   It reads the `.chain_type` field using `jq`.
        *   If `chain_type` is `initia`, it runs `src/validate-initia.ts`.
        *   Otherwise, it runs `src/validate-general.ts`.
    *   If the file is named `assetlist.json`, it runs `src/validate-assetlist.ts`.
    *   If the file is named `groups.json`, it runs `src/validate-groups.ts`.
    *   If the file is named `group_assets.json`, it runs `src/validate-group-assets.ts`.
    *   Other `.json` files are skipped.
5.  **Report Status:** If any validation script fails (exits with a non-zero status code), the workflow step fails.

## Validation Scripts

*   **`src/validate-initia.ts`**: Validates Initia `chain.json` files against `../../initia.chain.schema.json`. Also performs functional checks:
    *   Compares config against the official Initia registry.
    *   Checks RPC, gRPC, and LCD endpoint connectivity and basic queries.
*   **`src/validate-general.ts`**: Validates non-Initia `chain.json` files against `../../chain.schema.json`.
*   **`src/validate-assetlist.ts`**: Validates `assetlist.json` files against `../../assetlist.schema.json`.
*   **`src/validate-groups.ts`**: Validates `groups.json` files against `../../groups.schema.json`.
*   **`src/validate-group-assets.ts`**: Validates `group_assets.json` files against `../../group_assets.schema.json`.

All validation scripts use the `jsonschema` library for schema validation.

## Adding New Chains/Groups

1.  **Create Directory:** Add a new directory under `chains/` (e.g., `chains/mynewchain-1/`) or `groups/` (e.g., `groups/mainnet/`).
2.  **Add Config Files:**
    *   For chains, add `chain.json` and `assetlist.json`.
    *   For groups, add `groups.json` and/or `group_assets.json`.
3.  **Schema Compliance:** Ensure the content of your files complies with the corresponding root schema file (`chain.schema.json`, `initia.chain.schema.json`, `assetlist.schema.json`, `groups.schema.json`, `group_assets.schema.json`).
4.  **Initia Specifics:** If adding an Initia chain, make sure `chain_type` is set to `initia` and all endpoints are functional.
5.  **Submit PR:** When you submit a Pull Request with these changes, the CI workflow will automatically run the validation.

## Local Testing

To test validation locally before committing or creating a PR, you can use the wrapper script `src/validate.ts`.

1.  **Install Dependencies:** Make sure you've run `npm install` within this directory (`scripts/config-validator`).
2.  **Run Validation:** From the **root** of the repository, execute:
    ```bash
    npx ts-node scripts/config-validator/src/validate.ts <path/to/your/file.json>
    ```
    Replace `<path/to/your/file.json>` with the actual path to the `chain.json`, `assetlist.json`, `groups.json`, or `group_assets.json` file you want to test.

    The script will automatically detect the file type, determine if a chain is Initia, and run the appropriate detailed validation script (`validate-initia.ts`, `validate-general.ts`, etc.). 