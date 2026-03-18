import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { capture } from '../lib/telemetry.js';

export const searchRoutes = Router();

const SOURCE_TYPE_MAP: Record<string, string> = {
  ado:   'ADO_PUSH',
  snow:  'SNOW_PUSH',
  email: 'EMAIL',
};

searchRoutes.get('/', async (req, res) => {
  try {
    const { q, boardId, source, dateFrom, dateTo } = req.query;
    const limit  = Math.min(parseInt((req.query.limit  as string) || '20', 10), 100);
    const offset = parseInt((req.query.offset as string) || '0', 10);

    const query = typeof q === 'string' ? q.trim() : '';
    const isPostgres = (process.env.DATABASE_URL || '').startsWith('postgres');
    const searchMode = isPostgres ? { mode: 'insensitive' as const } : {};

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const taskWhere: Record<string, any> = {};

    if (typeof boardId === 'string' && boardId) {
      taskWhere.boardId = boardId;
    }

    if (dateFrom || dateTo) {
      const dateFilter: Record<string, Date> = {};
      if (typeof dateFrom === 'string' && dateFrom) dateFilter.gte = new Date(dateFrom);
      if (typeof dateTo   === 'string' && dateTo)   dateFilter.lte = new Date(dateTo);
      taskWhere.updatedAt = dateFilter;
    }

    const andConditions: Record<string, unknown>[] = [];

    if (query) {
      andConditions.push({
        cellValues: {
          some: {
            value: { contains: query, ...searchMode },
          },
        },
      });
    }

    if (typeof source === 'string' && source && SOURCE_TYPE_MAP[source]) {
      andConditions.push({
        cellValues: {
          some: {
            column: { type: SOURCE_TYPE_MAP[source] },
            NOT: { value: '' },
          },
        },
      });
    }

    if (andConditions.length > 0) {
      taskWhere.AND = andConditions;
    }

    const [tasks, total] = await Promise.all([
      prisma.task.findMany({
        where: taskWhere,
        include: {
          board: { select: { id: true, name: true } },
          cellValues: {
            include: {
              column: { select: { id: true, name: true, type: true } },
            },
          },
        },
        orderBy: { updatedAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.task.count({ where: taskWhere }),
    ]);

    capture('search_performed', {
      has_query: !!query,
      has_source_filter: typeof source === 'string' && !!SOURCE_TYPE_MAP[source],
      has_date_filter: !!(dateFrom || dateTo),
    });
    res.json({ tasks, total });
  } catch (err) {
    console.error('Search error:', err);
    res.status(500).json({ error: 'Search failed' });
  }
});
