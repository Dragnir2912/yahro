import { randomBytes } from "node:crypto";

const secret = (bytes) => randomBytes(bytes).toString("base64url");

const values = {
  YAHRO_APP_PASSWORD: secret(48),
  JWT_SECRET: secret(64),
  TOKEN_HASH_PEPPER: secret(64),
  MFA_ENCRYPTION_KEY: secret(32),
};

process.stdout.write("Copiez chaque valeur directement dans le gestionnaire de secrets de la plateforme.\n");
process.stdout.write("Ne les enregistrez pas dans Git, un ticket ou un fichier synchronise.\n\n");
for (const [name, value] of Object.entries(values)) process.stdout.write(`${name}=${value}\n`);
