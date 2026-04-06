import { BrainDatabase } from "../core/db";

export function runInit(dbPath: string): string {
  const brain = new BrainDatabase(dbPath);

  try {
    brain.initialize();
    return `Initialized ${dbPath}`;
  } finally {
    brain.close();
  }
}
