import { BrainDatabase } from "../core/db";

export function runConfigGet(dbPath: string, key: string): string {
  const brain = new BrainDatabase(dbPath);

  try {
    brain.initialize();
    return brain.getConfig(key) ?? "";
  } finally {
    brain.close();
  }
}

export function runConfigSet(dbPath: string, key: string, value: string): string {
  const brain = new BrainDatabase(dbPath);

  try {
    brain.initialize();
    brain.setConfig(key, value);
    return `${key}=${value}`;
  } finally {
    brain.close();
  }
}
