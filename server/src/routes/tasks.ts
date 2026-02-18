import { Router } from 'express';
import { prisma } from '../lib/prisma.js';

export const taskRoutes = Router();

/**
 * @openapi
 * /api/tasks/boards/{boardId}/tasks:
 *   post:
 *     tags: [Tasks]
 *     summary: Create a task
 *     parameters:
 *       - in: path
 *         name: boardId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       201:
 *         description: Task created
 */
taskRoutes.post('/boards/:boardId/tasks', async (req, res) => {
  try {
    const { boardId } = req.params;
    const { cellValues } = req.body;

    // Get max order for this board
    const maxOrder = await prisma.task.aggregate({
      where: { boardId },
      _max: { order: true },
    });

    const newOrder = (maxOrder._max.order ?? -1) + 1;

    const task = await prisma.task.create({
      data: {
        boardId,
        order: newOrder,
        cellValues: cellValues ? {
          create: Object.entries(cellValues).map(([columnId, value]) => ({
            columnId,
            value: String(value),
          })),
        } : undefined,
      },
      include: {
        cellValues: true,
      },
    });

    res.status(201).json(task);
  } catch (error) {
    console.error('Error creating task:', error);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

/**
 * @openapi
 * /api/tasks/{id}:
 *   put:
 *     tags: [Tasks]
 *     summary: Update a task
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Task updated
 */
taskRoutes.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { cellValues } = req.body;

    // Update cell values using upsert
    if (cellValues) {
      for (const [columnId, value] of Object.entries(cellValues)) {
        await prisma.cellValue.upsert({
          where: {
            taskId_columnId: {
              taskId: id,
              columnId,
            },
          },
          update: {
            value: String(value),
          },
          create: {
            taskId: id,
            columnId,
            value: String(value),
          },
        });
      }
    }

    // Fetch updated task
    const task = await prisma.task.findUnique({
      where: { id },
      include: {
        cellValues: true,
      },
    });

    res.json(task);
  } catch (error) {
    console.error('Error updating task:', error);
    res.status(500).json({ error: 'Failed to update task' });
  }
});

/**
 * @openapi
 * /api/tasks/{id}:
 *   delete:
 *     tags: [Tasks]
 *     summary: Delete a task
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       204:
 *         description: Task deleted
 */
taskRoutes.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Check if archive is enabled
    const appSettings = await prisma.appSettings.findUnique({
      where: { id: 'singleton' },
    });

    if (appSettings?.archiveEnabled) {
      // Fetch task with board info, cellValues, and column metadata
      const task = await prisma.task.findUnique({
        where: { id },
        include: {
          board: { select: { id: true, name: true } },
          cellValues: {
            include: {
              column: {
                include: { options: true },
              },
            },
          },
        },
      });

      if (task) {
        // Build snapshot
        const snapshotColumns = task.cellValues.map((cv) => {
          const col = cv.column;
          let optionLabel: string | undefined;
          let optionColor: string | undefined;

          if (col.type === 'DROPDOWN' && cv.value) {
            try {
              const parsed = JSON.parse(cv.value);
              if (parsed && parsed.id) {
                const opt = col.options.find((o) => o.id === parsed.id);
                if (opt) {
                  optionLabel = opt.value;
                  optionColor = opt.color ?? undefined;
                }
              }
            } catch {
              // Not JSON
            }
          }

          return {
            columnId: col.id,
            name: col.name,
            type: col.type,
            value: cv.value,
            optionLabel,
            optionColor,
          };
        });

        const snapshot = {
          columns: snapshotColumns,
          order: task.order,
          createdAt: task.createdAt,
          updatedAt: task.updatedAt,
        };

        // Create archived task
        await prisma.archivedTask.create({
          data: {
            originalTaskId: task.id,
            originalBoardId: task.board.id,
            originalBoardName: task.board.name,
            snapshot,
          },
        });
      }
    }

    await prisma.task.delete({
      where: { id },
    });

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting task:', error);
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

/**
 * @openapi
 * /api/tasks/boards/{boardId}/tasks/reorder:
 *   put:
 *     tags: [Tasks]
 *     summary: Reorder tasks
 *     parameters:
 *       - in: path
 *         name: boardId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Tasks reordered
 */
taskRoutes.put('/boards/:boardId/tasks/reorder', async (req, res) => {
  try {
    const { boardId } = req.params;
    const { taskIds } = req.body;

    if (!Array.isArray(taskIds)) {
      return res.status(400).json({ error: 'taskIds must be an array' });
    }

    // Update each task's order
    await Promise.all(
      taskIds.map((taskId: string, index: number) =>
        prisma.task.update({
          where: { id: taskId },
          data: { order: index },
        })
      )
    );

    // Fetch updated tasks
    const tasks = await prisma.task.findMany({
      where: { boardId },
      orderBy: { order: 'asc' },
      include: {
        cellValues: true,
      },
    });

    res.json(tasks);
  } catch (error) {
    console.error('Error reordering tasks:', error);
    res.status(500).json({ error: 'Failed to reorder tasks' });
  }
});

/**
 * @openapi
 * /api/tasks/boards/{boardId}/tasks/bulk:
 *   post:
 *     tags: [Tasks]
 *     summary: Bulk create tasks
 *     parameters:
 *       - in: path
 *         name: boardId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       201:
 *         description: Tasks created
 */
taskRoutes.post('/boards/:boardId/tasks/bulk', async (req, res) => {
  try {
    const { boardId } = req.params;
    const { tasks } = req.body;

    if (!Array.isArray(tasks)) {
      return res.status(400).json({ error: 'tasks must be an array' });
    }

    // Get max order for this board
    const maxOrder = await prisma.task.aggregate({
      where: { boardId },
      _max: { order: true },
    });

    let currentOrder = (maxOrder._max.order ?? -1) + 1;

    const createdTasks = [];

    for (const taskData of tasks) {
      const task = await prisma.task.create({
        data: {
          boardId,
          order: currentOrder++,
          cellValues: taskData.cellValues ? {
            create: Object.entries(taskData.cellValues).map(([columnId, value]) => ({
              columnId,
              value: String(value),
            })),
          } : undefined,
        },
        include: {
          cellValues: true,
        },
      });
      createdTasks.push(task);
    }

    res.status(201).json(createdTasks);
  } catch (error) {
    console.error('Error bulk creating tasks:', error);
    res.status(500).json({ error: 'Failed to create tasks' });
  }
});
