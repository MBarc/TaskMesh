import { Router } from 'express';
import { prisma } from '../lib/prisma.js';

export const themeRoutes = Router();

themeRoutes.get('/', async (_req, res) => {
  try {
    const themes = await prisma.customTheme.findMany({ orderBy: { createdAt: 'asc' } });
    res.json(themes);
  } catch (error) {
    console.error('Error fetching themes:', error);
    res.status(500).json({ error: 'Failed to fetch themes' });
  }
});

themeRoutes.post('/', async (req, res) => {
  try {
    const { name, isDark, colors } = req.body as Record<string, unknown>;
    if (typeof name !== 'string' || !name.trim() || typeof isDark !== 'boolean' || !colors) {
      return res.status(400).json({ error: 'name, isDark, and colors are required' });
    }
    const theme = await prisma.customTheme.create({ data: { name: name.trim(), isDark, colors } });
    res.status(201).json(theme);
  } catch (error) {
    console.error('Error creating theme:', error);
    res.status(500).json({ error: 'Failed to create theme' });
  }
});

themeRoutes.put('/:id', async (req, res) => {
  try {
    const { name, isDark, colors } = req.body as Record<string, unknown>;
    const data: Record<string, unknown> = {};
    if (typeof name === 'string' && name.trim()) data.name = name.trim();
    if (typeof isDark === 'boolean') data.isDark = isDark;
    if (colors) data.colors = colors;
    const theme = await prisma.customTheme.update({ where: { id: req.params.id }, data });
    res.json(theme);
  } catch (error) {
    console.error('Error updating theme:', error);
    res.status(500).json({ error: 'Failed to update theme' });
  }
});

themeRoutes.delete('/:id', async (req, res) => {
  try {
    await prisma.customTheme.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting theme:', error);
    res.status(500).json({ error: 'Failed to delete theme' });
  }
});
