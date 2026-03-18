import { Router } from 'express';
import { prisma } from '../lib/prisma.js';

export const sortRoutes = Router();

sortRoutes.get('/', async (_req, res) => {
  try {
    const rows = await prisma.boardSort.findMany();
    const boardSorts: Record<string, unknown> = {};
    for (const row of rows) {
      boardSorts[row.boardId] = row.sorts;
    }
    res.json(boardSorts);
  } catch (error) {
    console.error('Error fetching sorts:', error);
    res.status(500).json({ error: 'Failed to fetch sorts' });
  }
});

sortRoutes.put('/:boardId', async (req, res) => {
  try {
    const { boardId } = req.params;
    const { sorts } = req.body as { sorts: unknown };
    if (!Array.isArray(sorts)) {
      return res.status(400).json({ error: 'sorts must be an array' });
    }
    const row = await prisma.boardSort.upsert({
      where: { boardId },
      create: { boardId, sorts },
      update: { sorts },
    });
    res.json(row);
  } catch (error) {
    console.error('Error updating sorts:', error);
    res.status(500).json({ error: 'Failed to update sorts' });
  }
});

sortRoutes.delete('/:boardId', async (req, res) => {
  try {
    await prisma.boardSort.deleteMany({ where: { boardId: req.params.boardId } });
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting sorts:', error);
    res.status(500).json({ error: 'Failed to delete sorts' });
  }
});
