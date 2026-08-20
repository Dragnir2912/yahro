import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const projectRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const backendRoot = path.join(projectRoot, "backend");
const npmCliPath = process.env.npm_execpath;
const managedChildren = new Set();
let stopping = false;

function runStep(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env: process.env, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} exited with code ${code ?? "unknown"}`));
    });
  });
}

function startService(name, command, args, cwd) {
  const child = spawn(command, args, { cwd, env: process.env, stdio: "inherit" });
  managedChildren.add(child);
  child.once("error", (error) => {
    console.error(`${name} could not start:`, error.message);
    void shutdown(1);
  });
  child.once("exit", (code) => {
    managedChildren.delete(child);
    if (!stopping) {
      console.error(`${name} stopped with code ${code ?? "unknown"}.`);
      void shutdown(code ?? 1);
    }
  });
  return child;
}

async function endpointReady(url, expectedText) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
    if (!response.ok) return false;
    return expectedText ? (await response.text()).includes(expectedText) : true;
  } catch {
    return false;
  }
}

async function waitForEndpoint(url, expectedText, label) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (await endpointReady(url, expectedText)) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`${label} did not become ready at ${url}`);
}

async function terminateTree(child) {
  if (!child.pid || child.exitCode !== null) return;
  if (process.platform === "win32") {
    await new Promise((resolve) => {
      const killer = spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore" });
      killer.once("exit", resolve);
      killer.once("error", resolve);
    });
  } else {
    child.kill("SIGTERM");
  }
}

async function shutdown(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  await Promise.all([...managedChildren].map(terminateTree));
  process.exit(exitCode);
}

process.once("SIGINT", () => void shutdown(0));
process.once("SIGTERM", () => void shutdown(0));

try {
  if (!existsSync(path.join(projectRoot, ".env"))) throw new Error("Missing root .env file");
  if (!existsSync(path.join(backendRoot, ".env"))) throw new Error("Missing backend/.env file");
  if (!npmCliPath) throw new Error("Start this command with npm run dev:all");

  console.log("[1/4] Starting PostgreSQL...");
  await runStep("docker", ["compose", "up", "-d", "--wait", "postgres"], projectRoot);

  console.log("[2/4] Applying database migrations...");
  await runStep(process.execPath, [npmCliPath, "run", "db:migrate"], backendRoot);

  console.log("[3/4] Checking the API...");
  const apiWasRunning = await endpointReady("http://127.0.0.1:4000/health/ready");
  if (apiWasRunning) console.log("API is already running.");
  else startService("API", process.execPath, [npmCliPath, "run", "dev"], backendRoot);

  console.log("[4/4] Checking the frontend...");
  const frontendWasRunning = await endpointReady("http://127.0.0.1:5173/", "Yahro");
  if (frontendWasRunning) console.log("Frontend is already running.");
  else startService("Frontend", process.execPath, [npmCliPath, "run", "dev", "--", "--host", "127.0.0.1", "--port", "5173"], projectRoot);

  await Promise.all([
    waitForEndpoint("http://127.0.0.1:4000/health/ready", undefined, "API"),
    waitForEndpoint("http://127.0.0.1:5173/", "Yahro", "Frontend"),
  ]);

  console.log("");
  console.log("Yahro is ready:");
  console.log("Frontend:  http://127.0.0.1:5173");
  console.log("API:       http://127.0.0.1:4000");
  console.log("PostgreSQL: 127.0.0.1:55432");
  console.log(`Dev emails: ${path.join(backendRoot, ".dev-mail")}`);

  if (managedChildren.size === 0) {
    console.log("All services were already running.");
  } else {
    console.log("Press Ctrl+C to stop the frontend and API started by this command.");
    await new Promise(() => undefined);
  }
} catch (error) {
  console.error("");
  console.error("Yahro startup failed:", error instanceof Error ? error.message : error);
  await shutdown(1);
}
