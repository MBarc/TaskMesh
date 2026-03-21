import { Router } from 'express';
import multer from 'multer';
import AdmZip from 'adm-zip';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../lib/prisma.js';
import { capture } from '../lib/telemetry.js';
import type { ColumnType } from '@prisma/client';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });

interface ExportedColumn {
  id: string;
  boardId: string;
  name: string;
  type: ColumnType;
  order: number;
  requiredForCompletion: boolean;
  alignment: string;
  options: { id: string; columnId: string; value: string; color?: string | null; order: number }[];
}

interface ExportedBoard {
  id: string;
  name: string;
  columns: ExportedColumn[];
}

interface ExportedCellValue {
  id: string;
  taskId: string;
  columnId: string;
  value: string;
}

interface ExportedTask {
  id: string;
  boardId: string;
  order: number;
  cellValues: ExportedCellValue[];
}

interface SingleBoardExport {
  board: { id: string; name: string; columns: ExportedColumn[] };
  tasks: { id: string; order: number; cells: Record<string, string> }[];
}

// RFC 4180 compliant CSV parser
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let i = 0;
  const n = text.length;

  while (i <= n) {
    if (i === n) {
      if (row.length > 0) rows.push(row);
      break;
    }

    if (text[i] === '\r' || text[i] === '\n') {
      if (row.length > 0) rows.push(row);
      row = [];
      if (text[i] === '\r' && i + 1 < n && text[i + 1] === '\n') i++;
      i++;
      continue;
    }

    if (text[i] === '"') {
      let val = '';
      i++; // skip opening quote
      while (i < n) {
        if (text[i] === '"') {
          if (i + 1 < n && text[i + 1] === '"') {
            val += '"';
            i += 2;
          } else {
            i++; // skip closing quote
            break;
          }
        } else {
          val += text[i++];
        }
      }
      row.push(val);
      if (i < n && text[i] === ',') i++;
    } else {
      const start = i;
      while (i < n && text[i] !== ',' && text[i] !== '\r' && text[i] !== '\n') i++;
      row.push(text.slice(start, i));
      if (i < n && text[i] === ',') i++;
    }
  }

  return rows.filter((r) => !(r.length === 1 && r[0] === ''));
}

function resolveImportName(existingNames: Set<string>, baseName: string): string {
  if (!existingNames.has(baseName)) return baseName;
  let candidate = `${baseName} (Imported)`;
  let n = 2;
  while (existingNames.has(candidate)) {
    candidate = `${baseName} (Imported ${n++})`;
  }
  return candidate;
}

async function importNewJson(
  data: SingleBoardExport,
  existingNames: Set<string>
): Promise<{ boardCount: number; taskCount: number }> {
  const { board, tasks } = data;

  const importName = resolveImportName(existingNames, board.name);
  existingNames.add(importName);

  const newBoardId = uuidv4();
  const columnIdMap = new Map<string, string>(); // old col id → new col id
  const optionIdMap = new Map<string, string>();  // old opt id → new opt id
  for (const col of board.columns) {
    columnIdMap.set(col.id, uuidv4());
  }

  await prisma.board.create({ data: { id: newBoardId, name: importName } });

  for (const col of board.columns) {
    const newColId = columnIdMap.get(col.id)!;
    await prisma.column.create({
      data: {
        id: newColId,
        boardId: newBoardId,
        name: col.name,
        type: col.type,
        order: col.order,
        requiredForCompletion: col.requiredForCompletion ?? false,
        alignment: col.alignment ?? 'auto',
      },
    });

    for (const opt of col.options ?? []) {
      const newOptId = uuidv4();
      optionIdMap.set(opt.id, newOptId);
      await prisma.columnOption.create({
        data: {
          id: newOptId,
          columnId: newColId,
          value: opt.value,
          color: opt.color ?? null,
          order: opt.order,
        },
      });
    }
  }

  let taskCount = 0;
  for (const task of tasks) {
    const newTaskId = uuidv4();
    await prisma.task.create({ data: { id: newTaskId, boardId: newBoardId, order: task.order } });

    for (const [oldColId, value] of Object.entries(task.cells ?? {})) {
      const newColId = columnIdMap.get(oldColId);
      if (!newColId) continue;

      const col = board.columns.find((c) => c.id === oldColId);
      let remappedValue = value;

      if (col?.type === 'DROPDOWN' || col?.type === 'SOURCE') {
        remappedValue = optionIdMap.get(value) ?? value;
      } else if (col?.type === 'MULTI_SELECT') {
        try {
          const arr = JSON.parse(value) as string[];
          if (Array.isArray(arr)) {
            remappedValue = JSON.stringify(arr.map((id) => optionIdMap.get(id) ?? id));
          }
        } catch {
          // not a JSON array, leave as-is
        }
      }

      await prisma.cellValue.create({ data: { taskId: newTaskId, columnId: newColId, value: remappedValue } });
    }
    taskCount++;
  }

  return { boardCount: 1, taskCount };
}

