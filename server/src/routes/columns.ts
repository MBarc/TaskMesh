import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import type { ColumnType } from '@prisma/client';
import { requireScope } from '../lib/apiKeyAuth.js';
import { capture } from '../lib/telemetry.js';

export const columnRoutes = Router();

/**
 * @openapi
 * /api/columns/boards/{boardId}/columns:
 *   post:
 *     tags: [Columns]
 *     summary: Add column to board
 *     parameters:
 *       - in: path
 *         name: boardId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       201:
 *         description: Column created
 */
columnRoutes.post('/boards/:boardId/columns', requireScope('boards:write'), async (req, res) => {
  try {
    const { boardId } = req.params as Record<string, string>;
    const { name, type, options } = req.body;

    if (!name || !type) {
      return res.status(400).json({ error: 'Name and type are required' });
    }

    // Get max order for this board
    const maxOrder = await prisma.column.aggregate({
      where: { boardId },
      _max: { order: true },
    });

    const newOrder = (maxOrder._max?.order ?? -1) + 1;

    const column = await prisma.column.create({
      data: {
        boardId,
        name,
        type: type as ColumnType,
        order: newOrder,
        options: options?.length ? {
          create: options.map((opt: { value: string; color?: string }, idx: number) => ({
            value: opt.value,
            color: opt.color,
            order: idx,
          })),
        } : undefined,
      },
      include: {
        options: {
          orderBy: { order: 'asc' },
        },
      },
    });

    capture('column_created', { type });
    res.status(201).json(column);
  } catch (error) {
    console.error('Error creating column:', error);
    res.status(500).json({ error: 'Failed to create column' });
  }
});

/**
 * @openapi
 * /api/columns/{id}:
 *   put:
 *     tags: [Columns]
 *     summary: Update column
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Column updated
 */
columnRoutes.put('/:id', requireScope('boards:write'), async (req, res) => {
  try {
    const { id } = req.params as Record<string, string>;
    const { name, options, requiredForCompletion, alignment } = req.body;

    // Update column name and optional fields
    const updateData: Record<string, unknown> = { name };
    if (typeof requiredForCompletion === 'boolean') {
      updateData.requiredForCompletion = requiredForCompletion;
    }
    if (typeof alignment === 'string' && ['auto', 'left', 'center', 'right'].includes(alignment)) {
      updateData.alignment = alignment;
    }

    const column = await prisma.column.update({
      where: { id },
      data: updateData,
    });

    // If options are provided, upsert them (preserving IDs so existing cell values aren't broken)
    if (options !== undefined) {
      const incoming = options as { id?: string; value: string; color?: string }[];
      const keptIds = incoming.filter((o) => o.id).map((o) => o.id!);

      // Delete options that were removed
      await prisma.columnOption.deleteMany({
        where: { columnId: id, ...(keptIds.length > 0 ? { id: { notIn: keptIds } } : {}) },
      });

      // Update existing options and create new ones
      for (let idx = 0; idx < incoming.length; idx++) {
        const opt = incoming[idx];
        if (opt.id) {
          await prisma.columnOption.update({
            where: { id: opt.id },
            data: { value: opt.value, color: opt.color ?? null, order: idx },
          });
        } else {
          await prisma.columnOption.create({
            data: { columnId: id, value: opt.value, color: opt.color ?? null, order: idx },
          });
        }
      }
    }

    // Fetch updated column with options
    const updatedColumn = await prisma.column.findUnique({
      where: { id },
      include: {
        options: {
          orderBy: { order: 'asc' },
        },
      },
    });

    capture('column_updated');
    res.json(updatedColumn);
  } catch (error) {
    console.error('Error updating column:', error);
    res.status(500).json({ error: 'Failed to update column' });
  }
});

/**
 * @openapi
 * /api/columns/{id}:
 *   delete:
 *     tags: [Columns]
 *     summary: Delete column
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       204:
 *         description: Column deleted
 */
columnRoutes.delete('/:id', requireScope('boards:write'), async (req, res) => {
  try {
    const { id } = req.params as Record<string, string>;

    await prisma.column.delete({
      where: { id },
    });

    capture('column_deleted');
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting column:', error);
    res.status(500).json({ error: 'Failed to delete column' });
  }
});

/**
 * @openapi
 * /api/columns/boards/{boardId}/columns/ensure-source:
 *   post:
 *     tags: [Columns]
 *     summary: Ensure SOURCE column exists
 *     parameters:
 *       - in: path
 *         name: boardId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Existing SOURCE column
 *       201:
 *         description: SOURCE column created
 */
