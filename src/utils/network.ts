import type { Request } from 'express';

export function getClientIp(req: Request): string {
  const ip =
    (req.headers['x-forwarded-for'] as string)?.split(',')[0] ||
    req.socket.remoteAddress ||
    '';

  if (ip.startsWith('::ffff:')) {
    return ip.substring(7);
  }

  return ip;
}