async function importCsvBoard(
  csvText: string,
  boardName: string,
  existingNames: Set<string>
): Promise<{ boardCount: number; taskCount: number }> {
  const rows = parseCsv(csvText);
  if (rows.length === 0) throw new Error('CSV file is empty');

  const headers = rows[0];
  const dataRows = rows.slice(1);

  const importName = resolveImportName(existingNames, boardName);
  existingNames.add(importName);

  const newBoardId = uuidv4();
  await prisma.board.create({ data: { id: newBoardId, name: importName } });

  const columns = headers.map((h, i) => ({
    id: uuidv4(),
    name: h.trim() || `Column ${i + 1}`,
    order: i,
  }));

  for (const col of columns) {
    await prisma.column.create({
      data: {
        id: col.id,
        boardId: newBoardId,
        name: col.name,
        type: 'TEXT' as ColumnType,
        order: col.order,
        requiredForCompletion: false,
        alignment: 'auto',
      },
    });
  }

  let taskCount = 0;
  for (let rowIdx = 0; rowIdx < dataRows.length; rowIdx++) {
    const row = dataRows[rowIdx];
    if (row.every((cell) => cell === '')) continue;

    const newTaskId = uuidv4();
    await prisma.task.create({ data: { id: newTaskId, boardId: newBoardId, order: rowIdx } });

    for (let colIdx = 0; colIdx < columns.length; colIdx++) {
      const value = row[colIdx] ?? '';
      if (value) {
        await prisma.cellValue.create({ data: { taskId: newTaskId, columnId: columns[colIdx].id, value } });
      }
    }
    taskCount++;
  }

  return { boardCount: 1, taskCount };
}

