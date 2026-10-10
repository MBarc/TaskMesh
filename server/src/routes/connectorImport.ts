import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import { connectorsDir, registerConnector } from '../connectors/registry.js';
import { capture } from '../lib/telemetry.js';

const REQUIRED_FIELDS = ['id', 'name', 'version', 'capabilities'];
const RESERVED_IDS = ['framework'];
const VALID_ID = /^[a-z0-9-]+$/;

function validateManifest(obj: Record<string, unknown>): string | null {
  for (const field of REQUIRED_FIELDS) {
    if (!obj[field]) return `manifest.json is missing required field: "${field}".`;
  }
  if (typeof obj.id !== 'string' || !VALID_ID.test(obj.id as string)) {
    return 'Connector ID must only contain lowercase letters, numbers, and hyphens.';
  }
  if (RESERVED_IDS.includes(obj.id as string)) {
    return `"${obj.id as string}" is a reserved connector ID and cannot be used.`;
  }
  if (!Array.isArray(obj.capabilities)) {
    return '"capabilities" must be an array.';
  }
  return null;
}

export const connectorImportRouter = Router();

connectorImportRouter.post('/', async (req, res) => {
  // Uploading a connector compiles and runs its code inside the server process,
  // which on installed copies is a SYSTEM service. The API has no login, so any
  // local program could use this to run code as SYSTEM. It is therefore off unless
  // explicitly enabled (connector development); installing a connector otherwise
  // means an administrator copying its folder into connectorsDir and restarting.
  if (process.env.TASKMESH_ALLOW_CONNECTOR_UPLOAD !== '1') {
    return res.status(403).json({
      error: `Uploading connectors from the app is disabled for security. To install one, copy its folder (manifest.json + handlers.js) into ${connectorsDir} as an administrator and restart TaskMesh. Connector developers can set TASKMESH_ALLOW_CONNECTOR_UPLOAD=1.`,
    });
  }

  const { manifestJson, handlerCode } = req.body as {
    manifestJson?: string;
    handlerCode?: string;
  };

  if (!manifestJson?.trim() || !handlerCode?.trim()) {
    return res.status(400).json({
      error: 'Both manifest.json and handlers.ts content are required.',
    });
  }

  // Parse and validate manifest
  let manifest: Record<string, unknown>;
  try {
    manifest = JSON.parse(manifestJson);
  } catch {
    return res.status(400).json({
      error: 'manifest.json is not valid JSON. Check for missing commas, brackets, or quotes.',
    });
  }

  if (typeof manifest !== 'object' || Array.isArray(manifest) || manifest === null) {
    return res.status(400).json({ error: 'manifest.json must be a JSON object.' });
  }

  const validationError = validateManifest(manifest);
  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  const connectorId = manifest.id as string;
  const connectorDir = path.join(connectorsDir, connectorId);

  // Create connector directory and write both files
  fs.mkdirSync(connectorDir, { recursive: true });
  const handlersTsPath = path.join(connectorDir, 'handlers.ts');
  const handlersJsPath = path.join(connectorDir, 'handlers.js');

  fs.writeFileSync(
    path.join(connectorDir, 'manifest.json'),
    JSON.stringify(manifest, null, 2),
    'utf-8',
  );
  fs.writeFileSync(handlersTsPath, handlerCode, 'utf-8');

  // Compile handlers.ts → handlers.js using esbuild
  try {
    const { build } = await import('esbuild');
    await build({
      entryPoints: [handlersTsPath],
      outfile: handlersJsPath,
      bundle: false,
      platform: 'node',
      format: 'cjs',
      target: 'node20',
    });
  } catch (err: unknown) {
    fs.rmSync(connectorDir, { recursive: true, force: true });
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(400).json({
      error: `handlers.ts has a compile error: ${msg}`,
    });
  }

  // Dynamically load and mount the connector without restarting
  try {
    const registeredManifest = await registerConnector(connectorDir);
    capture('connector_installed', { connector: registeredManifest.id, connector_name: registeredManifest.name });
    return res.json({ success: true, connector: registeredManifest });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: `Failed to register connector: ${msg}` });
  }
});
