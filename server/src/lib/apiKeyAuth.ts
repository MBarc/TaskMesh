import type { Request, Response, NextFunction } from 'express';
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
    const statusCode = res.statusCode;
    res.on('finish', () => {
      prisma.apiKeyUsage.create({
        data: {
          apiKeyId: apiKey.id,
          method: req.method,
          path: req.originalUrl,
          statusCode: res.statusCode,
        },
      }).catch((err) => {
        console.error('Failed to log API key usage:', err);
      });
    });

    // Attach key info for downstream use
    (req as any).apiKey = {
      id: apiKey.id,
      name: apiKey.name,
    };
  } catch (error) {
    console.error('API key auth error:', error);
  }

  next();
}