// POST /api/import/all — import from CSV, JSON, or ZIP
router.post('/all', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const filename = req.file.originalname.toLowerCase();
  const isZip = filename.endsWith('.zip');
  const isJson = filename.endsWith('.json');
  const isCsv = filename.endsWith('.csv');

  if (!isZip && !isJson && !isCsv) {
    return res.status(400).json({ error: 'Unsupported file type. Please upload a .csv, .json, or .zip file.' });
  }

  try {
    const existingNames = new Set(
      (await prisma.board.findMany({ select: { name: true } })).map((b) => b.name)
    );

    if (isJson) {
      let data: SingleBoardExport;
      try {
        data = JSON.parse(req.file.buffer.toString('utf8')) as SingleBoardExport;
      } catch {
        return res.status(400).json({ error: 'Invalid JSON file' });
      }
      if (!data.board || !Array.isArray(data.tasks)) {
        return res.status(400).json({ error: 'Invalid export file: missing board or tasks data' });
      }
      const result = await importNewJson(data, existingNames);
      capture('import_used', { format: 'json', ...result });
      return res.json({ success: true, ...result });
    }

    if (isCsv) {
      const csvText = req.file.buffer.toString('utf8');
      const boardName = req.file.originalname
        .replace(/\.csv$/i, '')
        .replace(/-\d{4}-\d{2}-\d{2}$/, '')
        .trim() || 'Imported Board';
      const result = await importCsvBoard(csvText, boardName, existingNames);
      capture('import_used', { format: 'csv', ...result });
      return res.json({ success: true, ...result });
    }

    // ZIP file
    let zip: AdmZip;
    try {
      zip = new AdmZip(req.file.buffer);
    } catch {
      return res.status(400).json({ error: 'Invalid ZIP file' });
    }

    const boardsEntry = zip.getEntry('boards.json');

    if (boardsEntry) {
      // Old ZIP format: boards.json + tasks.json (restore with original IDs)
      const tasksEntry = zip.getEntry('tasks.json');
      if (!tasksEntry) {
        return res.status(400).json({ error: 'Invalid export file: missing tasks.json' });
      }

      let boards: ExportedBoard[];
      let tasks: ExportedTask[];
      try {
        ({ boards } = JSON.parse(boardsEntry.getData().toString('utf8')) as { boards: ExportedBoard[] });
        ({ tasks } = JSON.parse(tasksEntry.getData().toString('utf8')) as { tasks: ExportedTask[] });
      } catch {
        return res.status(400).json({ error: 'Malformed export file: could not parse JSON' });
      }

      let boardCount = 0;
      let taskCount = 0;

      for (const board of boards) {
        const existing = await prisma.board.findUnique({ where: { id: board.id } });

        let importName = board.name;
        if (!existing && existingNames.has(board.name)) {
          let candidate = `${board.name} (Imported)`;
          let n = 2;
          while (existingNames.has(candidate)) {
            candidate = `${board.name} (Imported ${n++})`;
          }
          importName = candidate;
        }
        existingNames.add(importName);

        await prisma.board.upsert({
          where: { id: board.id },
          create: { id: board.id, name: importName },
          update: { name: board.name },
        });

        for (const col of board.columns) {
          await prisma.column.upsert({
            where: { id: col.id },
            create: {
              id: col.id,
              boardId: board.id,
              name: col.name,
              type: col.type,
              order: col.order,
              requiredForCompletion: col.requiredForCompletion ?? false,
              alignment: col.alignment ?? 'auto',
            },
            update: {
              name: col.name,
              type: col.type,
              order: col.order,
              requiredForCompletion: col.requiredForCompletion ?? false,
              alignment: col.alignment ?? 'auto',
            },
          });

          for (const opt of col.options ?? []) {
            await prisma.columnOption.upsert({
              where: { id: opt.id },
              create: { id: opt.id, columnId: col.id, value: opt.value, color: opt.color ?? null, order: opt.order },
              update: { value: opt.value, color: opt.color ?? null, order: opt.order },
            });
          }
        }

        boardCount++;
      }

      for (const task of tasks) {
        await prisma.task.upsert({
          where: { id: task.id },
          create: { id: task.id, boardId: task.boardId, order: task.order },
          update: { order: task.order },
        });

        for (const cv of task.cellValues ?? []) {
          await prisma.cellValue.upsert({
            where: { taskId_columnId: { taskId: task.id, columnId: cv.columnId } },
            create: { taskId: task.id, columnId: cv.columnId, value: cv.value },
            update: { value: cv.value },
          });
        }

        taskCount++;
      }

      capture('import_used', { format: 'zip_legacy', boardCount, taskCount });
      return res.json({ success: true, boardCount, taskCount });
    }

    // New ZIP format: individual .json/.csv files per board
    const boardEntries = zip
      .getEntries()
      .filter(
        (e) =>
          !e.isDirectory &&
          e.entryName !== 'export-manifest.json' &&
          (e.entryName.endsWith('.json') || e.entryName.endsWith('.csv'))
      );

    if (boardEntries.length === 0) {
      return res.status(400).json({ error: 'Invalid ZIP file: no board files found' });
    }

    let boardCount = 0;
    let taskCount = 0;

    for (const entry of boardEntries) {
      const content = entry.getData().toString('utf8');
      const entryName = entry.entryName;

      if (entryName.endsWith('.json')) {
        let data: SingleBoardExport;
        try {
          data = JSON.parse(content) as SingleBoardExport;
        } catch {
          continue;
        }
        if (!data.board || !Array.isArray(data.tasks)) continue;
        const result = await importNewJson(data, existingNames);
        boardCount += result.boardCount;
        taskCount += result.taskCount;
      } else if (entryName.endsWith('.csv')) {
        const boardName = entryName
          .replace(/\.csv$/i, '')
          .replace(/-\d{4}-\d{2}-\d{2}$/, '')
          .trim() || 'Imported Board';
        const result = await importCsvBoard(content, boardName, existingNames);
        boardCount += result.boardCount;
        taskCount += result.taskCount;
      }
    }

    capture('import_used', { format: 'zip', boardCount, taskCount });
    return res.json({ success: true, boardCount, taskCount });
  } catch (err) {
    console.error('Import failed:', err);
    return res.status(500).json({ error: 'Import failed. Please check the file format and try again.' });
  }
});

export { router as importRoutes };
