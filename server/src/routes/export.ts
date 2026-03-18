import { Router } from 'express';
import archiver from 'archiver';
import { prisma } from '../lib/prisma.js';
import type { ColumnType } from '@prisma/client';
import { capture } from '../lib/telemetry.js';

const router = Router();

function csvEscape(val: string): string {
  if (val.includes(',') || val.includes('"') || val.includes('\n') || val.includes('\r')) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

const CSV_EXCLUDED: ColumnType[] = ['ADO_PUSH', 'SNOW_PUSH', 'EMAIL', 'DOCUMENTATION'];

function isExportableForCsv(type: ColumnType): boolean {
  return !CSV_EXCLUDED.includes(type);
}

function formatCellForCsv(type: ColumnType, raw: string): string {
  if (type === 'MULTI_SELECT') {
    try {
      const arr = JSON.parse(raw) as string[];
      return Array.isArray(arr) ? arr.join(', ') : raw;
    } catch {
      return raw;
    }
  }
  if (type === 'CHECKBOX') {
    return raw === 'true' ? 'Yes' : 'No';
  }
  return raw;
}

function buildCsv(
  columns: { id: string; name: string; type: ColumnType }[],
  tasks: { cellValues: { columnId: string; value: string }[] }[]
): string {
  const exportableCols = columns.filter((c) => isExportableForCsv(c.type));
  const header = exportableCols.map((c) => csvEscape(c.name)).join(',');

  const rows = tasks.map((task) => {
    const cellMap = new Map(task.cellValues.map((cv) => [cv.columnId, cv.value]));
    return exportableCols
      .map((col) => {
        const raw = cellMap.get(col.id) ?? '';
        const formatted = formatCellForCsv(col.type, raw);
        return csvEscape(formatted);
      })
      .join(',');
  });

  return [header, ...rows].join('\r\n');
}

function buildJsonExport(
  board: { id: string; name: string; columns: object[] },
  tasks: { id: string; order: number; cellValues: { columnId: string; value: string }[]; createdAt: Date; updatedAt: Date }[]
): object {
  return {
    board: {
      id: board.id,
      name: board.name,
      columns: board.columns,
    },
    tasks: tasks.map((t) => ({
      id: t.id,
      order: t.order,
      cells: Object.fromEntries(t.cellValues.map((cv) => [cv.columnId, cv.value])),
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    })),
    exportedAt: new Date().toISOString(),
  };
}

// GET /api/export/board/:boardId?format=csv|json
router.get('/board/:boardId', async (req, res) => {
  const board = await prisma.board.findUnique({
    where: { id: req.params.boardId },
    include: {
      columns: { orderBy: { order: 'asc' } },
      tasks: { orderBy: { order: 'asc' }, include: { cellValues: true } },
    },
  });
  if (!board) return res.status(404).json({ error: 'Board not found' });

  const format = req.query.format === 'json' ? 'json' : 'csv';
  capture('export_used', { format, type: 'board' });
  const safeName = board.name.replace(/[^a-z0-9_-]/gi, '_');
  const date = new Date().toISOString().split('T')[0];

  if (format === 'json') {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}-${date}.json"`);
    res.json(buildJsonExport(board, board.tasks));
  } else {
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}-${date}.csv"`);
    res.send(buildCsv(board.columns, board.tasks));
  }
});

// POST /api/export/board/:boardId?format=csv|json — selected tasks
router.post('/board/:boardId', async (req, res) => {
  const { taskIds } = req.body as { taskIds: string[] };
  const board = await prisma.board.findUnique({
    where: { id: req.params.boardId },
    include: {
      columns: { orderBy: { order: 'asc' } },
      tasks: {
        where: { id: { in: taskIds } },
        orderBy: { order: 'asc' },
        include: { cellValues: true },
      },
    },
  });
  if (!board) return res.status(404).json({ error: 'Board not found' });

  const format = req.query.format === 'json' ? 'json' : 'csv';
  capture('export_used', { format, type: 'selected' });
  const safeName = board.name.replace(/[^a-z0-9_-]/gi, '_');
  const date = new Date().toISOString().split('T')[0];

  if (format === 'json') {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="selected-${safeName}-${date}.json"`);
    res.json(buildJsonExport(board, board.tasks));
  } else {
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="selected-${safeName}-${date}.csv"`);
    res.send(buildCsv(board.columns, board.tasks));
  }
});

// GET /api/export/all — full ZIP export
router.get('/all', async (req, res) => {
  const boards = await prisma.board.findMany({
    include: {
      columns: { orderBy: { order: 'asc' } },
      tasks: { orderBy: { order: 'asc' }, include: { cellValues: true } },
    },
  });

  const date = new Date().toISOString().split('T')[0];
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="taskmesh-export-${date}.zip"`);

  const archive = archiver('zip', { zlib: { level: 6 } });
  archive.pipe(res);

  archive.append(
    JSON.stringify(
      {
        boards: boards.map((b) => ({
          id: b.id,
          name: b.name,
          columns: b.columns,
          createdAt: b.createdAt,
          updatedAt: b.updatedAt,
        })),
      },
      null,
      2
    ),
    { name: 'boards.json' }
  );

  archive.append(
    JSON.stringify(
      {
        tasks: boards.flatMap((b) =>
          b.tasks.map((t) => ({ ...t, boardId: b.id }))
        ),
      },
      null,
      2
    ),
    { name: 'tasks.json' }
  );

  for (const board of boards) {
    const safeName = board.name.replace(/[^a-z0-9_-]/gi, '_');
    archive.append(buildCsv(board.columns, board.tasks), { name: `${safeName}.csv` });
  }

  const manifest = {
    exportedAt: new Date().toISOString(),
    boardCount: boards.length,
    taskCount: boards.reduce((sum, b) => sum + b.tasks.length, 0),
  };
  archive.append(JSON.stringify(manifest, null, 2), { name: 'export-manifest.json' });

  capture('export_used', { format: 'zip', type: 'all' });
  archive.finalize();
});

export { router as exportRoutes };
