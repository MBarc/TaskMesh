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

type CsvColumn = { id: string; name: string; type: ColumnType; options?: { id: string; value: string }[] };

function formatCellForCsv(col: CsvColumn, raw: string): string {
  if (col.type === 'DROPDOWN' || col.type === 'SOURCE') {
    return col.options?.find((o) => o.id === raw)?.value ?? raw;
  }
  if (col.type === 'MULTI_SELECT') {
    try {
      const arr = JSON.parse(raw) as string[];
      if (Array.isArray(arr)) {
        return arr.map((id) => col.options?.find((o) => o.id === id)?.value ?? id).join(', ');
      }
    } catch {
      return raw;
    }
  }
  if (col.type === 'CHECKBOX') {
    return raw === 'true' ? 'Yes' : 'No';
  }
  return raw;
}

function buildCsv(
  columns: CsvColumn[],
  tasks: { cellValues: { columnId: string; value: string }[] }[]
): string {
  const exportableCols = columns.filter((c) => isExportableForCsv(c.type));
  const header = exportableCols.map((c) => csvEscape(c.name)).join(',');

  const rows = tasks.map((task) => {
    const cellMap = new Map(task.cellValues.map((cv) => [cv.columnId, cv.value]));
    return exportableCols
      .map((col) => {
        const raw = cellMap.get(col.id) ?? '';
        const formatted = formatCellForCsv(col, raw);
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
      columns: { include: { options: { orderBy: { order: 'asc' } } }, orderBy: { order: 'asc' } },
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
    res.send(JSON.stringify(buildJsonExport(board, board.tasks), null, 2));
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
      columns: { include: { options: { orderBy: { order: 'asc' } } }, orderBy: { order: 'asc' } },
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
    res.send(JSON.stringify(buildJsonExport(board, board.tasks), null, 2));
  } else {
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="selected-${safeName}-${date}.csv"`);
    res.send(buildCsv(board.columns, board.tasks));
  }
});

type BoardWithData = Awaited<ReturnType<typeof prisma.board.findMany<{
  include: {
    columns: { include: { options: { orderBy: { order: 'asc' } } }; orderBy: { order: 'asc' } };
    tasks: { orderBy: { order: 'asc' }; include: { cellValues: true } };
  };
}>>>[number];

function streamBoardsZip(
  boards: BoardWithData[],
  res: import('express').Response,
  filename: string,
  format: 'csv' | 'json'
): void {
  const date = new Date().toISOString().split('T')[0];
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  const archive = archiver('zip', { zlib: { level: 6 } });
  archive.pipe(res);

  for (const board of boards) {
    const safeName = board.name.replace(/[^a-z0-9_-]/gi, '_');
    if (format === 'json') {
      archive.append(
        JSON.stringify(buildJsonExport(board, board.tasks), null, 2),
        { name: `${safeName}-${date}.json` }
      );
    } else {
      archive.append(buildCsv(board.columns, board.tasks), { name: `${safeName}-${date}.csv` });
    }
  }

  archive.finalize();
}

const boardInclude = {
  columns: { include: { options: { orderBy: { order: 'asc' as const } } }, orderBy: { order: 'asc' as const } },
  tasks: { orderBy: { order: 'asc' as const }, include: { cellValues: true } },
};

// GET /api/export/all?format=csv|json
router.get('/all', async (req, res) => {
  const boards = await prisma.board.findMany({ include: boardInclude });
  const format = req.query.format === 'csv' ? 'csv' : 'json';
  const date = new Date().toISOString().split('T')[0];
  capture('export_used', { format, type: 'all' });
  streamBoardsZip(boards, res, `taskmesh-export-${date}.zip`, format);
});

// POST /api/export/boards — export selected boards as single file or ZIP
router.post('/boards', async (req, res) => {
  const { boardIds, format: rawFormat } = req.body as { boardIds?: string[]; format?: string };
  const format = rawFormat === 'json' ? 'json' : 'csv';

  if (!Array.isArray(boardIds) || boardIds.length === 0) {
    return res.status(400).json({ error: 'boardIds must be a non-empty array' });
  }

  const boards = await prisma.board.findMany({ where: { id: { in: boardIds } }, include: boardInclude });
  if (boards.length === 0) return res.status(404).json({ error: 'No boards found' });

  const date = new Date().toISOString().split('T')[0];
  capture('export_used', { format, type: 'selected_boards', count: boards.length });

  if (boards.length === 1) {
    const board = boards[0];
    const safeName = board.name.replace(/[^a-z0-9_-]/gi, '_');
    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${safeName}-${date}.json"`);
      res.send(JSON.stringify(buildJsonExport(board, board.tasks), null, 2));
    } else {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${safeName}-${date}.csv"`);
      res.send(buildCsv(board.columns, board.tasks));
    }
  } else {
    streamBoardsZip(boards, res, `taskmesh-export-${date}.zip`, format);
  }
});

export { router as exportRoutes };
