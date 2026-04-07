import { chmodSync, existsSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { createHash } from "node:crypto";
import { runVersion } from "./version";

const CHECKSUMS_ASSET_NAME = "SHA256SUMS";

interface ReleaseAsset {
  browser_download_url: string;
  name: string;
}

interface ReleaseResponse {
  assets?: ReleaseAsset[];
  tag_name?: string;
}

export interface UpgradeOptions {
  apiUrl?: string;
  assetName?: string;
  checkOnly?: boolean;
  checksumsAssetName?: string;
  currentVersion?: string;
  executablePath?: string;
  fetchImpl?: typeof fetch;
}

function normalizeVersion(version: string): string {
  return version.startsWith("v") ? version.slice(1) : version;
}

function getDefaultAssetName(): string {
  switch (`${process.platform}-${process.arch}`) {
    case "darwin-arm64":
      return "gbrain-darwin-arm64";
    case "darwin-x64":
      return "gbrain-darwin-x64";
    case "linux-x64":
      return "gbrain-linux-x64";
    default:
      throw new Error(`Self-update is not supported on ${process.platform}-${process.arch}`);
  }
}

function assertUpgradeableExecutable(executablePath: string): void {
  const name = basename(executablePath).toLowerCase();

  if (name === "bun" || name.startsWith("bun-")) {
    throw new Error("Self-update only works when running the compiled gbrain binary");
  }

  if (!existsSync(executablePath)) {
    throw new Error(`Executable not found: ${executablePath}`);
  }
}

async function fetchRelease(
  apiUrl: string,
  fetchImpl: typeof fetch,
): Promise<Required<ReleaseResponse>> {
  const response = await fetchImpl(apiUrl, {
    headers: {
      accept: "application/vnd.github+json",
      "user-agent": "gbrain-self-update",
    },
  });

  if (!response.ok) {
    throw new Error(`Release lookup failed with ${response.status}`);
  }

  const payload = (await response.json()) as ReleaseResponse;

  if (!payload.tag_name || !Array.isArray(payload.assets)) {
    throw new Error("Release response did not include tag_name and assets");
  }

  return {
    assets: payload.assets,
    tag_name: payload.tag_name,
  };
}

async function downloadAsset(
  asset: ReleaseAsset,
  fetchImpl: typeof fetch,
): Promise<Buffer> {
  const response = await fetchImpl(asset.browser_download_url, {
    headers: {
      "user-agent": "gbrain-self-update",
    },
  });

  if (!response.ok) {
    throw new Error(`Asset download failed with ${response.status}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

function readExpectedChecksum(checksumContent: string, assetName: string): string {
  const line = checksumContent
    .split(/\r?\n/)
    .find((entry) => entry.trim().length > 0 && entry.trim().endsWith(assetName));

  if (!line) {
    throw new Error(`No checksum entry was found for ${assetName}`);
  }

  const [checksum] = line.trim().split(/\s+/);

  if (!checksum) {
    throw new Error(`Invalid checksum entry for ${assetName}`);
  }

  return checksum.toLowerCase();
}

function verifyChecksum(buffer: Buffer, expectedChecksum: string, assetName: string): void {
  const actualChecksum = createHash("sha256").update(buffer).digest("hex");

  if (actualChecksum !== expectedChecksum) {
    throw new Error(
      `Checksum verification failed for ${assetName}: expected ${expectedChecksum}, got ${actualChecksum}`,
    );
  }
}

export async function runUpgrade(options: UpgradeOptions = {}): Promise<string> {
  const apiUrl = options.apiUrl ?? "https://api.github.com/repos/laozhong86/gbrain/releases/latest";
  const assetName = options.assetName ?? getDefaultAssetName();
  const checksumsAssetName = options.checksumsAssetName ?? CHECKSUMS_ASSET_NAME;
  const currentVersion = normalizeVersion(options.currentVersion ?? runVersion());
  const executablePath = options.executablePath ?? process.execPath;
  const fetchImpl = options.fetchImpl ?? fetch;

  const release = await fetchRelease(apiUrl, fetchImpl);
  const latestVersion = normalizeVersion(release.tag_name);

  if (latestVersion === currentVersion) {
    return `gbrain ${currentVersion} is already up to date`;
  }

  if (options.checkOnly) {
    return `Update available: ${currentVersion} -> ${latestVersion}`;
  }

  assertUpgradeableExecutable(executablePath);

  const asset = release.assets.find((entry) => entry.name === assetName);
  const checksumsAsset = release.assets.find((entry) => entry.name === checksumsAssetName);

  if (!asset) {
    throw new Error(
      `No release asset named ${assetName} was found in release ${release.tag_name}`,
    );
  }

  if (!checksumsAsset) {
    throw new Error(
      `No release asset named ${checksumsAssetName} was found in release ${release.tag_name}`,
    );
  }

  const tempDir = mkdtempSync(join(tmpdir(), "gbrain-upgrade-"));
  const tempPath = join(tempDir, asset.name);

  try {
    const [binaryBuffer, checksumsBuffer] = await Promise.all([
      downloadAsset(asset, fetchImpl),
      downloadAsset(checksumsAsset, fetchImpl),
    ]);
    const expectedChecksum = readExpectedChecksum(checksumsBuffer.toString("utf8"), asset.name);
    verifyChecksum(binaryBuffer, expectedChecksum, asset.name);
    writeFileSync(tempPath, binaryBuffer);
    chmodSync(tempPath, 0o755);
    renameSync(tempPath, executablePath);
  } finally {
    rmSync(tempDir, { force: true, recursive: true });
  }

  return `Updated gbrain from ${currentVersion} to ${latestVersion}`;
}
