import { realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

export type StaticAssetOptions = {
  readonly root: string;
};

function inside(root: string, candidate: string): boolean {
  const path = relative(root, candidate);
  return path === "" || (!path.startsWith("..") && !isAbsolute(path));
}

function invalidPath(pathname: string): boolean {
  if (pathname.includes("\\") || pathname.includes("\0") || pathname.includes("//")) return true;
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return true;
  }
  if (decoded.includes("\\") || decoded.includes("\0") || decoded.includes("//")) return true;
  return decoded.split("/").some(segment => segment === "..");
}

function isApiPath(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/") || pathname === "/v1" || pathname.startsWith("/v1/");
}

function cacheControl(pathname: string): string {
  const file = pathname.split("/").at(-1) ?? "";
  return /(?:^|[.-])[a-f0-9]{8,}(?:[.-]|$)/i.test(file) || pathname.startsWith("/assets/")
    ? "public, max-age=31536000, immutable"
    : "no-store";
}

async function fileResponse(path: string, root: string, status = 200): Promise<Response | undefined> {
  let canonical: string;
  try {
    canonical = await realpath(path);
  } catch {
    return undefined;
  }
  if (!inside(root, canonical)) return undefined;
  const file = Bun.file(canonical);
  if (!(await file.exists())) return undefined;
  const pathname = path;
  return new Response(file, {
    status,
    headers: {
      "cache-control": cacheControl(pathname),
      "content-type": CONTENT_TYPES[pathname.slice(pathname.lastIndexOf("."))?.toLowerCase() ?? ""] ?? "application/octet-stream",
      "x-content-type-options": "nosniff",
    },
  });
}

/** Serve a built SPA without allowing API misses to become HTML responses. */
export async function serveStatic(request: Request, options: StaticAssetOptions): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response(null, { status: 405, headers: { allow: "GET, HEAD" } });
  }
  const url = new URL(request.url);
  if (invalidPath(url.pathname)) return new Response("Not found", { status: 404 });
  if (isApiPath(url.pathname)) return new Response("Not found", { status: 404 });

  let root: string;
  try {
    root = await realpath(options.root);
  } catch {
    return new Response("Not found", { status: 404 });
  }
  const decodedPath = decodeURIComponent(url.pathname);
  const relativePath = decodedPath.replace(/^\/+/, "");
  const candidate = resolve(root, relativePath || "index.html");
  if (!inside(root, candidate)) return new Response("Not found", { status: 404 });
  const direct = await fileResponse(candidate, root, 200);
  if (direct) return direct;
  if (!request.headers.get("accept")?.includes("text/html")) return new Response("Not found", { status: 404 });
  return (await fileResponse(resolve(root, "index.html"), root, 200)) ?? new Response("Not found", { status: 404 });
}
