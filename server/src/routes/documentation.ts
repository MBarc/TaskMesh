import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { prisma } from '../lib/prisma.js';
import { capture } from '../lib/telemetry.js';

interface TemplateFrontmatter {
  name?: string;
  namingConvention?: string;
  variables?: { name: string; description: string }[];
}

function parseTemplateFrontmatter(raw: string): { frontmatter: TemplateFrontmatter; content: string } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {}, content: raw };
  }
  const parsed = yaml.load(match[1]) as TemplateFrontmatter;
  return { frontmatter: parsed || {}, content: match[2].replace(/^\r?\n/, '') };
}

const getDocPath = () => process.env.DOCUMENTATION_PATH || '/wiki';

// ── Filesystem sync helpers ────────────────────────────────────────────────

function sanitizeFsName(name: string): string {
  return (name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim()) || '_';
}

async function getBoardFsRoot(boardId: string): Promise<string> {
  const board = await prisma.board.findUnique({ where: { id: boardId }, select: { name: true } });
  return path.join(getDocPath(), board ? sanitizeFsName(board.name) : boardId);
}

async function getFolderFsPath(folder: { name: string; parentFolderId: string | null; boardId: string }): Promise<string> {
  const base = await getBoardFsRoot(folder.boardId);
  const safeName = sanitizeFsName(folder.name);
  if (!folder.parentFolderId) return path.join(base, safeName);
  const parent = await prisma.documentationFolder.findUnique({ where: { id: folder.parentFolderId }, select: { name: true } });
  return path.join(base, parent ? sanitizeFsName(parent.name) : folder.parentFolderId, safeName);
}

async function getFileFsPath(file: { name: string; folderId: string | null; boardId: string }): Promise<string> {
  const base = await getBoardFsRoot(file.boardId);
  const raw = sanitizeFsName(file.name);
  const safeName = raw.toLowerCase().endsWith('.md') ? raw : `${raw}.md`;
  if (!file.folderId) return path.join(base, safeName);
  const folder = await prisma.documentationFolder.findUnique({ where: { id: file.folderId }, select: { name: true, parentFolderId: true } });
  if (!folder) return path.join(base, safeName);
  const folderPath = await getFolderFsPath({ name: folder.name, parentFolderId: folder.parentFolderId, boardId: file.boardId });
  return path.join(folderPath, safeName);
}

function fsTry(label: string, fn: () => void): void {
  try { fn(); } catch (err) { console.error(`[wiki fs] ${label}:`, err); }
}

// ── End helpers ───────────────────────────────────────────────────────────

const router = Router();

// GET /settings
router.get('/settings', async (req, res) => {
  try {
    const settings = await prisma.documentationSettings.findUnique({
      where: { id: 'singleton' },
    });

    res.json({
      subfolder: settings?.subfolder || '',
      localPath: getDocPath(),
      templates: settings?.templates || null,
    });
  } catch (error) {
    console.error('Error fetching documentation settings:', error);
    res.status(500).json({ error: 'Failed to fetch documentation settings' });
  }
});

// PUT /settings
router.put('/settings', async (req, res) => {
  try {
    const { subfolder, templates } = req.body;

    const settings = await prisma.documentationSettings.upsert({
      where: { id: 'singleton' },
      update: {
        subfolder: subfolder || '',
        templates: templates ?? undefined,
      },
      create: {
        id: 'singleton',
        subfolder: subfolder || '',
        templates: templates ?? undefined,
      },
    });

    res.json({
      subfolder: settings.subfolder,
      localPath: getDocPath(),
      templates: settings.templates,
    });
  } catch (error) {
    console.error('Error saving documentation settings:', error);
    res.status(500).json({ error: 'Failed to save documentation settings' });
  }
});

