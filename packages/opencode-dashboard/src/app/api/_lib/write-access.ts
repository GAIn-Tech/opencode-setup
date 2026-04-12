import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';

const WRITE_TOKEN_HEADER = 'x-opencode-write-token';
const WRITE_TOKEN_ENV = 'OPENCODE_DASHBOARD_WRITE_TOKEN';

let hasWarnedMissingWriteToken = false;

function warnMissingWriteTokenOnce(): void {
  if (hasWarnedMissingWriteToken) {
    return;
  }

  hasWarnedMissingWriteToken = true;
  console.warn('[write-access] Write token env var is empty:', WRITE_TOKEN_ENV);
}

type RoleName = 'admin' | 'operator' | 'viewer';

type RoleTokenPayload = {
  sub?: string;
  role?: string;
  exp?: number;
};

type TokenClaims = {
  sub: string;
  role: RoleName;
};

const LEGACY_SUBJECT = 'legacy-token';

export const ROLE_MATRIX: Record<RoleName, string[]> = {
  admin: ['config:write', 'models:write', 'models:transition', 'models:rollback', 'audit:read', 'audit:write', 'lifecycle:manage', 'metrics:ingest', 'policy:simulate', 'skills:promote', 'usage:write', 'providers:manage', 'orchestration:write'],
  operator: ['config:write', 'models:write', 'models:transition', 'lifecycle:manage', 'metrics:ingest', 'policy:simulate', 'audit:read', 'skills:promote', 'usage:write', 'providers:manage', 'orchestration:write'],
  viewer: ['models:read', 'audit:read'],
};

function isKnownRole(role: string): role is RoleName {
  return role === 'admin' || role === 'operator' || role === 'viewer';
}

function safeStringCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return timingSafeEqual(bufA, bufB);
}

function decodeRoleClaims(presentedToken: string, configuredToken: string): TokenClaims | null {
  if (safeStringCompare(presentedToken, configuredToken)) {
    console.warn(`[write-access] Token missing role field; defaulting to 'operator' for backward compatibility`);
    return {
      sub: LEGACY_SUBJECT,
      role: 'operator',
    };
  }

  const delimiterIndex = presentedToken.lastIndexOf('.');
  if (delimiterIndex <= 0 || delimiterIndex === presentedToken.length - 1) {
    return null;
  }

  const encodedPayload = presentedToken.slice(0, delimiterIndex);
  const tokenSecret = presentedToken.slice(delimiterIndex + 1);

  if (!safeStringCompare(tokenSecret, configuredToken)) {
    return null;
  }

  let payload: RoleTokenPayload;
  try {
    const decoded = Buffer.from(encodedPayload, 'base64url').toString('utf8');
    payload = JSON.parse(decoded) as RoleTokenPayload;
  } catch (err) {
    console.warn('[write-access] Failed to decode token payload:', err);
    return null;
  }

  if (!payload || typeof payload !== 'object') {
    return null;
  }

  if (typeof payload.exp === 'number') {
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (payload.exp < nowSeconds) {
      return null;
    }
  }

  if (!payload.role) {
    console.warn(`[write-access] Token for subject '${payload.sub || 'unknown'}' missing role field; defaulting to 'operator'`);
    return {
      sub: payload.sub || 'unknown',
      role: 'operator',
    };
  }

  if (!isKnownRole(payload.role)) {
    return null;
  }

  return {
    sub: payload.sub || 'unknown',
    role: payload.role,
  };
}

function readPresentedToken(request: Request): string {
  const headerToken = request.headers.get(WRITE_TOKEN_HEADER)?.trim();
  if (headerToken) {
    return headerToken;
  }

  const authorization = request.headers.get('authorization')?.trim() || '';
  if (authorization.toLowerCase().startsWith('bearer ')) {
    return authorization.slice(7).trim();
  }

  return '';
}

export function getWriteActor(request: Request): string {
  const configuredToken = (process.env[WRITE_TOKEN_ENV] || '').trim();
  const presentedToken = readPresentedToken(request);
  const claims = configuredToken ? decodeRoleClaims(presentedToken, configuredToken) : null;

  return (
    request.headers.get('x-opencode-actor')?.trim() ||
    request.headers.get('x-user-id')?.trim() ||
    claims?.sub ||
    'unknown'
  );
}

export function verifyRole(token: string, requiredPermission: string): boolean {
  const configuredToken = (process.env[WRITE_TOKEN_ENV] || '').trim();
  if (!configuredToken) {
    return false;
  }

  const claims = decodeRoleClaims(token, configuredToken);
  if (!claims) {
    return false;
  }

  return ROLE_MATRIX[claims.role].includes(requiredPermission);
}

export function requireWriteAccess(request: Request, requiredPermission?: string): NextResponse | null {
  const configuredToken = (process.env[WRITE_TOKEN_ENV] || '').trim();

  if (!configuredToken) {
    warnMissingWriteTokenOnce();
    return NextResponse.json(
      {
        error: 'Write routes are disabled',
        message: `${WRITE_TOKEN_ENV} must be configured to enable mutable dashboard API routes`
      },
      { status: 503 }
    );
  }

  const presentedToken = readPresentedToken(request);
  const claims = decodeRoleClaims(presentedToken, configuredToken);
  if (!presentedToken || !claims) {
    return NextResponse.json(
      {
        error: 'Unauthorized',
        message: `Missing or invalid ${WRITE_TOKEN_HEADER} token`
      },
      { status: 401 }
    );
  }

  if (requiredPermission && !ROLE_MATRIX[claims.role].includes(requiredPermission)) {
    return NextResponse.json(
      {
        error: 'Forbidden',
        message: `Role '${claims.role}' lacks required permission '${requiredPermission}'`
      },
      { status: 403 }
    );
  }

  return null;
}

export function requireReadAccess(request: Request, requiredPermission?: string): NextResponse | null {
  const presentedToken = readPresentedToken(request);
  
  // If no token is presented, allow read-only access by default
  // This maintains backward compatibility for public read endpoints
  if (!presentedToken) {
    // For sensitive read operations, require authentication
    if (requiredPermission && requiredPermission !== 'models:read' && requiredPermission !== 'config:read') {
      return NextResponse.json(
        {
          error: 'Unauthorized',
          message: `Authentication required for this operation`
        },
        { status: 401 }
      );
    }
    return null; // Allow unauthenticated access for basic reads
  }

  // If token is presented, validate it
  const configuredToken = (process.env[WRITE_TOKEN_ENV] || '').trim();
  if (!configuredToken) {
    warnMissingWriteTokenOnce();
    // No token configured - allow if no specific permission required
    if (!requiredPermission) {
      return null;
    }
    return NextResponse.json(
      {
        error: 'Service unavailable',
        message: 'Authentication not configured'
      },
      { status: 503 }
    );
  }

  const claims = decodeRoleClaims(presentedToken, configuredToken);
  if (!claims) {
    return NextResponse.json(
      {
        error: 'Unauthorized',
        message: `Invalid ${WRITE_TOKEN_HEADER} token`
      },
      { status: 401 }
    );
  }

  // Check permissions
  if (requiredPermission && !ROLE_MATRIX[claims.role].includes(requiredPermission)) {
    return NextResponse.json(
      {
        error: 'Forbidden',
        message: `Role '${claims.role}' lacks required permission '${requiredPermission}'`
      },
      { status: 403 }
    );
  }

  return null;
}
