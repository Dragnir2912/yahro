import "dotenv/config";
import { loadConfig } from "./config.js";

const config = loadConfig();
if (config.isProduction) {
  delete process.env.DATABASE_MIGRATION_URL;
  delete process.env.YAHRO_APP_PASSWORD;
}
const { createApp } = await import("./app.js");
const app = await createApp(config);

const close = async (signal: string) => {
  app.log.info({ signal }, "Shutting down");
  await app.close();
  process.exit(0);
};

process.once("SIGINT", () => void close("SIGINT"));
process.once("SIGTERM", () => void close("SIGTERM"));

try {
  await app.listen({ host: config.host, port: config.port });
} catch (error) {
  app.log.fatal({ err: error }, "Unable to start server");
  process.exit(1);
}
