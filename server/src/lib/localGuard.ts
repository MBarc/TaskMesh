import type { Request, Response, NextFunction } from 'express';

// The API has no login: it trusts whoever can reach it. This guard makes sure only
// the local user's browser (or local scripts) can. It rejects:
//   - a Host header that isn't a localhost name  → blocks DNS-rebinding attacks
//   - an Origin header from any other site        → blocks malicious web pages
// Extra hostnames (e.g. a LAN IP for a Docker/homelab install) go in ALLOWED_HOSTS,
// comma-separated, without ports.
// ponytail: any local process can still call the API; add a per-install token if
// TaskMesh ever runs on shared multi-user machines.

const extraHosts = (process.env.ALLOWED_HOSTS ?? '')
  .split(',')
  .map((h) => h.trim().toLowerCase())
  .filter(Boolean);

export function isAllowedHost(host: string | undefined): boolean {
  if (!host) return false;
  const name = host.toLowerCase().replace(/:\d+$/, '');
  return (
    name === 'localhost' ||
    name.endsWith('.localhost') ||
    name === '127.0.0.1' ||
    name === '[::1]' ||
    extraHosts.includes(name)
  );
}

export function isAllowedOrigin(origin: string | undefined): boolean {
  if (origin === undefined) return true; // non-browser client or top-level navigation
  try {
    return isAllowedHost(new URL(origin).host);
  } catch {
    return false; // includes the opaque "null" origin (sandboxed iframes, file://)
  }
}

export function localGuard(req: Request, res: Response, next: NextFunction) {
  if (!isAllowedHost(req.headers.host)) {
    return res.status(403).json({ error: 'Host not allowed. Add it to ALLOWED_HOSTS to permit it.' });
  }
  if (!isAllowedOrigin(req.headers.origin)) {
    return res.status(403).json({ error: 'Cross-origin request blocked.' });
  }
  next();
}
