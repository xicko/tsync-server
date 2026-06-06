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

export function getSocketIp(client: any): string {
  const forwarded = client.handshake?.headers?.['x-forwarded-for'];
  const ip =
    (typeof forwarded === 'string' ? forwarded.split(',')[0] : null) ||
    client.handshake?.address ||
    '';

  if (ip.startsWith('::ffff:')) {
    return ip.substring(7);
  }

  return ip;
}