columnRoutes.post('/boards/:boardId/columns/ensure-source', requireScope('boards:write'), async (req, res) => {
  try {
    const { boardId } = req.params as Record<string, string>;

    // Check if a SOURCE column already exists
    const existing = await prisma.column.findFirst({
      where: { boardId, type: 'SOURCE' },
      include: { options: { orderBy: { order: 'asc' } } },
    });

    if (existing) {
      return res.json(existing);
    }

    // Get max order for this board
    const maxOrder = await prisma.column.aggregate({
      where: { boardId },
      _max: { order: true },
    });

    const newOrder = (maxOrder._max?.order ?? -1) + 1;

    const column = await prisma.column.create({
      data: {
        boardId,
        name: 'Source',
        type: 'SOURCE',
        order: newOrder,
      },
      include: { options: { orderBy: { order: 'asc' } } },
    });

    res.status(201).json(column);
  } catch (error) {
    console.error('Error ensuring source column:', error);
    res.status(500).json({ error: 'Failed to ensure source column' });
  }
});

/**
 * @openapi
 * /api/columns/boards/{boardId}/columns/ensure-ado:
 *   post:
 *     tags: [Columns]
 *     summary: Ensure ADO_PUSH column exists
 *     parameters:
 *       - in: path
 *         name: boardId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Existing ADO_PUSH column
 *       201:
 *         description: ADO_PUSH column created
 */
columnRoutes.post('/boards/:boardId/columns/ensure-ado', requireScope('boards:write'), async (req, res) => {
  try {
    const { boardId } = req.params as Record<string, string>;

    // Check if an ADO_PUSH column already exists
    const existing = await prisma.column.findFirst({
      where: { boardId, type: 'ADO_PUSH' },
      include: { options: { orderBy: { order: 'asc' } } },
    });

    if (existing) {
      return res.json(existing);
    }

    // Get max order for this board
    const maxOrder = await prisma.column.aggregate({
      where: { boardId },
      _max: { order: true },
    });

    const newOrder = (maxOrder._max?.order ?? -1) + 1;

    const column = await prisma.column.create({
      data: {
        boardId,
        name: 'ADO Push',
        type: 'ADO_PUSH',
        order: newOrder,
      },
      include: { options: { orderBy: { order: 'asc' } } },
    });

    res.status(201).json(column);
  } catch (error) {
    console.error('Error ensuring ADO column:', error);
    res.status(500).json({ error: 'Failed to ensure ADO column' });
  }
});

/**
 * @openapi
 * /api/columns/boards/{boardId}/columns/ado:
 *   delete:
 *     tags: [Columns]
 *     summary: Delete ADO_PUSH column
 *     parameters:
 *       - in: path
 *         name: boardId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       204:
 *         description: ADO_PUSH column deleted
 */
columnRoutes.delete('/boards/:boardId/columns/ado', requireScope('boards:write'), async (req, res) => {
  try {
    const { boardId } = req.params as Record<string, string>;

    const existing = await prisma.column.findFirst({
      where: { boardId, type: 'ADO_PUSH' },
    });

    if (existing) {
      await prisma.column.delete({
        where: { id: existing.id },
      });
    }

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting ADO column:', error);
    res.status(500).json({ error: 'Failed to delete ADO column' });
  }
});

/**
 * @openapi
 * /api/columns/boards/{boardId}/columns/ensure-item-no:
 *   post:
 *     tags: [Columns]
 *     summary: Ensure ITEM_NO column exists
 *     parameters:
 *       - in: path
 *         name: boardId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Existing ITEM_NO column
 *       201:
 *         description: ITEM_NO column created
 */
columnRoutes.post('/boards/:boardId/columns/ensure-item-no', requireScope('boards:write'), async (req, res) => {
  try {
    const { boardId } = req.params as Record<string, string>;

    const existing = await prisma.column.findFirst({
      where: { boardId, type: 'ITEM_NO' },
      include: { options: { orderBy: { order: 'asc' } } },
    });

    if (existing) {
      return res.json(existing);
    }

    const maxOrder = await prisma.column.aggregate({
      where: { boardId },
      _max: { order: true },
    });

    const newOrder = (maxOrder._max?.order ?? -1) + 1;

    const column = await prisma.column.create({
      data: {
        boardId,
        name: 'Item No.',
        type: 'ITEM_NO',
        order: newOrder,
      },
      include: { options: { orderBy: { order: 'asc' } } },
    });

    res.status(201).json(column);
  } catch (error) {
    console.error('Error ensuring Item No. column:', error);
    res.status(500).json({ error: 'Failed to ensure Item No. column' });
  }
});

