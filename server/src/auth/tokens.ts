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
  return jwt.sign(payload, secret(), { expiresIn, algorithm: 'HS256' } as jwt.SignOptions);
}

export function verifyAdminToken(token: string): AdminTokenPayload {
  // Pin the algorithm so a forged token can't downgrade to 'none' or swap algs.
  return jwt.verify(token, secret(), { algorithms: ['HS256'] }) as unknown as AdminTokenPayload;
}
