import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { ConnectorHandlers, ConnectorContext } from '../framework/types.js';
import { prisma } from '../../lib/prisma.js';

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

const CONTAINER_BASE_PATH = '/documentation';
const getLocalPath = () => process.env.DOCUMENTATION_PATH || '';

const handlers: ConnectorHandlers = {

  // ── All routes are custom for documentation ──
  registerCustomRoutes(router: Router, ctx: ConnectorContext) {
    // GET /settings
    router.get('/settings', async (req, res) => {
      try {
        const settings = await prisma.documentationSettings.findUnique({
          where: { id: 'singleton' },
        });

        res.json({
          subfolder: settings?.subfolder || '',
          localPath: getLocalPath(),
          templates: settings?.templates || null,
          customVariables: settings?.customVariables || null,
        });
      } catch (error) {
        console.error('Error fetching documentation settings:', error);
        res.status(500).json({ error: 'Failed to fetch documentation settings' });
      }
    });

    // PUT /settings
    router.put('/settings', async (req, res) => {
      try {
        const { subfolder, templates, customVariables } = req.body;

        const settings = await prisma.documentationSettings.upsert({
          where: { id: 'singleton' },
          update: {
            subfolder: subfolder || '',
            templates: templates ?? undefined,
            customVariables: customVariables ?? undefined,
          },
          create: {
            id: 'singleton',
            subfolder: subfolder || '',
            templates: templates ?? undefined,
            customVariables: customVariables ?? undefined,
          },
        });

        res.json({
          subfolder: settings.subfolder,
          localPath: getLocalPath(),
          templates: settings.templates,
          customVariables: settings.customVariables,
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

        const settings = await prisma.documentationSettings.findUnique({
          where: { id: 'singleton' },
        });

        const safeName = fileName.replace(/[<>:"/\\|?*]/g, '_');
        const fullFileName = safeName.endsWith('.md') ? safeName : `${safeName}.md`;
        const subfolder = settings?.subfolder || '';
        const dirPath = subfolder
          ? path.join(CONTAINER_BASE_PATH, subfolder)
          : CONTAINER_BASE_PATH;
        const filePath = path.join(dirPath, fullFileName);

        fs.mkdirSync(dirPath, { recursive: true });
        fs.writeFileSync(filePath, content, 'utf-8');

        const cellValue = JSON.stringify({ filePath, fileName: fullFileName });
        const existing = await prisma.cellValue.findUnique({
          where: { taskId_columnId: { taskId, columnId } },
        });

        if (existing) {
          await prisma.cellValue.update({
            where: { id: existing.id },
            data: { value: cellValue },
          });
        } else {
          await prisma.cellValue.create({
            data: { taskId, columnId, value: cellValue },
          });
        }

        await prisma.documentDraft.updateMany({
          where: { taskId, boardId },
          data: { status: 'submitted' },
        });

        const task = await prisma.task.findUnique({
          where: { id: taskId },
          include: { cellValues: true },
        });

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
        const { taskId } = req.params;
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
        const existingCustomVars = (existingSettings?.customVariables as any[] || []);

        const importedTemplates: any[] = [];
        const newCustomVars: { name: string; description: string }[] = [];

        for (const raw of rawTemplates) {
          const { frontmatter, content } = parseTemplateFrontmatter(raw.content);

          const template = {
            id: `tpl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            name: frontmatter.name || raw.fileName.replace(/\.md$/, ''),
            content,
            namingConvention: frontmatter.namingConvention || '{task_name}',
            customVariables: frontmatter.variables || [],
          };

          importedTemplates.push(template);

          // Collect custom variables from frontmatter
          if (frontmatter.variables) {
            for (const v of frontmatter.variables) {
              if (v.name && v.description) {
                const alreadyExists = existingCustomVars.some(
                  (ev: any) => ev.name === v.name
                ) || newCustomVars.some((nv) => nv.name === v.name);
                if (!alreadyExists) {
                  newCustomVars.push({ name: v.name, description: v.description });
                }
              }
            }
          }
        }

        const mergedTemplates = [...existingTemplates, ...importedTemplates];
        const mergedCustomVars = [...existingCustomVars, ...newCustomVars];

        const settings = await prisma.documentationSettings.upsert({
          where: { id: 'singleton' },
          update: {
            templates: mergedTemplates,
            customVariables: mergedCustomVars,
          },
          create: {
            id: 'singleton',
            subfolder: '',
            templates: mergedTemplates,
            customVariables: mergedCustomVars,
          },
        });

        res.json({
          imported: importedTemplates.length,
          newVariables: newCustomVars.length,
          templates: settings.templates,
          customVariables: settings.customVariables,
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
        const normalizedBasePath = path.normalize(CONTAINER_BASE_PATH);

        if (!normalizedFilePath.startsWith(normalizedBasePath)) {
          return res.status(403).json({ error: 'Access denied: file is outside base path' });
        }

        if (!fs.existsSync(filePath)) {
          return res.status(404).json({ error: 'Document not found' });
        }

        const content = fs.readFileSync(filePath, 'utf-8');
        res.json({ content, filePath });
      } catch (error) {
        console.error('Error reading document:', error);
        res.status(500).json({ error: 'Failed to read document' });
      }
    });
  },
};

export default handlers;
