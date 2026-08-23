import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const PI_VENDOR_PACKAGES = new Map([
  ["agent", "pi-agent"],
  ["ai", "pi-ai"],
  ["client", "pi-client"],
  ["coding-agent", "pi-coding-agent"],
  ["protocol", "pi-protocol"],
  ["telemetry", "pi-telemetry"],
  ["tui", "pi-tui"]
]);

export const PI_MANIFEST_NAMES = new Map([
  ["pi-agent", "@earendil-works/pi-agent-core"],
  ["pi-ai", "@earendil-works/pi-ai"],
  ["pi-client", "@earendil-works/pi-client"],
  ["pi-coding-agent", "@earendil-works/pi-coding-agent"],
  ["pi-protocol", "@earendil-works/pi-protocol"],
  ["pi-telemetry", "@earendil-works/pi-telemetry"],
  ["pi-tui", "@earendil-works/pi-tui"]
]);

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function checkPiVendor({ root = fileURLToPath(new URL("..", import.meta.url)) } = {}) {
  const scriptsRoot = join(root, "scripts", "pi");
  const pinned = (await readFile(join(scriptsRoot, "PINNED_COMMIT"), "utf8")).trim();
  if (!/^[0-9a-f]{40}$/u.test(pinned)) throw new Error("scripts/pi/PINNED_COMMIT must contain one 40-character commit SHA");

  const readme = await readFile(join(scriptsRoot, "README.md"), "utf8");
  if (!readme.includes("PINNED_COMMIT") || !readme.includes("scripts/pi/sync-pi.sh")) {
    throw new Error("scripts/pi/README.md must document the pinned commit and sync command");
  }
  for (const [upstream, packageName] of PI_VENDOR_PACKAGES) {
    const source = join(root, "packages", packageName, "src");
    if (!(await exists(source))) throw new Error(`Missing vendored Pi source directory: packages/${packageName}/src`);
    const manifest = JSON.parse(await readFile(join(root, "packages", packageName, "package.json"), "utf8"));
    if (manifest.name !== PI_MANIFEST_NAMES.get(packageName)) {
      throw new Error(`packages/${packageName}/package.json has an unexpected manifest name`);
    }
    const mapping = `packages/${packageName}`;
    if (!readme.split("\n").some(line => line.trim().startsWith(`${upstream} `) && line.includes(mapping))) {
      throw new Error(`scripts/pi/README.md is missing imported package mapping: ${upstream} -> ${mapping}`);
    }
  }
  return { pinned, packages: [...PI_VENDOR_PACKAGES.entries()] };
}

if (import.meta.main) {
  const result = await checkPiVendor();
  console.log(`Pi vendor is valid at ${result.pinned} (${result.packages.length} packages)`);
}
