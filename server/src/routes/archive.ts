import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { runCleanup } from '../lib/archiveCleaner.js';

export const archiveRoutes = Router();

// GET /api/archive/settings
archiveRoutes.get('/settings', async (_req, res) => {
  try {
    let settings = await prisma.appSettings.findUnique({
      where: { id: 'singleton' },
    });

    if (!settings) {
      settings = { id: 'singleton', archiveEnabled: false, archiveRetentionDays: 30, createdAt: new Date(), updatedAt: new Date() };
    }

    res.json({
      archiveEnabled: settings.archiveEnabled,
      archiveRetentionDays: settings.archiveRetentionDays,
    });
  } catch (error) {
    console.error('Error getting archive settings:', error);
    res.status(500).json({ error: 'Failed to get archive settings' });
  }
});

// PUT /api/archive/settings
archiveRoutes.put('/settings', async (req, res) => {
  try {
    const { archiveEnabled, archiveRetentionDays } = req.body;

    const settings = await prisma.appSettings.upsert({
      where: { id: 'singleton' },
      update: {
        archiveEnabled: archiveEnabled ?? undefined,
        archiveRetentionDays: archiveRetentionDays ?? undefined,
      },
      create: {
        id: 'singleton',
        archiveEnabled: archiveEnabled ?? false,
        archiveRetentionDays: archiveRetentionDays ?? 30,
      },
    });

    // If disabling archive, purge all archived tasks
    if (archiveEnabled === false) {
      await prisma.archivedTask.deleteMany({});
    }

    res.json({
      archiveEnabled: settings.archiveEnabled,
      archiveRetentionDays: settings.archiveRetentionDays,
    });
  } catch (error) {
    console.error('Error updating archive settings:', error);
    res.status(500).json({ error: 'Failed to update archive settings' });
  }
});

// GET /api/archive/tasks
archiveRoutes.get('/tasks', async (_req, res) => {
  try {
    // Run retention cleanup before returning
    await runCleanup();

    const archivedTasks = await prisma.archivedTask.findMany({
      orderBy: { archivedAt: 'desc' },
    });

    // Check which boards still exist
    const boardIds = [...new Set(archivedTasks.map(t => t.originalBoardId))];
    const existingBoards = await prisma.board.findMany({
      where: { id: { in: boardIds } },
      select: { id: true },
    });
    const existingBoardIds = new Set(existingBoards.map(b => b.id));

    // Group by originalBoardId
    const groupMap = new Map<string, {
      boardId: string;
      boardName: string;
      boardStillExists: boolean;
      tasks: typeof archivedTasks;
    }>();

    for (const task of archivedTasks) {
      let group = groupMap.get(task.originalBoardId);
      if (!group) {
        group = {
          boardId: task.originalBoardId,
          boardName: task.originalBoardName,
          boardStillExists: existingBoardIds.has(task.originalBoardId),
          tasks: [],
        };
        groupMap.set(task.originalBoardId, group);
      }
      group.tasks.push(task);
    }

    res.json({ groups: Array.from(groupMap.values()) });
  } catch (error) {
    console.error('Error getting archived tasks:', error);
    res.status(500).json({ error: 'Failed to get archived tasks' });
  }
});

// POST /api/archive/tasks/:id/restore
archiveRoutes.post('/tasks/:id/restore', async (req, res) => {
  try {
    const { id } = req.params;

    const archived = await prisma.archivedTask.findUnique({ where: { id } });
    if (!archived) {
      return res.status(404).json({ error: 'Archived task not found' });
    }

    // Check if original board still exists
    const board = await prisma.board.findUnique({
      where: { id: archived.originalBoardId },
      include: { columns: { include: { options: true } } },
    });

    if (!board) {
      return res.status(409).json({ error: 'Original board no longer exists' });
    }

    const snapshot = archived.snapshot as {
      columns: {
        columnId: string;
        name: string;
        type: string;
        value: string;
        optionLabel?: string;
        optionColor?: string;
      }[];
      order: number;
    };

    // Get max order for the board
    const maxOrder = await prisma.task.aggregate({
      where: { boardId: board.id },
      _max: { order: true },
    });
    const newOrder = (maxOrder._max.order ?? -1) + 1;

    // Match snapshot columns to current board columns
    const cellValuesToCreate: { columnId: string; value: string }[] = [];

    for (const snapCol of snapshot.columns) {
      // Try matching by columnId first
      let boardCol = board.columns.find(c => c.id === snapCol.columnId);

      // Fallback: match by name + type
      if (!boardCol) {
        boardCol = board.columns.find(c => c.name === snapCol.name && c.type === snapCol.type);
      }

      if (!boardCol) continue;

      let value = snapCol.value;

      // For DROPDOWN columns, verify the option still exists
      if (boardCol.type === 'DROPDOWN' && value) {
        try {
          const parsed = JSON.parse(value);
          if (parsed && parsed.id) {
            const optionExists = boardCol.options.some(o => o.id === parsed.id);
            if (!optionExists && snapCol.optionLabel) {
              // Fallback: find option by label
              const matchByLabel = boardCol.options.find(o => o.value === snapCol.optionLabel);
              if (matchByLabel) {
                value = JSON.stringify({ id: matchByLabel.id, value: matchByLabel.value, color: matchByLabel.color });
              } else {
                continue; // Option no longer exists, skip
              }
            }
          }
        } catch {
          // Not JSON, use as-is
        }
      }

      cellValuesToCreate.push({ columnId: boardCol.id, value });
    }

    // Create the restored task
    const task = await prisma.task.create({
      data: {
        boardId: board.id,
        order: newOrder,
        cellValues: {
          create: cellValuesToCreate,
        },
      },
      include: { cellValues: true },
    });

    // Remove from archive
    await prisma.archivedTask.delete({ where: { id } });

    res.json(task);
  } catch (error) {
    console.error('Error restoring archived task:', error);
    res.status(500).json({ error: 'Failed to restore task' });
  }
});

// DELETE /api/archive/tasks/:id
archiveRoutes.delete('/tasks/:id', async (req, res) => {
  try {
    const { id } = req.params;

    await prisma.archivedTask.delete({ where: { id } });

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting archived task:', error);
    res.status(500).json({ error: 'Failed to delete archived task' });
  }
});
