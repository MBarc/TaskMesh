import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { prisma } from './prisma.js';

export async function apiKeyAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer tm01.')) {
    return next();
  }

  const token = authHeader.slice(7); // Remove "Bearer "

  try {
    const apiKey = await prisma.apiKey.findUnique({
      where: { key: token },
    });

    if (!apiKey || apiKey.status === 'REVOKED' || apiKey.expiresAt < new Date()) {
      // Key invalid but we still proceed — usage tracking only
      return next();
    }

    // Log usage asynchronously (fire and forget, don't block the request)
    res.on('finish', () => {
      prisma.apiKeyUsage.create({
        data: {
          apiKeyId: apiKey.id,
          method: req.method,
          path: req.originalUrl,
          statusCode: res.statusCode,
        },
      }).catch((err: unknown) => {
        console.error('Failed to log API key usage:', err);
      });
    });

    // Attach key info for downstream use
    (req as any).apiKey = {
      id: apiKey.id,
      name: apiKey.name,
      scopes: Array.isArray(apiKey.scopes) ? apiKey.scopes as string[] : [],
    };
  } catch (error) {
    console.error('API key auth error:', error);
  }

  next();
}

/**
 * Middleware that enforces a required scope on API key requests.
 * UI requests (no apiKey attached) always pass through.
 * Keys with an empty scopes array have full access (backward compat).
 */
export function requireScope(scope: string): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const apiKey = (req as any).apiKey;
    if (!apiKey) return next(); // UI request — no restriction
    const scopes: string[] = apiKey.scopes;
    if (scopes.length === 0) return next(); // Full access (backward compat)
    if (scopes.includes(scope)) return next();
    return res.status(403).json({
      error: 'insufficient_scope',
      required: scope,
      message: `This API key does not have the '${scope}' scope required for this endpoint.`,
    });
  };
}
