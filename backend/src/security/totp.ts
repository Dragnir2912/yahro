import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const periodSeconds = 30;

export function encodeBase32(input: Buffer) {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of input) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += alphabet[(value << (5 - bits)) & 31];
  return output;
}

export function decodeBase32(input: string) {
  const normalized = input.toUpperCase().replace(/=+$/g, "").replace(/\s+/g, "");
  let bits = 0;
  let value = 0;
  const output: number[] = [];
  for (const character of normalized) {
    const index = alphabet.indexOf(character);
    if (index < 0) throw new Error("Invalid base32 secret");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(output);
}

export function createTotpSecret() {
  return encodeBase32(randomBytes(20));
}

export function hotp(secret: string, counter: number, digits = 6) {
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", decodeBase32(secret)).update(counterBuffer).digest();
  const offset = digest[digest.length - 1]! & 15;
  const binary = ((digest[offset]! & 127) << 24)
    | ((digest[offset + 1]! & 255) << 16)
    | ((digest[offset + 2]! & 255) << 8)
    | (digest[offset + 3]! & 255);
  return String(binary % (10 ** digits)).padStart(digits, "0");
}

export function totp(secret: string, timestampMs = Date.now()) {
  return hotp(secret, Math.floor(timestampMs / 1000 / periodSeconds));
}

export function verifyTotp(secret: string, suppliedCode: string, lastUsedStep: number | null, timestampMs = Date.now()) {
  if (!/^\d{6}$/.test(suppliedCode)) return null;
  const supplied = Buffer.from(suppliedCode, "utf8");
  const currentStep = Math.floor(timestampMs / 1000 / periodSeconds);
  for (const offset of [0, -1, 1]) {
    const step = currentStep + offset;
    const expected = Buffer.from(hotp(secret, step), "utf8");
    if (timingSafeEqual(supplied, expected) && (lastUsedStep === null || step > lastUsedStep)) return step;
  }
  return null;
}

function encryptionKey(encodedKey: string) {
  const key = Buffer.from(encodedKey, "base64url");
  if (key.length !== 32) throw new Error("Invalid MFA encryption key");
  return key;
}

export function encryptTotpSecret(secret: string, encodedKey: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(encodedKey), iv);
  cipher.setAAD(Buffer.from("yahro:totp:v1", "utf8"));
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${ciphertext.toString("base64url")}.${tag.toString("base64url")}`;
}

export function decryptTotpSecret(payload: string, encodedKey: string) {
  const [version, ivValue, ciphertextValue, tagValue, ...rest] = payload.split(".");
  if (version !== "v1" || !ivValue || !ciphertextValue || !tagValue || rest.length > 0) throw new Error("Invalid encrypted TOTP secret");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(encodedKey), Buffer.from(ivValue, "base64url"));
  decipher.setAAD(Buffer.from("yahro:totp:v1", "utf8"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertextValue, "base64url")), decipher.final()]).toString("utf8");
}

export function createRecoveryCodes(count = 10) {
  return Array.from({ length: count }, () => {
    const value = encodeBase32(randomBytes(10));
    return value.match(/.{1,4}/g)!.join("-");
  });
}

export function normalizeRecoveryCode(code: string) {
  return code.toUpperCase().replace(/[^A-Z2-7]/g, "");
}

export function createOtpAuthUri(secret: string, email: string) {
  const issuer = "Yahro";
  const label = encodeURIComponent(`${issuer}:${email}`);
  return `otpauth://totp/${label}?secret=${encodeURIComponent(secret)}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=${periodSeconds}`;
}
