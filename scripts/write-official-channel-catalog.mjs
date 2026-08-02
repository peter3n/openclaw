// Builds the generated official channel catalog from publishable channel plugins.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import officialExternalChannelSeed from "./lib/official-external-channel-seed.json" with { type: "json" };
import { isRecord, trimString } from "./lib/record-shared.mjs";
import { writeTextFileIfChanged } from "./runtime-postbuild-shared.mjs";

/** Generated official channel catalog committed for source and packaged runtime consumers. */
export const OFFICIAL_CHANNEL_CATALOG_SOURCE_RELATIVE_PATH =
  "scripts/lib/official-external-channel-catalog.json";

/**
 * Generated official channel catalog path in dist.
 * @internal Directly tested script implementation detail.
 */
export const OFFICIAL_CHANNEL_CATALOG_RELATIVE_PATH = "dist/channel-catalog.json";

function toCatalogInstall(value, packageName) {
  const install = isRecord(value) ? value : {};
  const clawhubSpec = trimString(install.clawhubSpec);
  const npmSpec = trimString(install.npmSpec) || packageName;
  if (!clawhubSpec && !npmSpec) {
    return null;
  }
  const defaultChoice = trimString(install.defaultChoice);
  const minHostVersion = trimString(install.minHostVersion);
  const expectedIntegrity = trimString(install.expectedIntegrity);
  return {
    ...(clawhubSpec ? { clawhubSpec } : {}),
    ...(npmSpec ? { npmSpec } : {}),
    ...(defaultChoice === "clawhub" || defaultChoice === "npm" || defaultChoice === "local"
      ? { defaultChoice }
      : {}),
    ...(minHostVersion ? { minHostVersion } : {}),
    ...(expectedIntegrity ? { expectedIntegrity } : {}),
    ...(install.allowInvalidConfigRecovery === true ? { allowInvalidConfigRecovery: true } : {}),
  };
}

function buildCatalogEntry(packageJson) {
  if (!isRecord(packageJson)) {
    return null;
  }
  const packageName = trimString(packageJson.name);
  const manifest = isRecord(packageJson.openclaw) ? packageJson.openclaw : null;
  const release = manifest && isRecord(manifest.release) ? manifest.release : null;
  const channel = manifest && isRecord(manifest.channel) ? manifest.channel : null;
  if (!packageName || !channel || release?.publishToNpm !== true) {
    return null;
  }
  const install = toCatalogInstall(manifest.install, packageName);
  if (!install) {
    return null;
  }
  const version = trimString(packageJson.version);
  const description = trimString(packageJson.description);
  return {
    name: packageName,
    ...(version ? { version } : {}),
    ...(description ? { description } : {}),
    source: "official",
    kind: "channel",
    openclaw: {
      channel,
      install,
    },
  };
}

function getCatalogChannelId(entry) {
  return trimString(entry?.openclaw?.channel?.id) || trimString(entry?.name);
}

/**
 * Collects publishable channel catalog entries from bundled and external channels.
 * @internal Directly tested script implementation detail.
 */
export function buildOfficialChannelCatalog(params = {}) {
  const repoRoot = params.cwd ?? params.repoRoot ?? process.cwd();
  const extensionsRoot = path.join(repoRoot, "extensions");
  const entriesByChannelId = new Map();
  for (const entry of Array.isArray(officialExternalChannelSeed.entries)
    ? officialExternalChannelSeed.entries
    : []) {
    const channelId = getCatalogChannelId(entry);
    if (channelId) {
      entriesByChannelId.set(channelId, entry);
    }
  }

  if (fs.existsSync(extensionsRoot)) {
    for (const dirent of fs.readdirSync(extensionsRoot, { withFileTypes: true })) {
      if (!dirent.isDirectory()) {
        continue;
      }
      const packageJsonPath = path.join(extensionsRoot, dirent.name, "package.json");
      if (!fs.existsSync(packageJsonPath)) {
        continue;
      }
      try {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
        const entry = buildCatalogEntry(packageJson);
        const channelId = entry ? getCatalogChannelId(entry) : "";
        if (entry && channelId) {
          // Repository package metadata owns official channels. Seed entries are
          // only a fallback for channels whose packages live out of tree.
          entriesByChannelId.set(channelId, entry);
        }
      } catch {
        // Ignore invalid package metadata and keep generating the rest of the catalog.
      }
    }
  }

  const entries = [...entriesByChannelId.values()];
  entries.sort((left, right) => {
    const leftId = trimString(left.openclaw?.channel?.id) || left.name;
    const rightId = trimString(right.openclaw?.channel?.id) || right.name;
    return leftId.localeCompare(rightId);
  });

  return { entries };
}

export function renderOfficialChannelCatalog(params = {}) {
  return `${JSON.stringify(buildOfficialChannelCatalog(params), null, 2)}\n`;
}

export function writeOfficialChannelCatalog(params = {}) {
  const repoRoot = params.cwd ?? params.repoRoot ?? process.cwd();
  const outputPath = path.join(repoRoot, OFFICIAL_CHANNEL_CATALOG_RELATIVE_PATH);
  return writeTextFileIfChanged(outputPath, renderOfficialChannelCatalog({ repoRoot }));
}

export function writeOfficialChannelCatalogSource(params = {}) {
  const repoRoot = params.cwd ?? params.repoRoot ?? process.cwd();
  const outputPath = path.join(repoRoot, OFFICIAL_CHANNEL_CATALOG_SOURCE_RELATIVE_PATH);
  return writeTextFileIfChanged(outputPath, renderOfficialChannelCatalog({ repoRoot }));
}

export function checkOfficialChannelCatalogSource(params = {}) {
  const repoRoot = params.cwd ?? params.repoRoot ?? process.cwd();
  const outputPath = path.join(repoRoot, OFFICIAL_CHANNEL_CATALOG_SOURCE_RELATIVE_PATH);
  const current = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, "utf8") : "";
  return current === renderOfficialChannelCatalog({ repoRoot });
}

function main(argv = process.argv.slice(2)) {
  const write = argv.includes("--write");
  const check = argv.includes("--check");
  if (write === check) {
    console.error("usage: node scripts/write-official-channel-catalog.mjs --write|--check");
    process.exitCode = 2;
    return;
  }
  if (write) {
    writeOfficialChannelCatalogSource();
    return;
  }
  if (!checkOfficialChannelCatalogSource()) {
    console.error(
      `${OFFICIAL_CHANNEL_CATALOG_SOURCE_RELATIVE_PATH} is stale. Run \`pnpm channels:catalog:gen\`.`,
    );
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main();
}
