import { readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

export const PACKAGE_NAMES = [
  "web-ui",
  "api-gateway",
  "harness",
  "tool-resolver",
  "chat-provider-interface",
  "data-layer"
];

export const ALLOWED_DEPENDENCIES = {
  "web-ui": new Set(["api-gateway", "data-layer"]),
  "api-gateway": new Set([
    "harness",
    "tool-resolver",
    "chat-provider-interface",
    "data-layer"
  ]),
  harness: new Set(["tool-resolver", "chat-provider-interface"]),
  "tool-resolver": new Set(["data-layer"]),
  "chat-provider-interface": new Set(),
  "data-layer": new Set()
};

const importPattern = /\b(?:from|import|export)\s*(?:type\s*)?\(?\s*["']([^"']+)["']/g;
const sourceExtensions = /\.(?:[cm]?tsx?|jsx?)$/;
const serverBuiltinImports = /^(?:node:|bun:|deno:|fs$|path$|os$|url$|crypto$|stream$|util$|child_process$|cluster$|net$|tls$|http$|https$)/;
const browserBuiltinImports = /^(?:node:|bun:|deno:|fs$|path$|os$|url$|crypto$|stream$|util$|child_process$|cluster$|net$|tls$|http$|https$|sqlite|better-sqlite3)/;

async function readPackage(packagesRoot, name) {
  const path = join(packagesRoot, name, "package.json");
  return JSON.parse(await readFile(path, "utf8"));
}

function packageDependencyNames(manifest) {
  return Object.keys({
    ...manifest.dependencies,
    ...manifest.optionalDependencies,
    ...manifest.peerDependencies
  });
}

function packageFromImport(specifier) {
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}

function isBuiltinImport(specifier) {
  return serverBuiltinImports.test(specifier);
}

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await sourceFiles(path)));
    else if (sourceExtensions.test(entry.name)) files.push(path);
  }
  return files;
}

export async function check({ root = fileURLToPath(new URL("..", import.meta.url)) } = {}) {
  const packagesRoot = join(root, "packages");
  const entries = (await readdir(packagesRoot, { withFileTypes: true }))
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort();
  const expected = [...PACKAGE_NAMES].sort();
  if (JSON.stringify(entries) !== JSON.stringify(expected)) {
    throw new Error(`packages/ must contain exactly: ${expected.join(", ")}`);
  }

  const manifests = new Map();
  for (const name of PACKAGE_NAMES) {
    const manifest = await readPackage(packagesRoot, name);
    manifests.set(name, manifest);
    if (manifest.name !== name) throw new Error(`${name}: manifest name must be ${name}`);
    if (manifest.private !== true || manifest.type !== "module") {
      throw new Error(`${name}: runtime packages must be private ES modules`);
    }
    for (const script of ["typecheck", "test", "check"]) {
      if (typeof manifest.scripts?.[script] !== "string") {
        throw new Error(`${name}: missing ${script} script`);
      }
    }
    if (name === "web-ui" && !Array.isArray(manifest.browserDependencies)) {
      throw new Error("web-ui: browserDependencies must be an explicit array");
    }
    if (name === "web-ui") {
      const dependencies = new Set(packageDependencyNames(manifest));
      for (const dependency of manifest.browserDependencies) {
        if (typeof dependency !== "string" || !dependencies.has(dependency)) {
          throw new Error(`web-ui: browser dependency must be declared: ${dependency}`);
        }
      }
    }
    for (const dependency of packageDependencyNames(manifest)) {
      if (PACKAGE_NAMES.includes(dependency) && !ALLOWED_DEPENDENCIES[name].has(dependency)) {
        throw new Error(`${name} cannot depend on ${dependency}`);
      }
    }
  }

  for (const name of PACKAGE_NAMES) {
    const files = await sourceFiles(join(packagesRoot, name, "src"));
    const manifest = manifests.get(name);
    const declaredDependencies = new Set(packageDependencyNames(manifest));
    const browserDependencies = new Set(manifest.browserDependencies ?? []);
    for (const file of files) {
      const source = await readFile(file, "utf8");
      for (const match of source.matchAll(importPattern)) {
        const specifier = match[1];
        if (specifier.startsWith(".") || specifier.startsWith("/")) continue;
        const importedPackage = packageFromImport(specifier);
        if (!isBuiltinImport(specifier) && !PACKAGE_NAMES.includes(importedPackage) &&
            !declaredDependencies.has(importedPackage)) {
          throw new Error(`${relative(root, file)} imports undeclared dependency ${specifier}`);
        }
        if (PACKAGE_NAMES.includes(importedPackage) && !ALLOWED_DEPENDENCIES[name].has(importedPackage)) {
          throw new Error(`${relative(root, file)} imports forbidden package ${specifier}`);
        }
        if (PACKAGE_NAMES.includes(importedPackage) && !declaredDependencies.has(importedPackage)) {
          throw new Error(`${relative(root, file)} imports undeclared package ${specifier}`);
        }
        if (name === "web-ui" && (isBuiltinImport(specifier) ||
            (!PACKAGE_NAMES.includes(importedPackage) && !browserDependencies.has(importedPackage)) ||
            (importedPackage === "data-layer" && specifier !== "data-layer/contracts") ||
            (importedPackage === "api-gateway" && specifier !== "api-gateway/client"))) {
          throw new Error(`${relative(root, file)} is not browser-safe: ${specifier}`);
        }
      }
    }
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    await check();
    console.log(`Package boundaries valid: ${PACKAGE_NAMES.join(", ")}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
