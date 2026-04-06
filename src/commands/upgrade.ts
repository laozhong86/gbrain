import { chmodSync, existsSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { runVersion } from "./version";

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
  targetPath: string,
): Promise<void> {
  const response = await fetchImpl(asset.browser_download_url, {
    headers: {
      "user-agent": "gbrain-self-update",
    },
  });

  if (!response.ok) {
    throw new Error(`Asset download failed with ${response.status}`);
  }

  const body = await response.arrayBuffer();
  writeFileSync(targetPath, Buffer.from(body));
  chmodSync(targetPath, 0o755);
}

export async function runUpgrade(options: UpgradeOptions = {}): Promise<string> {
  const apiUrl = options.apiUrl ?? "https://api.github.com/repos/laozhong86/gbrain/releases/latest";
  const assetName = options.assetName ?? getDefaultAssetName();
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

  if (!asset) {
    throw new Error(
      `No release asset named ${assetName} was found in release ${release.tag_name}`,
    );
  }

  const tempDir = mkdtempSync(join(tmpdir(), "gbrain-upgrade-"));
  const tempPath = join(tempDir, asset.name);

  try {
    await downloadAsset(asset, fetchImpl, tempPath);
    renameSync(tempPath, executablePath);
  } finally {
    rmSync(tempDir, { force: true, recursive: true });
  }

  return `Updated gbrain from ${currentVersion} to ${latestVersion}`;
}
