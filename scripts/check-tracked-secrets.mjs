import { execFileSync } from "node:child_process";

const output = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" });
const files = output.split("\0").filter(Boolean).map((file) => file.replaceAll("\\", "/"));
const forbidden = files.filter((file) => {
  const name = file.split("/").at(-1) ?? file;
  if (name === ".env.example" || name.endsWith(".env.example")) return false;
  return name === ".env" || name.startsWith(".env.") || file.includes("/.dev-mail/") || file.startsWith(".dev-mail/") ||
    file.includes("/backups/") || file.startsWith("backups/") || /\.(pem|key|p12|pfx)$/i.test(name);
});

if (forbidden.length > 0) {
  process.stderr.write(`Sensitive files are tracked by Git:\n${forbidden.map((file) => `- ${file}`).join("\n")}\n`);
  process.exit(1);
}

process.stdout.write(`Tracked-file safety check passed for ${files.length} files.\n`);