// POST /save-document
router.post('/save-document', async (req, res) => {
  try {
    const { taskId, boardId, columnId, fileName, content } = req.body;

    if (!taskId || !boardId || !columnId || !fileName || content === undefined) {
      return res.status(400).json({ error: 'taskId, boardId, columnId, fileName, and content are required' });
    }

    // Strip .md suffix for DB storage (getFileFsPath appends it)
    const baseName = (fileName.replace(/[<>:"/\\|?*]/g, '_').trim() || 'Untitled').replace(/\.md$/i, '');

    // Check for an existing cell value — may contain a docFileId (new) or filePath (legacy)
    const existingCell = await prisma.cellValue.findUnique({
      where: { taskId_columnId: { taskId, columnId } },
    });

    let docFileId: string;

    if (existingCell) {
      let existingDocFileId: string | null = null;
      try { existingDocFileId = JSON.parse(existingCell.value)?.docFileId ?? null; } catch {}

      if (existingDocFileId) {
        // Update the existing wiki file
        const before = await prisma.documentationFile.findUnique({
          where: { id: existingDocFileId },
          select: { name: true, folderId: true, boardId: true },
        });
        const oldFsPath = before ? await getFileFsPath(before) : null;

        const updated = await prisma.documentationFile.update({
          where: { id: existingDocFileId },
          data: { name: baseName, content },
        });
        docFileId = updated.id;

        const newFsPath = await getFileFsPath({ name: updated.name, folderId: updated.folderId, boardId: updated.boardId });
        fsTry('save-document update', () => {
          fs.mkdirSync(path.dirname(newFsPath), { recursive: true });
          if (oldFsPath && oldFsPath !== newFsPath && fs.existsSync(oldFsPath)) fs.renameSync(oldFsPath, newFsPath);
          fs.writeFileSync(newFsPath, content, 'utf-8');
        });
      } else {
        // Legacy cell (filePath format) — create a new wiki file
        const file = await prisma.documentationFile.create({
          data: { boardId, name: baseName, content, folderId: null },
        });
        docFileId = file.id;
        const fsPath = await getFileFsPath({ name: file.name, folderId: file.folderId, boardId: file.boardId });
        fsTry('save-document create (legacy upgrade)', () => {
          fs.mkdirSync(path.dirname(fsPath), { recursive: true });
          fs.writeFileSync(fsPath, content, 'utf-8');
        });
      }
    } else {
      // No existing cell — create a new wiki file
      const file = await prisma.documentationFile.create({
        data: { boardId, name: baseName, content, folderId: null },
      });
      docFileId = file.id;
      const fsPath = await getFileFsPath({ name: file.name, folderId: file.folderId, boardId: file.boardId });
      fsTry('save-document create', () => {
        fs.mkdirSync(path.dirname(fsPath), { recursive: true });
        fs.writeFileSync(fsPath, content, 'utf-8');
      });
    }

    const cellValue = JSON.stringify({ docFileId, fileName: baseName });

    if (existingCell) {
      await prisma.cellValue.update({ where: { id: existingCell.id }, data: { value: cellValue } });
    } else {
      await prisma.cellValue.create({ data: { taskId, columnId, value: cellValue } });
    }

    await prisma.documentDraft.updateMany({
      where: { taskId, boardId },
      data: { status: 'submitted' },
    });

    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: { cellValues: true },
    });

    capture('documentation_saved');
    res.json(task);
  } catch (error) {
    console.error('Error saving document:', error);
    res.status(500).json({ error: 'Failed to save document' });
  }
});

// POST /save-draft
router.post('/save-draft', async (req, res) => {
  try {
    const { taskId, boardId, fileName, content, templateId } = req.body;

    if (!taskId || !boardId) {
      return res.status(400).json({ error: 'taskId and boardId are required' });
    }

    const draft = await prisma.documentDraft.upsert({
      where: { taskId_boardId: { taskId, boardId } },
      update: {
        fileName: fileName || '',
        content: content || '',
        templateId: templateId || null,
      },
      create: {
        taskId,
        boardId,
        fileName: fileName || '',
        content: content || '',
        templateId: templateId || null,
      },
    });

    res.json(draft);
  } catch (error) {
    console.error('Error saving draft:', error);
    res.status(500).json({ error: 'Failed to save draft' });
  }
});

// GET /draft/:taskId
router.get('/draft/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params as Record<string, string>;
    const draft = await prisma.documentDraft.findFirst({
      where: { taskId, status: 'draft' },
    });
    res.json(draft);
  } catch (error) {
    console.error('Error fetching draft:', error);
    res.status(500).json({ error: 'Failed to fetch draft' });
  }
});

