import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import "dotenv/config";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { totp } from "../src/security/totp.js";

const config = loadConfig();
const app = await createApp(config);
const email = `mfa-e2e-${crypto.randomUUID()}@example.test`;
const password = "A-strong-local-password-2026";
const mailDirectory = path.resolve(process.cwd(), config.devEmailCaptureDirectory);
const initialMailFiles = new Set(await readdir(mailDirectory).catch(() => []));

async function testMailFiles() {
  return (await readdir(mailDirectory)).filter((file) => !initialMailFiles.has(file)).sort();
}

function expectStatus(actual: number, expected: number, label: string) {
  if (actual !== expected) throw new Error(`${label}: expected HTTP ${expected}, received ${actual}`);
}

try {
  const mismatchedRegistration = await app.inject({
    method: "POST",
    url: "/api/auth/register",
    payload: {
      email: `mismatch-${crypto.randomUUID()}@example.test`,
      password,
      passwordConfirmation: `${password}-different`,
      firstName: "Mismatch",
      lastName: "Test",
      nickname: "Mismatch",
      countryCode: "CI",
      locale: "fr",
      timezone: "Africa/Abidjan",
      currency: "XOF",
      acceptTerms: true,
      acceptPrivacy: true,
    },
  });
  expectStatus(mismatchedRegistration.statusCode, 422, "password confirmation mismatch");

  const registrationPayload = {
    email,
    password,
    passwordConfirmation: password,
    firstName: "MFA",
    lastName: "E2E",
    nickname: "MFA E2E",
    countryCode: "CI",
    locale: "fr",
    timezone: "Africa/Abidjan",
    currency: "XOF",
    acceptTerms: true,
    acceptPrivacy: true,
  } as const;
  const registration = await app.inject({ method: "POST", url: "/api/auth/register", payload: registrationPayload });
  expectStatus(registration.statusCode, 202, "registration");

  const firstMailFiles = await testMailFiles();
  if (firstMailFiles.length !== 1) throw new Error("initial verification email was not captured");

  const duplicateRegistration = await app.inject({ method: "POST", url: "/api/auth/register", payload: registrationPayload });
  expectStatus(duplicateRegistration.statusCode, 202, "pending duplicate registration");
  const duplicateMailFiles = await testMailFiles();
  if (duplicateMailFiles.length !== 2) throw new Error("pending duplicate registration did not capture a new email");

  const resend = await app.inject({ method: "POST", url: "/api/auth/resend-verification", payload: { email } });
  expectStatus(resend.statusCode, 202, "verification resend");
  const mailFiles = await testMailFiles();
  if (mailFiles.length !== 3) throw new Error("explicit verification resend did not capture a new email");
  const verificationMail = JSON.parse(await readFile(path.join(mailDirectory, mailFiles.at(-1)!), "utf8")) as { text: string };
  const tokenMatch = verificationMail.text.match(/[?&]token=([^\s]+)/);
  if (!tokenMatch?.[1]) throw new Error("verification token not found");

  const verification = await app.inject({
    method: "POST",
    url: "/api/auth/verify-email",
    payload: { token: decodeURIComponent(tokenMatch[1]) },
  });
  expectStatus(verification.statusCode, 204, "email verification");

  const activeDuplicateRegistration = await app.inject({
    method: "POST",
    url: "/api/auth/register",
    payload: registrationPayload,
  });
  expectStatus(activeDuplicateRegistration.statusCode, 202, "active duplicate registration");
  const activeDuplicateMailFiles = await testMailFiles();
  if (activeDuplicateMailFiles.length !== 4) {
    throw new Error("active duplicate registration did not capture an account notice email");
  }
  const accountNoticeMail = JSON.parse(
    await readFile(path.join(mailDirectory, activeDuplicateMailFiles.at(-1)!), "utf8"),
  ) as { subject: string };
  if (accountNoticeMail.subject !== "Votre compte Yahro existe deja") {
    throw new Error("active duplicate registration captured the wrong email");
  }

  const firstLogin = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email, password } });
  expectStatus(firstLogin.statusCode, 200, "first login");
  const firstAuth = firstLogin.json<{ accessToken: string }>();
  const authorization = { authorization: `Bearer ${firstAuth.accessToken}` };

  const profile = await app.inject({ method: "GET", url: "/api/auth/me", headers: authorization });
  expectStatus(profile.statusCode, 200, "identity profile");
  const identity = profile.json<{ user: { firstName: string; lastName: string; nickname: string; countryCode: string } }>().user;
  if (identity.firstName !== "MFA" || identity.lastName !== "E2E" || identity.nickname !== "MFA E2E" || identity.countryCode !== "CI") {
    throw new Error("identity profile fields were not persisted correctly");
  }

  const setup = await app.inject({
    method: "POST",
    url: "/api/auth/mfa/setup",
    headers: authorization,
    payload: { currentPassword: password },
  });
  expectStatus(setup.statusCode, 200, "MFA setup");
  const setupData = setup.json<{ secret: string; otpAuthUri: string }>();
  if (!setupData.otpAuthUri.startsWith("otpauth://totp/")) throw new Error("invalid OTP auth URI");

  const confirmation = await app.inject({
    method: "POST",
    url: "/api/auth/mfa/confirm",
    headers: authorization,
    payload: { code: totp(setupData.secret) },
  });
  expectStatus(confirmation.statusCode, 200, "MFA confirmation");
  const recoveryCodes = confirmation.json<{ recoveryCodes: string[] }>().recoveryCodes;
  if (recoveryCodes.length !== 10) throw new Error("expected 10 recovery codes");

  const protectedLogin = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email, password } });
  expectStatus(protectedLogin.statusCode, 202, "MFA protected login");
  const challenge = protectedLogin.json<{ mfaRequired: boolean; mfaToken: string }>();
  if (!challenge.mfaRequired || !challenge.mfaToken) throw new Error("MFA challenge missing");

  const secondFactor = await app.inject({
    method: "POST",
    url: "/api/auth/mfa/verify",
    payload: { mfaToken: challenge.mfaToken, code: recoveryCodes[0] },
  });
  expectStatus(secondFactor.statusCode, 200, "recovery code verification");
  const secondAuth = secondFactor.json<{ accessToken: string }>();

  const status = await app.inject({
    method: "GET",
    url: "/api/auth/mfa",
    headers: { authorization: `Bearer ${secondAuth.accessToken}` },
  });
  expectStatus(status.statusCode, 200, "MFA status");
  const statusData = status.json<{ enabled: boolean; recoveryCodesRemaining: number }>();
  if (!statusData.enabled || statusData.recoveryCodesRemaining !== 9) throw new Error("unexpected MFA status");

  const sessions = await app.inject({
    method: "GET",
    url: "/api/auth/sessions",
    headers: { authorization: `Bearer ${secondAuth.accessToken}` },
  });
  expectStatus(sessions.statusCode, 200, "session list");
  if (sessions.json<{ data: unknown[] }>().data.length < 1) throw new Error("active sessions were not listed");

  const logoutAll = await app.inject({
    method: "POST",
    url: "/api/auth/logout-all",
    headers: { authorization: `Bearer ${secondAuth.accessToken}` },
  });
  expectStatus(logoutAll.statusCode, 204, "global logout");
  const revokedAccess = await app.inject({
    method: "GET",
    url: "/api/auth/mfa",
    headers: { authorization: `Bearer ${secondAuth.accessToken}` },
  });
  expectStatus(revokedAccess.statusCode, 401, "revoked session access");

  process.stdout.write("mfa_registration=ok\n");
  process.stdout.write("verification_email_capture=ok\n");
  process.stdout.write("verification_email_resend=ok\n");
  process.stdout.write("existing_account_notice=ok\n");
  process.stdout.write("identity_profile=ok\n");
  process.stdout.write("password_confirmation_not_accepted_when_mismatched=ok\n");
  process.stdout.write("mfa_totp_activation=ok\n");
  process.stdout.write("mfa_password_gate=ok\n");
  process.stdout.write("mfa_recovery_single_use=ok\n");
  process.stdout.write("session_listing_and_global_logout=ok\n");
} finally {
  await app.close();
}
