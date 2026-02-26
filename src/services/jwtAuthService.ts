import jwt, { type SignOptions } from 'jsonwebtoken';

export interface JWTPayload {
  sub: string; // subject (user ID)
  role: 'admin' | 'issuer' | 'verifier' | 'student';
  permissions: string[];
  iat?: number; // issued at
  exp?: number; // expiration
  iss?: string; // issuer
}

export interface JWTOptions {
  expiresIn?: SignOptions['expiresIn'];
  issuer?: string;
}

class JWTAuthService {
  private readonly secret: string;
  private readonly defaultIssuer = 'morningstar-credentials';

  constructor() {
    if (import.meta.env.PROD) {
      throw new Error('jwtAuthService is disabled in production. Use backend-issued auth tokens.');
    }

    this.secret = import.meta.env.VITE_JWT_SECRET || 'dev-only-jwt-secret';
  }

  generateToken(payload: Omit<JWTPayload, 'iat' | 'exp' | 'iss'>, options?: JWTOptions): string {
    const expiresIn: SignOptions['expiresIn'] = options?.expiresIn ?? '24h';
    const fullPayload: JWTPayload = {
      ...payload,
      iss: options?.issuer || this.defaultIssuer
    };

    return jwt.sign(fullPayload, this.secret, {
      expiresIn,
      algorithm: 'HS256'
    });
  }

  verifyToken(token: string): JWTPayload {
    try {
      return jwt.verify(token, this.secret, {
        issuer: this.defaultIssuer
      }) as JWTPayload;
    } catch (error) {
      throw new Error('Invalid or expired token');
    }
  }

  hasPermission(token: string, requiredPermission: string): boolean {
    try {
      const payload = this.verifyToken(token);
      return payload.permissions.includes(requiredPermission);
    } catch {
      return false;
    }
  }

  hasRole(token: string, requiredRole: JWTPayload['role']): boolean {
    try {
      const payload = this.verifyToken(token);
      return payload.role === requiredRole;
    } catch {
      return false;
    }
  }

  refreshToken(token: string): string {
    const payload = this.verifyToken(token);
    const { iat, exp, iss, ...rest } = payload;
    return this.generateToken(rest);
  }
}

export const jwtAuthService = new JWTAuthService();
