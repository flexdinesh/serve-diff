import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type DiffMode,
  isDiffMode,
  type RepositoryDiff,
} from "@serve-diff/shared";
import { openRepository, RequestError } from "./git.ts";
import { openPatch } from "./stdin.ts";

const webRoot = fileURLToPath(new URL("../../web/", import.meta.url));
const mime: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".wasm": "application/wasm",
  ".json": "application/json",
};

export async function startServer(options: {
  directory: string;
  port: number;
  dev?: boolean;
  input?: string;
}) {
  const repository =
    options.input === undefined
      ? await openRepository(options.directory)
      : openPatch(options.input);
  const dist = resolve(webRoot, "dist");
  if (!options.dev) {
    await stat(resolve(dist, "index.html")).catch(() => {
      throw new Error(
        "Web assets missing. Run pnpm build in the serve-diff checkout, or start with serve-diff . --dev.",
      );
    });
  }
  const vite = options.dev
    ? await import("vite").then(({ createServer }) =>
        createServer({
          root: webRoot,
          server: { middlewareMode: true, hmr: false },
          appType: "custom",
        }),
      )
    : null;
  const snapshots = new Map<
    DiffMode,
    { time: number; result: Promise<RepositoryDiff> }
  >();
  function snapshot(mode: DiffMode) {
    const cached = snapshots.get(mode);
    if (cached && Date.now() - cached.time < 500) return cached.result;
    const result = repository.snapshot(mode);
    snapshots.set(mode, { time: Date.now(), result });
    result.catch(() => snapshots.delete(mode));
    return result;
  }

  const server = createServer(async (request, response) => {
    try {
      // Bind only to loopback and reject other origins/hosts before exposing local code.
      const host = request.headers.host;
      const address = server.address();
      const port =
        address && typeof address === "object" ? address.port : options.port;
      if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`)
        throw new RequestError(403, "Invalid host");
      if (request.headers.origin && request.headers.origin !== `http://${host}`)
        throw new RequestError(403, "Cross-origin access denied");
      if (request.headers["sec-fetch-site"] === "cross-site")
        throw new RequestError(403, "Cross-site access denied");
      if (request.method !== "GET" && request.method !== "HEAD")
        throw new RequestError(405, "Read-only server");
      response.setHeader("X-Content-Type-Options", "nosniff");
      response.setHeader("Referrer-Policy", "no-referrer");
      response.setHeader("Cache-Control", "no-store");
      const url = new URL(request.url ?? "/", `http://${host}`);
      if (url.pathname.startsWith("/api/")) {
        const mode = url.searchParams.get("mode") ?? "all";
        if (!isDiffMode(mode)) throw new RequestError(400, "Invalid diff mode");
        const current = await snapshot(mode);
        let body: unknown;
        if (url.pathname === "/api/diff") {
          body = current;
        } else if (url.pathname === "/api/file") {
          const path = url.searchParams.get("path");
          const file = current.files.find((entry) => entry.path === path);
          if (!file)
            throw new RequestError(404, "File is not in the current diff");
          if (url.searchParams.get("version") !== file.fingerprint)
            throw new RequestError(
              409,
              "Diff changed. Refresh to load the latest version.",
            );
          body = await repository.patch(mode, file, current.head);
        } else {
          throw new RequestError(404, "Unknown API route");
        }
        response.setHeader("Content-Type", "application/json; charset=utf-8");
        response.end(
          request.method === "HEAD" ? undefined : JSON.stringify(body),
        );
        return;
      }
      if (vite) {
        if (url.pathname === "/") {
          const html = await vite.transformIndexHtml(
            "/",
            await readFile(resolve(webRoot, "index.html"), "utf8"),
          );
          response.setHeader("Content-Type", mime[".html"] ?? "text/html");
          response.end(request.method === "HEAD" ? undefined : html);
        } else {
          vite.middlewares(request, response, () => {
            response.writeHead(404).end("Not found");
          });
        }
        return;
      }
      const path = resolve(
        dist,
        `.${decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname)}`,
      );
      if (!path.startsWith(`${dist}${sep}`))
        throw new RequestError(404, "Not found");
      const file = await stat(path).catch(() => null);
      if (!file?.isFile()) throw new RequestError(404, "Not found");
      response.setHeader(
        "Content-Type",
        mime[extname(path)] ?? "application/octet-stream",
      );
      if (request.method === "HEAD") response.end();
      else
        createReadStream(path)
          .on("error", () => response.destroy())
          .pipe(response);
    } catch (error) {
      if (response.headersSent) {
        response.destroy();
        return;
      }
      response.writeHead(error instanceof RequestError ? error.status : 500, {
        "Content-Type": "application/json",
      });
      response.end(
        JSON.stringify({
          error:
            error instanceof Error
              ? error.message
              : "Unable to read repository",
        }),
      );
    }
  });
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(options.port, "127.0.0.1", resolve);
    });
  } catch (error) {
    await vite?.close();
    throw error;
  }
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Unable to bind server");
  return {
    root: repository.root,
    url: `http://127.0.0.1:${address.port}`,
    async close() {
      await vite?.close();
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    },
  };
}
