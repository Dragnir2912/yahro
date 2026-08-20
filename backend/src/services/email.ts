import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import nodemailer from "nodemailer";
import type { AppConfig } from "../config.js";

export interface EmailService {
  sendVerification(to: string, token: string): Promise<void>;
  sendAccountExists(to: string): Promise<void>;
  sendPasswordReset(to: string, token: string): Promise<void>;
  sendSecurityAlert(to: string, event: "MFA_ENABLED" | "MFA_DISABLED"): Promise<void>;
}

export function createEmailService(config: AppConfig): EmailService {
  const origin = config.allowedOrigins[0];
  if (!origin) throw new Error("At least one APP_ORIGIN is required");

  const transport = config.smtp
    ? nodemailer.createTransport({
        host: config.smtp.host,
        port: config.smtp.port,
        secure: config.smtp.secure,
        ...(config.smtp.user && config.smtp.password
          ? { auth: { user: config.smtp.user, pass: config.smtp.password } }
          : {}),
      })
    : null;

  async function deliver(message: { to: string; subject: string; text: string }) {
    if (transport && config.smtp) {
      await transport.sendMail({ from: config.smtp.from, ...message });
      return;
    }
    if (config.isProduction) throw new Error("SMTP must be configured in production");
    const directory = path.resolve(process.cwd(), config.devEmailCaptureDirectory);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const capturePath = path.join(directory, `${Date.now()}-${randomUUID()}.json`);
    await writeFile(
      capturePath,
      JSON.stringify({ ...message, capturedAt: new Date().toISOString() }, null, 2),
      { encoding: "utf8", mode: 0o600, flag: "wx" },
    );
    process.stdout.write(`Development email captured: ${capturePath}\n`);
  }

  return {
    sendVerification(to, token) {
      const url = `${origin}/verify-email?token=${encodeURIComponent(token)}`;
      return deliver({
        to,
        subject: "Confirmez votre adresse Yahro",
        text: `Confirmez votre adresse en ouvrant ce lien à usage unique : ${url}`,
      });
    },
    sendAccountExists(to) {
      return deliver({
        to,
        subject: "Votre compte Yahro existe deja",
        text: `Un compte Yahro actif utilise déjà cette adresse. Connectez-vous depuis ${origin}/ ou demandez une réinitialisation du mot de passe si nécessaire. Si vous n'êtes pas à l'origine de cette demande, vous pouvez ignorer cet email.`,
      });
    },
    sendPasswordReset(to, token) {
      const url = `${origin}/reset-password?token=${encodeURIComponent(token)}`;
      return deliver({
        to,
        subject: "Réinitialisez votre mot de passe Yahro",
        text: `Réinitialisez votre mot de passe en ouvrant ce lien à usage unique : ${url}`,
      });
    },
    sendSecurityAlert(to, event) {
      const enabled = event === "MFA_ENABLED";
      return deliver({
        to,
        subject: enabled ? "Double authentification Yahro activee" : "Double authentification Yahro desactivee",
        text: enabled
          ? "La double authentification a été activée sur votre compte Yahro. Si vous n'êtes pas à l'origine de cette action, changez immédiatement votre mot de passe."
          : "La double authentification a été désactivée sur votre compte Yahro. Si vous n'êtes pas à l'origine de cette action, réinitialisez immédiatement votre mot de passe.",
      });
    },
  };
}
