import { and, eq } from "drizzle-orm";
import type { FastifyRequest } from "fastify";
import type { Database } from "../db/client.js";
import { memberships, refreshSessions, users } from "../db/schema.js";
import { unauthorized } from "../lib/errors.js";
import type { AccessClaims, MembershipRole, TokenService } from "./tokens.js";

export interface AuthContext {
  userId: string;
  tenantId: string;
  sessionId: string;
  sessionVersion: number;
  authTime: number;
  role: MembershipRole;
}

export function createAuthGuard(database: Database, tokenService: TokenService) {
  return async function authenticate(request: FastifyRequest): Promise<AuthContext> {
    const header = request.headers.authorization;
    if (!header?.startsWith("Bearer ")) throw unauthorized();

    let claims: AccessClaims;
    try {
      claims = await tokenService.verifyAccessToken(header.slice(7));
    } catch {
      throw unauthorized();
    }

    const current = await database.withSecurityContext(
      { userId: claims.userId, tenantId: claims.tenantId },
      async (transaction) => {
        const [record] = await transaction
          .select({
            role: memberships.role,
            sessionVersion: users.sessionVersion,
            issuedSessionVersion: refreshSessions.sessionVersion,
            status: users.status,
            sessionRevokedAt: refreshSessions.revokedAt,
            sessionExpiresAt: refreshSessions.expiresAt,
          })
          .from(memberships)
          .innerJoin(users, eq(users.id, memberships.userId))
          .innerJoin(refreshSessions, and(eq(refreshSessions.id, claims.sessionId), eq(refreshSessions.userId, claims.userId)))
          .where(and(eq(memberships.userId, claims.userId), eq(memberships.tenantId, claims.tenantId)))
          .limit(1);
        return record;
      },
    );

    if (
      !current ||
      current.status !== "ACTIVE" ||
      current.sessionVersion !== claims.sessionVersion ||
      current.issuedSessionVersion !== claims.sessionVersion ||
      current.sessionRevokedAt ||
      current.sessionExpiresAt <= new Date()
    ) {
      throw unauthorized();
    }

    return {
      userId: claims.userId,
      tenantId: claims.tenantId,
      sessionId: claims.sessionId,
      sessionVersion: current.sessionVersion,
      authTime: claims.authTime,
      role: current.role,
    };
  };
}
