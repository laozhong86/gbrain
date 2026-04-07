export type OpenClawMessage = {
  role?: "user" | "assistant" | "system";
  content?: string;
};

export type OpenClawHookEvent = {
  session?: {
    id?: string;
    messages?: OpenClawMessage[];
  };
};

export function shouldIngestSession(messages: OpenClawMessage[]): boolean;
export function renderTranscript(messages: OpenClawMessage[], now?: Date): string;
export function ingestSessionTranscript(
  event: OpenClawHookEvent,
  options?: {
    now?: Date;
    tmpDir?: string;
    writeTextFile?: (path: string, text: string) => void;
    runIngest?: (filePath: string, sourceRef: string) => void;
  },
): Promise<{ ingested: boolean; reason?: string; filePath?: string; sourceRef?: string }>;
declare const handler: (event: OpenClawHookEvent) => Promise<void>;
export default handler;
