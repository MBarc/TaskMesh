import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../lib/prisma.js';
import { requireScope } from '../lib/apiKeyAuth.js';
import { capture } from '../lib/telemetry.js';

export const apiKeyRoutes = Router();

/**
 * @openapi
 * /api/api-keys:
 *   get:
 *     tags: [API Keys]
 *     summary: List all API keys
 *     description: Returns all API keys with masked key values (last 8 chars only).
 *     responses:
 *       200:
 *         description: List of API keys
 */
apiKeyRoutes.get('/', requireScope('apikeys:read'), async (req, res) => {
  try {
    const keys = await prisma.apiKey.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { usageLog: true } },
      },
    });

    const masked = keys.map((k) => ({
      id: k.id,
      name: k.name,
      maskedKey: '••••••••' + k.key.slice(-8),
      status: k.expiresAt < new Date() && k.status === 'ACTIVE' ? 'EXPIRED' : k.status,
      expiresAt: k.expiresAt.toISOString(),
      createdAt: k.createdAt.toISOString(),
      revokedAt: k.revokedAt?.toISOString() || null,
      usageCount: k._count.usageLog,
      scopes: Array.isArray(k.scopes) ? k.scopes : [],
    }));

    res.json(masked);
  } catch (error) {
    console.error('Error fetching API keys:', error);
    res.status(500).json({ error: 'Failed to fetch API keys' });
  }
});

/**
 * @openapi
 * /api/api-keys:
 *   post:
 *     tags: [API Keys]
 *     summary: Create a new API key
 *     description: Generates a new API key in tm01.<uuid> format. The full key is returned only once.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, expiresAt]
 *             properties:
 *               name:
 *                 type: string
 *               expiresAt:
 *                 type: string
 *                 format: date-time
 *     responses:
 *       201:
 *         description: API key created (full key returned once)
 */
apiKeyRoutes.post('/', requireScope('apikeys:write'), async (req, res) => {
  try {
    const { name, expiresAt, scopes } = req.body;

    if (!name || !expiresAt) {
      return res.status(400).json({ error: 'name and expiresAt are required' });
    }

    const key = `tm01.${uuidv4()}`;
    const scopeList = Array.isArray(scopes) ? scopes : [];

    const apiKey = await prisma.apiKey.create({
      data: {
        name,
        key,
        expiresAt: new Date(expiresAt),
        scopes: scopeList,
      },
    });

    capture('api_key_created');
    res.status(201).json({
      id: apiKey.id,
      name: apiKey.name,
      key: apiKey.key,
      status: apiKey.status,
      expiresAt: apiKey.expiresAt.toISOString(),
      createdAt: apiKey.createdAt.toISOString(),
      scopes: scopeList,
    });
  } catch (error) {
    console.error('Error creating API key:', error);
    res.status(500).json({ error: 'Failed to create API key' });
  }
});

/**
 * @openapi
 * /api/api-keys/{id}:
 *   delete:
 *     tags: [API Keys]
 *     summary: Revoke an API key
 *     description: Sets the key status to REVOKED and records the revocation timestamp.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: API key revoked
 */
apiKeyRoutes.delete('/:id', requireScope('apikeys:write'), async (req, res) => {
  try {
    const { id } = req.params as Record<string, string>;

    const apiKey = await prisma.apiKey.update({
      where: { id },
      data: {
        status: 'REVOKED',
        revokedAt: new Date(),
      },
    });

    capture('api_key_revoked');
    res.json({
      id: apiKey.id,
      name: apiKey.name,
      status: apiKey.status,
      revokedAt: apiKey.revokedAt?.toISOString(),
    });
  } catch (error) {
    console.error('Error revoking API key:', error);
    res.status(500).json({ error: 'Failed to revoke API key' });
  }
});

/**
 * @openapi
 * /api/api-keys/{id}/history:
 *   get:
 *     tags: [API Keys]
 *     summary: Get usage history for an API key
 *     description: Returns paginated usage log entries, most recent first.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *     responses:
 *       200:
 *         description: Usage history entries
 */
apiKeyRoutes.get('/:id/history', requireScope('apikeys:read'), async (req, res) => {
  try {
    const { id } = req.params as Record<string, string>;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
    const skip = (page - 1) * limit;

    const [entries, total] = await Promise.all([
      prisma.apiKeyUsage.findMany({
        where: { apiKeyId: id },
        orderBy: { timestamp: 'desc' },
        skip,
        take: limit,
      }),
      prisma.apiKeyUsage.count({
        where: { apiKeyId: id },
      }),
    ]);

    res.json({
      entries: entries.map((e) => ({
        id: e.id,
        method: e.method,
        path: e.path,
        statusCode: e.statusCode,
        timestamp: e.timestamp.toISOString(),
      })),
      total,
      page,
      limit,
    });
  } catch (error) {
    console.error('Error fetching API key history:', error);
    res.status(500).json({ error: 'Failed to fetch API key history' });
  }
});
