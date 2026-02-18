import { Router } from 'express';
import { prisma } from '../lib/prisma.js';

export const boardRoutes = Router();

/**
 * @openapi
 * /api/boards:
 *   get:
 *     tags: [Boards]
 *     summary: Get all boards
 *     responses:
 *       200:
 *         description: List of boards
 */
boardRoutes.get('/', async (req, res) => {
  try {
    const boards = await prisma.board.findMany({
      orderBy: { createdAt: 'desc' },
    });
    res.json(boards);
  } catch (error) {
    console.error('Error fetching boards:', error);
    res.status(500).json({ error: 'Failed to fetch boards' });
  }
});

/**
 * @openapi
 * /api/boards/{id}:
 *   get:
 *     tags: [Boards]
 *     summary: Get a single board with columns and tasks
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Board with columns and tasks
 *       404:
 *         description: Board not found
 */
boardRoutes.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const board = await prisma.board.findUnique({
      where: { id },
      include: {
        columns: {
          orderBy: { order: 'asc' },
          include: {
            options: {
              orderBy: { order: 'asc' },
            },
          },
        },
        tasks: {
          orderBy: { order: 'asc' },
          include: {
            cellValues: true,
          },
        },
      },
    });

    if (!board) {
      return res.status(404).json({ error: 'Board not found' });
    }

    res.json(board);
  } catch (error) {
    console.error('Error fetching board:', error);
    res.status(500).json({ error: 'Failed to fetch board' });
  }
});

/**
 * @openapi
 * /api/boards:
 *   post:
 *     tags: [Boards]
 *     summary: Create a new board
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name:
 *                 type: string
 *     responses:
 *       201:
 *         description: Board created
 */
boardRoutes.post('/', async (req, res) => {
  try {
    const { name } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    const board = await prisma.board.create({
      data: {
        name,
        columns: {
          create: [
            { name: 'Task', type: 'TEXT', order: 0 },
            { name: 'Status', type: 'DROPDOWN', order: 1, options: {
              create: [
                { value: 'To Do', order: 0 },
                { value: 'In Progress', order: 1 },
                { value: 'Done', order: 2 },
              ],
            }},
            { name: 'Due Date', type: 'DATE', order: 2 },
            { name: 'Source', type: 'SOURCE', order: 3 },
          ],
        },
      },
      include: {
        columns: {
          orderBy: { order: 'asc' },
          include: {
            options: {
              orderBy: { order: 'asc' },
            },
          },
        },
        tasks: true,
      },
    });

    res.status(201).json(board);
  } catch (error) {
    console.error('Error creating board:', error);
    res.status(500).json({ error: 'Failed to create board' });
  }
});

/**
 * @openapi
 * /api/boards/{id}:
 *   put:
 *     tags: [Boards]
 *     summary: Update a board name
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *     responses:
 *       200:
 *         description: Board updated
 */
boardRoutes.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;

    const board = await prisma.board.update({
      where: { id },
      data: { name },
    });

    res.json(board);
  } catch (error) {
    console.error('Error updating board:', error);
    res.status(500).json({ error: 'Failed to update board' });
  }
});

/**
 * @openapi
 * /api/boards/{id}:
 *   delete:
 *     tags: [Boards]
 *     summary: Delete a board
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       204:
 *         description: Board deleted
 */
boardRoutes.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    await prisma.board.delete({
      where: { id },
    });

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting board:', error);
    res.status(500).json({ error: 'Failed to delete board' });
  }
});
