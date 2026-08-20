import { SignJWT, jwtVerify } from "jose";

export type MembershipRole = "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";

export interface AccessClaims {
  userId: string;
  tenantId: string;
  role: MembershipRole;
  sessionId: string;
  sessionVersion: number;
  authTime: number;
}

export interface TokenService {
  signAccessToken(claims: AccessClaims): Promise<string>;
  verifyAccessToken(token: string): Promise<AccessClaims>;
}

export function createTokenService(secret: string, ttlSeconds: number): TokenService {
  const key = new TextEncoder().encode(secret);
  const issuer = "yahro-api";
  const audience = "yahro-web";

  return {
    async signAccessToken(claims) {
      return new SignJWT({
        tid: claims.tenantId,
        role: claims.role,
        sid: claims.sessionId,
        sv: claims.sessionVersion,
        auth_time: claims.authTime,
      })
        .setProtectedHeader({ alg: "HS512", typ: "JWT" })
        .setSubject(claims.userId)
        .setIssuer(issuer)
        .setAudience(audience)
        .setIssuedAt()
        .setJti(crypto.randomUUID())
        .setExpirationTime(`${ttlSeconds}s`)
        .sign(key);
    },
    async verifyAccessToken(token) {
      const { payload } = await jwtVerify(token, key, {
        algorithms: ["HS512"],
        issuer,
        audience,
        clockTolerance: 5,
      });
      if (
        !payload.sub ||
        typeof payload.tid !== "string" ||
        typeof payload.role !== "string" ||
        typeof payload.sid !== "string" ||
        typeof payload.sv !== "number" ||
        typeof payload.auth_time !== "number" ||
        !Number.isInteger(payload.auth_time) ||
        payload.auth_time <= 0 ||
        payload.auth_time > Math.floor(Date.now() / 1000) + 60 ||
        !["OWNER", "ADMIN", "MEMBER", "VIEWER"].includes(payload.role)
      ) {
        throw new Error("Invalid access token claims");
      }
      return {
        userId: payload.sub,
        tenantId: payload.tid,
        role: payload.role as MembershipRole,
        sessionId: payload.sid,
        sessionVersion: payload.sv,
        authTime: payload.auth_time,
      };
    },
  };
}

export function serializeRefreshToken(sessionId: string, secret: string) {
  return `${sessionId}.${secret}`;
}

export function parseRefreshToken(value: string | undefined) {
  if (!value) return null;
  const [sessionId, secret, ...rest] = value.split(".");
  if (rest.length > 0 || !sessionId || !secret || !/^[0-9a-f-]{36}$/i.test(sessionId) || secret.length < 32) return null;
  return { sessionId, secret };
}