// POST /import-templates
router.post('/import-templates', async (req, res) => {
  try {
    const { templates: rawTemplates } = req.body as {
      templates: { fileName: string; content: string }[];
    };

    if (!Array.isArray(rawTemplates) || rawTemplates.length === 0) {
      return res.status(400).json({ error: 'templates array is required' });
    }

    const existingSettings = await prisma.documentationSettings.findUnique({
      where: { id: 'singleton' },
    });

    const existingTemplates = (existingSettings?.templates as any[] || []);

    const importedTemplates: any[] = [];

    for (const raw of rawTemplates) {
      const { frontmatter, content } = parseTemplateFrontmatter(raw.content);

      importedTemplates.push({
        id: `tpl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: frontmatter.name || raw.fileName.replace(/\.md$/, ''),
        content,
        namingConvention: frontmatter.namingConvention || '',
      });
    }

    const mergedTemplates = [...existingTemplates, ...importedTemplates];

    const settings = await prisma.documentationSettings.upsert({
      where: { id: 'singleton' },
      update: { templates: mergedTemplates },
      create: { id: 'singleton', subfolder: '', templates: mergedTemplates },
    });

    capture('documentation_templates_imported', { count: importedTemplates.length });
    res.json({
      imported: importedTemplates.length,
      templates: settings.templates,
    });
  } catch (error) {
    console.error('Error importing templates:', error);
    res.status(500).json({ error: 'Failed to import templates' });
  }
});

// POST /read-document
router.post('/read-document', async (req, res) => {
  try {
    const { filePath } = req.body;

    if (!filePath) {
      return res.status(400).json({ error: 'filePath is required' });
    }

    const normalizedFilePath = path.normalize(filePath);
    const normalizedBasePath = path.normalize(getDocPath());

    if (!normalizedFilePath.startsWith(normalizedBasePath)) {
      return res.status(403).json({ error: 'Access denied: file is outside base path' });
    }

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    capture('documentation_read');
    res.json({ content, filePath });
  } catch (error) {
    console.error('Error reading document:', error);
    res.status(500).json({ error: 'Failed to read document' });
  }
});

// ── Wiki routes ────────────────────────────────────────────────────────────

// GET /wiki/:boardId — return full tree
router.get('/wiki/:boardId', async (req, res) => {
  try {
    const { boardId } = req.params as Record<string, string>;

    const rootFolders = await prisma.documentationFolder.findMany({
      where: { boardId, parentFolderId: null },
      include: {
        subfolders: {
          include: {
            files: {
              select: { id: true, boardId: true, name: true, folderId: true, createdAt: true, updatedAt: true },
            },
            subfolders: true,
          },
        },
        files: {
          select: { id: true, boardId: true, name: true, folderId: true, createdAt: true, updatedAt: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    const rootFiles = await prisma.documentationFile.findMany({
      where: { boardId, folderId: null },
      select: { id: true, boardId: true, name: true, folderId: true, createdAt: true, updatedAt: true },
      orderBy: { name: 'asc' },
    });

    res.json({ folders: rootFolders, files: rootFiles });
  } catch (error) {
    console.error('Error fetching wiki tree:', error);
    res.status(500).json({ error: 'Failed to fetch wiki tree' });
  }
});

// POST /wiki/folders — create folder
router.post('/wiki/folders', async (req, res) => {
  try {
    const { boardId, name, parentFolderId } = req.body as { boardId: string; name: string; parentFolderId?: string | null };

    if (!boardId || !name?.trim()) {
      return res.status(400).json({ error: 'boardId and name are required' });
    }

    // Depth enforcement: if parentFolderId provided, verify parent is level 1 (has no parent itself)
    if (parentFolderId) {
      const parent = await prisma.documentationFolder.findUnique({ where: { id: parentFolderId } });
      if (!parent) return res.status(404).json({ error: 'Parent folder not found' });
      if (parent.parentFolderId) {
        return res.status(400).json({ error: 'Maximum folder depth (2 levels) reached' });
      }
    }

    const folder = await prisma.documentationFolder.create({
      data: { boardId, name: name.trim(), parentFolderId: parentFolderId || null },
      include: {
        subfolders: true,
        files: {
          select: { id: true, boardId: true, name: true, folderId: true, createdAt: true, updatedAt: true },
        },
      },
    });

    const fsPath = await getFolderFsPath({ name: folder.name, parentFolderId: folder.parentFolderId, boardId });
    fsTry('create folder', () => fs.mkdirSync(fsPath, { recursive: true }));

    res.json(folder);
  } catch (error) {
    console.error('Error creating folder:', error);
    res.status(500).json({ error: 'Failed to create folder' });
  }
});

// PUT /wiki/folders/:id — rename folder
router.put('/wiki/folders/:id', async (req, res) => {
  try {
    const { id } = req.params as Record<string, string>;
    const { name } = req.body as { name: string };

    if (!name?.trim()) return res.status(400).json({ error: 'name is required' });

    const before = await prisma.documentationFolder.findUnique({ where: { id }, select: { name: true, parentFolderId: true, boardId: true } });
    const oldFsPath = before ? await getFolderFsPath(before) : null;

    const folder = await prisma.documentationFolder.update({
      where: { id },
      data: { name: name.trim() },
      include: {
        subfolders: {
          include: {
            files: {
              select: { id: true, boardId: true, name: true, folderId: true, createdAt: true, updatedAt: true },
            },
          },
        },
        files: {
          select: { id: true, boardId: true, name: true, folderId: true, createdAt: true, updatedAt: true },
        },
      },
    });

    const newFsPath = await getFolderFsPath({ name: folder.name, parentFolderId: folder.parentFolderId, boardId: folder.boardId });
    fsTry('rename folder', () => {
      if (oldFsPath && fs.existsSync(oldFsPath)) {
        fs.renameSync(oldFsPath, newFsPath);
      } else {
        fs.mkdirSync(newFsPath, { recursive: true });
      }
    });

    res.json(folder);
  } catch (error) {
    console.error('Error renaming folder:', error);
    res.status(500).json({ error: 'Failed to rename folder' });
  }
});

// DELETE /wiki/folders/:id — delete folder (cascades)
router.delete('/wiki/folders/:id', async (req, res) => {
  try {
    const { id } = req.params as Record<string, string>;
    const before = await prisma.documentationFolder.findUnique({ where: { id }, select: { name: true, parentFolderId: true, boardId: true } });
    const fsPath = before ? await getFolderFsPath(before) : null;
    await prisma.documentationFolder.delete({ where: { id } });
    if (fsPath) fsTry('delete folder', () => fs.rmSync(fsPath, { recursive: true, force: true }));
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting folder:', error);
    res.status(500).json({ error: 'Failed to delete folder' });
  }
});

// PUT /wiki/folders/:id/move — reparent folder
router.put('/wiki/folders/:id/move', async (req, res) => {
  try {
    const { id } = req.params as Record<string, string>;
    const { parentFolderId } = req.body as { parentFolderId: string | null };

    if (parentFolderId) {
      if (parentFolderId === id) {
        return res.status(400).json({ error: 'Cannot move folder into itself' });
      }
      const parent = await prisma.documentationFolder.findUnique({ where: { id: parentFolderId } });
      if (!parent) return res.status(404).json({ error: 'Parent folder not found' });
      if (parent.parentFolderId) {
        return res.status(400).json({ error: 'Maximum folder depth (2 levels) reached' });
      }
      // Reject if the folder being moved has subfolders — they would become level-3
      const subfolderCount = await prisma.documentationFolder.count({ where: { parentFolderId: id } });
      if (subfolderCount > 0) {
        return res.status(400).json({ error: 'Cannot move a folder that has subfolders into another folder' });
      }
    }

    const before = await prisma.documentationFolder.findUnique({ where: { id }, select: { name: true, parentFolderId: true, boardId: true } });
    const oldFsPath = before ? await getFolderFsPath(before) : null;

    const folder = await prisma.documentationFolder.update({
      where: { id },
      data: { parentFolderId: parentFolderId || null },
      include: {
        subfolders: {
          include: {
            files: {
              select: { id: true, boardId: true, name: true, folderId: true, createdAt: true, updatedAt: true },
            },
          },
        },
        files: {
          select: { id: true, boardId: true, name: true, folderId: true, createdAt: true, updatedAt: true },
        },
      },
    });

    const newFsPath = await getFolderFsPath({ name: folder.name, parentFolderId: folder.parentFolderId, boardId: folder.boardId });
    fsTry('move folder', () => {
      if (oldFsPath && fs.existsSync(oldFsPath)) {
        fs.mkdirSync(path.dirname(newFsPath), { recursive: true });
        fs.renameSync(oldFsPath, newFsPath);
      } else {
        fs.mkdirSync(newFsPath, { recursive: true });
      }
    });

    res.json(folder);
  } catch (error) {
    console.error('Error moving folder:', error);
    res.status(500).json({ error: 'Failed to move folder' });
  }
});

// POST /wiki/files — create file
router.post('/wiki/files', async (req, res) => {
  try {
    const { boardId, name, folderId, content } = req.body as { boardId: string; name: string; folderId?: string | null; content?: string };

    if (!boardId || !name?.trim()) {
      return res.status(400).json({ error: 'boardId and name are required' });
    }

    const file = await prisma.documentationFile.create({
      data: { boardId, name: name.trim(), folderId: folderId || null, content: content || '' },
    });

    const fsPath = await getFileFsPath({ name: file.name, folderId: file.folderId, boardId: file.boardId });
    fsTry('create file', () => {
      fs.mkdirSync(path.dirname(fsPath), { recursive: true });
      fs.writeFileSync(fsPath, content || '', 'utf-8');
    });

    capture('documentation_file_created');
    res.json(file);
  } catch (error) {
    console.error('Error creating file:', error);
    res.status(500).json({ error: 'Failed to create file' });
  }
});

// GET /wiki/files/:id — get file with content
router.get('/wiki/files/:id', async (req, res) => {
  try {
    const { id } = req.params as Record<string, string>;
    const file = await prisma.documentationFile.findUnique({
      where: { id },
      include: {
        folder: {
          select: {
            id: true, name: true, parentFolderId: true,
            parentFolder: { select: { name: true } },
          },
        },
      },
    });
    if (!file) return res.status(404).json({ error: 'File not found' });
    res.json(file);
  } catch (error) {
    console.error('Error fetching file:', error);
    res.status(500).json({ error: 'Failed to fetch file' });
  }
});

// PUT /wiki/files/:id — update file
router.put('/wiki/files/:id', async (req, res) => {
  try {
    const { id } = req.params as Record<string, string>;
    const { name, content } = req.body as { name?: string; content?: string };

    const before = await prisma.documentationFile.findUnique({ where: { id }, select: { name: true, folderId: true, boardId: true } });
    const oldFsPath = before ? await getFileFsPath(before) : null;

    const data: { name?: string; content?: string } = {};
    if (name !== undefined) data.name = name.trim();
    if (content !== undefined) data.content = content;

    const file = await prisma.documentationFile.update({ where: { id }, data });

    const newFsPath = await getFileFsPath({ name: file.name, folderId: file.folderId, boardId: file.boardId });
    fsTry('update file', () => {
      fs.mkdirSync(path.dirname(newFsPath), { recursive: true });
      if (name !== undefined && oldFsPath && oldFsPath !== newFsPath && fs.existsSync(oldFsPath)) {
        fs.renameSync(oldFsPath, newFsPath);
      }
      if (content !== undefined) {
        fs.writeFileSync(newFsPath, content, 'utf-8');
      }
    });

    res.json(file);
  } catch (error) {
    console.error('Error updating file:', error);
    res.status(500).json({ error: 'Failed to update file' });
  }
});

// DELETE /wiki/files/:id — delete file
router.delete('/wiki/files/:id', async (req, res) => {
  try {
    const { id } = req.params as Record<string, string>;
    const before = await prisma.documentationFile.findUnique({ where: { id }, select: { name: true, folderId: true, boardId: true } });
    const fsPath = before ? await getFileFsPath(before) : null;
    await prisma.documentationFile.delete({ where: { id } });
    if (fsPath) fsTry('delete file', () => { if (fs.existsSync(fsPath)) fs.unlinkSync(fsPath); });
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting file:', error);
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

// PUT /wiki/files/:id/move — move file to different folder
router.put('/wiki/files/:id/move', async (req, res) => {
  try {
    const { id } = req.params as Record<string, string>;
    const { folderId } = req.body as { folderId: string | null };

    const before = await prisma.documentationFile.findUnique({ where: { id }, select: { name: true, folderId: true, boardId: true } });
    const oldFsPath = before ? await getFileFsPath(before) : null;

    const file = await prisma.documentationFile.update({
      where: { id },
      data: { folderId: folderId || null },
    });

    const newFsPath = await getFileFsPath({ name: file.name, folderId: file.folderId, boardId: file.boardId });
    fsTry('move file', () => {
      if (oldFsPath && fs.existsSync(oldFsPath)) {
        fs.mkdirSync(path.dirname(newFsPath), { recursive: true });
        fs.renameSync(oldFsPath, newFsPath);
      }
    });

    res.json(file);
  } catch (error) {
    console.error('Error moving file:', error);
    res.status(500).json({ error: 'Failed to move file' });
  }
});

export default router;