/**
 * @openapi
 * /api/columns/boards/{boardId}/columns/item-no:
 *   delete:
 *     tags: [Columns]
 *     summary: Delete ITEM_NO column
 *     parameters:
 *       - in: path
 *         name: boardId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       204:
 *         description: ITEM_NO column deleted
 */
columnRoutes.delete('/boards/:boardId/columns/item-no', requireScope('boards:write'), async (req, res) => {
  try {
    const { boardId } = req.params as Record<string, string>;

    const existing = await prisma.column.findFirst({
      where: { boardId, type: 'ITEM_NO' },
    });

    if (existing) {
      await prisma.column.delete({
        where: { id: existing.id },
      });
    }

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting Item No. column:', error);
    res.status(500).json({ error: 'Failed to delete Item No. column' });
  }
});

/**
 * @openapi
 * /api/columns/boards/{boardId}/columns/ensure-snow-push:
 *   post:
 *     tags: [Columns]
 *     summary: Ensure SNOW_PUSH column exists
 *     parameters:
 *       - in: path
 *         name: boardId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Existing SNOW_PUSH column
 *       201:
 *         description: SNOW_PUSH column created
 */
columnRoutes.post('/boards/:boardId/columns/ensure-snow-push', requireScope('boards:write'), async (req, res) => {
  try {
    const { boardId } = req.params as Record<string, string>;

    const existing = await prisma.column.findFirst({
      where: { boardId, type: 'SNOW_PUSH' },
      include: { options: { orderBy: { order: 'asc' } } },
    });

    if (existing) {
      return res.json(existing);
    }

    const maxOrder = await prisma.column.aggregate({
      where: { boardId },
      _max: { order: true },
    });

    const newOrder = (maxOrder._max?.order ?? -1) + 1;

    const column = await prisma.column.create({
      data: {
        boardId,
        name: 'SNOW Push',
        type: 'SNOW_PUSH',
        order: newOrder,
      },
      include: { options: { orderBy: { order: 'asc' } } },
    });

    res.status(201).json(column);
  } catch (error) {
    console.error('Error ensuring SNOW_PUSH column:', error);
    res.status(500).json({ error: 'Failed to ensure SNOW_PUSH column' });
  }
});

/**
 * @openapi
 * /api/columns/boards/{boardId}/columns/snow-push:
 *   delete:
 *     tags: [Columns]
 *     summary: Delete SNOW_PUSH column
 *     parameters:
 *       - in: path
 *         name: boardId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       204:
 *         description: SNOW_PUSH column deleted
 */
columnRoutes.delete('/boards/:boardId/columns/snow-push', requireScope('boards:write'), async (req, res) => {
  try {
    const { boardId } = req.params as Record<string, string>;

    const existing = await prisma.column.findFirst({
      where: { boardId, type: 'SNOW_PUSH' },
    });

    if (existing) {
      await prisma.column.delete({
        where: { id: existing.id },
      });
    }

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting SNOW_PUSH column:', error);
    res.status(500).json({ error: 'Failed to delete SNOW_PUSH column' });
  }
});

/**
 * @openapi
 * /api/columns/boards/{boardId}/columns/ensure-email:
 *   post:
 *     tags: [Columns]
 *     summary: Ensure EMAIL column exists
 *     parameters:
 *       - in: path
 *         name: boardId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Existing EMAIL column
 *       201:
 *         description: EMAIL column created
 */
columnRoutes.post('/boards/:boardId/columns/ensure-email', requireScope('boards:write'), async (req, res) => {
  try {
    const { boardId } = req.params as Record<string, string>;

    const existing = await prisma.column.findFirst({
      where: { boardId, type: 'EMAIL' },
      include: { options: { orderBy: { order: 'asc' } } },
    });

    if (existing) {
      return res.json(existing);
    }

    const maxOrder = await prisma.column.aggregate({
      where: { boardId },
      _max: { order: true },
    });

    const newOrder = (maxOrder._max?.order ?? -1) + 1;

    const column = await prisma.column.create({
      data: {
        boardId,
        name: 'Email',
        type: 'EMAIL',
        order: newOrder,
      },
      include: { options: { orderBy: { order: 'asc' } } },
    });

    res.status(201).json(column);
  } catch (error) {
    console.error('Error ensuring email column:', error);
    res.status(500).json({ error: 'Failed to ensure email column' });
  }
});

