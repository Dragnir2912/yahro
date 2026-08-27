import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";

let temporaryDirectory: string | undefined;

afterEach(async () => {
  if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true });
  temporaryDirectory = undefined;
});

describe("single-service frontend", () => {
  it("serves the SPA without turning unknown API routes into HTML", async () => {
    temporaryDirectory = await mkdtemp(path.join(tmpdir(), "yahro-static-test-"));
    await writeFile(path.join(temporaryDirectory, "index.html"), "<!doctype html><title>Yahro</title>", "utf8");

    const config = loadConfig({
      NODE_ENV: "test",
      DATABASE_URL: "postgres://yahro_app:test@127.0.0.1:5432/yahro",
      JWT_SECRET: "j".repeat(64),
      TOKEN_HASH_PEPPER: "p".repeat(64),
      MFA_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64url"),
      APP_ORIGIN: "http://127.0.0.1:4000",
      PUBLIC_API_ORIGIN: "http://127.0.0.1:4000",
      SERVE_FRONTEND: "true",
      FRONTEND_DIST_PATH: temporaryDirectory,
      LOG_LEVEL: "silent",
    });
    const app = await createApp(config);

    try {
      const root = await app.inject({ method: "GET", url: "/", headers: { accept: "text/html" } });
      expect(root.statusCode).toBe(200);
      expect(root.body).toContain("<title>Yahro</title>");
      expect(root.headers["content-security-policy"]).toContain("default-src 'self'");

      const clientRoute = await app.inject({ method: "GET", url: "/budgets", headers: { accept: "text/html" } });
      expect(clientRoute.statusCode).toBe(200);
      expect(clientRoute.body).toContain("<title>Yahro</title>");

      const missingApi = await app.inject({ method: "GET", url: "/api/unknown", headers: { accept: "text/html" } });
      expect(missingApi.statusCode).toBe(404);
      expect(missingApi.json()).toMatchObject({ code: "NOT_FOUND" });
    } finally {
      await app.close();
    }
  });
});
