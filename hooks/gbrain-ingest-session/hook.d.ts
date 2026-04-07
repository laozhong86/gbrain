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
export function extractMemoryItems(messages: OpenClawMessage[]): string[];
export function renderExtractedMemoryPage(
  sessionId: string,
  sourceRef: string,
  messages: OpenClawMessage[],
  now?: Date,
): string;
export function ingestSessionTranscript(
  event: OpenClawHookEvent,
  options?: {
    now?: Date;
    tmpDir?: string;
    dbPath?: string;
    gbrainBin?: string;
    writeTextFile?: (path: string, text: string) => void;
    runIngest?: (filePath: string, sourceRef: string, dbPath: string, binaryPath: string) => void;
    runPut?: (slug: string, markdown: string, dbPath: string, binaryPath: string) => void;
    runLink?: (fromSlug: string, toSlug: string, dbPath: string, binaryPath: string) => void;
  },
): Promise<{
  ingested: boolean;
  reason?: string;
  filePath?: string;
  sourceRef?: string;
  dbPath?: string;
  sourceSlug?: string;
  extractedSlug?: string;
  extracted?: boolean;
}>;
declare const handler: (event: OpenClawHookEvent) => Promise<void>;
export default handler;
