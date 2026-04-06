import { BrainDatabase } from "../core/db";

const PUBLIC_CONFIG_KEYS = new Set([
  "embedding_model",
  "embedding_dimensions",
  "chunk_strategy",
]);

function requireSupportedConfigKey(key: string): string {
  if (!PUBLIC_CONFIG_KEYS.has(key)) {
    throw new Error(`Unsupported config key: ${key}`);
  }

  return key;
}

export function runConfigGet(dbPath: string, key: string): string {
  const brain = new BrainDatabase(dbPath);
  const supportedKey = requireSupportedConfigKey(key);

  try {
    brain.initialize();
    const value = brain.getConfig(supportedKey);

    if (value === null) {
      throw new Error(`Config key not found: ${supportedKey}`);
    }

    return value;
  } finally {
    brain.close();
  }
}

export function runConfigSet(dbPath: string, key: string, value: string): string {
  const brain = new BrainDatabase(dbPath);
  const supportedKey = requireSupportedConfigKey(key);

  try {
    brain.initialize();
    brain.setConfig(supportedKey, value);
    return `${supportedKey}=${value}`;
  } finally {
    brain.close();
  }
}