/**
 * @openapi
 * /api/columns/boards/{boardId}/columns/email:
 *   delete:
 *     tags: [Columns]
 *     summary: Delete EMAIL column
 *     parameters:
 *       - in: path
 *         name: boardId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       204:
 *         description: EMAIL column deleted
 */
columnRoutes.delete('/boards/:boardId/columns/email', requireScope('boards:write'), async (req, res) => {
  try {
    const { boardId } = req.params as Record<string, string>;

    const existing = await prisma.column.findFirst({
      where: { boardId, type: 'EMAIL' },
    });

    if (existing) {
      await prisma.column.delete({
        where: { id: existing.id },
      });
    }

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting email column:', error);
    res.status(500).json({ error: 'Failed to delete email column' });
  }
});

/**
 * @openapi
 * /api/columns/boards/{boardId}/columns/ensure-documentation:
 *   post:
 *     tags: [Columns]
 *     summary: Ensure DOCUMENTATION column exists
 *     parameters:
 *       - in: path
 *         name: boardId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Existing DOCUMENTATION column
 *       201:
 *         description: DOCUMENTATION column created
 */
columnRoutes.post('/boards/:boardId/columns/ensure-documentation', requireScope('boards:write'), async (req, res) => {
  try {
    const { boardId } = req.params as Record<string, string>;

    const existing = await prisma.column.findFirst({
      where: { boardId, type: 'DOCUMENTATION' },
      include: { options: { orderBy: { order: 'asc' } } },
    });

    if (existing) {
      return res.json(existing);
    }

    const maxOrder = await prisma.column.aggregate({
      where: { boardId },
      _max: { order: true },
    });

    const newOrder = (maxOrder._max?.order ?? -1) + 1;

    const column = await prisma.column.create({
      data: {
        boardId,
        name: 'Documentation',
        type: 'DOCUMENTATION',
        order: newOrder,
      },
      include: { options: { orderBy: { order: 'asc' } } },
    });

    res.status(201).json(column);
  } catch (error) {
    console.error('Error ensuring documentation column:', error);
    res.status(500).json({ error: 'Failed to ensure documentation column' });
  }
});

/**
 * @openapi
 * /api/columns/boards/{boardId}/columns/documentation:
 *   delete:
 *     tags: [Columns]
 *     summary: Delete DOCUMENTATION column
 *     parameters:
 *       - in: path
 *         name: boardId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       204:
 *         description: DOCUMENTATION column deleted
 */
columnRoutes.delete('/boards/:boardId/columns/documentation', requireScope('boards:write'), async (req, res) => {
  try {
    const { boardId } = req.params as Record<string, string>;

    const existing = await prisma.column.findFirst({
      where: { boardId, type: 'DOCUMENTATION' },
    });

    if (existing) {
      await prisma.column.delete({
        where: { id: existing.id },
      });
    }

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting documentation column:', error);
    res.status(500).json({ error: 'Failed to delete documentation column' });
  }
});

/**
 * @openapi
 * /api/columns/boards/{boardId}/columns/reorder:
 *   put:
 *     tags: [Columns]
 *     summary: Reorder columns
 *     parameters:
 *       - in: path
 *         name: boardId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Columns reordered
 */
columnRoutes.put('/boards/:boardId/columns/reorder', requireScope('boards:write'), async (req, res) => {
  try {
    const { boardId } = req.params as Record<string, string>;
    const { columnIds } = req.body;

    if (!Array.isArray(columnIds)) {
      return res.status(400).json({ error: 'columnIds must be an array' });
    }

    // Update each column's order
    await Promise.all(
      columnIds.map((columnId: string, index: number) =>
        prisma.column.update({
          where: { id: columnId },
          data: { order: index },
        })
      )
    );

    // Fetch updated columns
    const columns = await prisma.column.findMany({
      where: { boardId },
      orderBy: { order: 'asc' },
      include: {
        options: {
          orderBy: { order: 'asc' },
        },
      },
    });

    capture('columns_reordered');
    res.json(columns);
  } catch (error) {
    console.error('Error reordering columns:', error);
    res.status(500).json({ error: 'Failed to reorder columns' });
  }
});
