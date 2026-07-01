import jwt from 'jsonwebtoken';

export interface AdminTokenPayload {
  sub: number; // admin_users.id
  username: string;
  role: 'admin';
}

function secret(): string {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error('JWT_SECRET is not set');
  return s;
}

export function signAdminToken(payload: AdminTokenPayload): string {
  const expiresIn = process.env.JWT_EXPIRES_IN || '12h';
  return jwt.sign(payload, secret(), { expiresIn } as jwt.SignOptions);
}

export function verifyAdminToken(token: string): AdminTokenPayload {
  return jwt.verify(token, secret()) as unknown as AdminTokenPayload;
}
