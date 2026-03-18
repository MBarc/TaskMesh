import { Router } from 'express';
import { ConnectorHandlers, ConnectorContext } from '../framework/types.js';
import { generateFieldFromTask } from '../framework/aiFieldGenerator.js';

/** Convert plain text to HTML for ADO rich-text fields */
function textToHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((block) => {
      const trimmed = block.trim();
      if (!trimmed) return '';
      const lines = trimmed.split('\n');
      const isBulletList = lines.every((l) => /^\s*[-*]\s/.test(l));
      const isNumberedList = lines.every((l) => /^\s*\d+[.)]\s/.test(l));
      if (isBulletList) {
        const items = lines.map((l) => `<li>${l.replace(/^\s*[-*]\s+/, '')}</li>`).join('');
        return `<ul>${items}</ul>`;
      }
      if (isNumberedList) {
        const items = lines.map((l) => `<li>${l.replace(/^\s*\d+[.)]\s+/, '')}</li>`).join('');
        return `<ol>${items}</ol>`;
      }
      return `<p>${trimmed.replace(/\n/g, '<br>')}</p>`;
    })
    .filter(Boolean)
    .join('');
}

/** Build Basic auth header from PAT */
function authHeader(pat: string): string {
  return 'Basic ' + Buffer.from(':' + pat).toString('base64');
}

/** ADO effort field path varies by work item type */
const EFFORT_FIELD_MAP: Record<string, string> = {
  'Epic': 'Microsoft.VSTS.Scheduling.StoryPoints',
  'Feature': 'Microsoft.VSTS.Scheduling.StoryPoints',
  'User Story': 'Microsoft.VSTS.Scheduling.StoryPoints',
  'Bug': 'Microsoft.VSTS.Scheduling.StoryPoints',
  'Product Backlog Item': 'Microsoft.VSTS.Scheduling.Effort',
  'Issue': 'Microsoft.VSTS.Scheduling.Effort',
  'Task': 'Microsoft.VSTS.Scheduling.RemainingWork',
};

/** Shared WIQL batch-fetch for work item details */
async function fetchWorkItemDetails(
  orgUrl: string,
  auth: string,
  ids: number[],
): Promise<{ id: number; title: string; workItemType: string; state: string }[]> {
  if (ids.length === 0) return [];

  const detailsResponse = await fetch(
    `${orgUrl}/_apis/wit/workitems?ids=${ids.join(',')}&fields=System.Id,System.Title,System.WorkItemType,System.State&api-version=7.1`,
    { headers: { 'Authorization': auth } },
  );

  if (!detailsResponse.ok) {
    const errorText = await detailsResponse.text();
    throw new Error(`ADO details error (${detailsResponse.status}): ${errorText.slice(0, 300)}`);
  }

  const result = await detailsResponse.json() as {
    value: {
      id: number;
      fields: { 'System.Title': string; 'System.WorkItemType': string; 'System.State': string };
    }[];
  };

  return result.value.map((wi) => ({
    id: wi.id,
    title: wi.fields['System.Title'],
    workItemType: wi.fields['System.WorkItemType'],
    state: wi.fields['System.State'],
  }));
}

const handlers: ConnectorHandlers = {

  // ── Test Connection ──
  async testConnection(ctx) {
    const settings = await ctx.getSettings();
    if (!settings) {
      return { success: false, message: 'ADO settings not configured' };
    }

    const auth = authHeader(settings.pat);
    const response = await fetch(
      `${settings.organizationUrl}/${settings.projectName}/_apis/projects?api-version=7.1`,
      { headers: { 'Authorization': auth } },
    );

    if (response.ok) {
      return { success: true, message: 'Connection successful' };
    }
    const text = await response.text();
    return { success: false, message: `Connection failed (${response.status}): ${text.slice(0, 200)}` };
  },

  // ── Search (assigned work items) ──
  async search(ctx, query) {
    const settings = await ctx.getSettings();
    if (!settings) throw new Error('ADO settings not configured');
    if (!settings.assignedTo) throw new Error('Assigned To is not configured in ADO settings');

    const auth = authHeader(settings.pat);
    const sanitizedAssignedTo = settings.assignedTo.replace(/'/g, "''");

    let wiql = `SELECT [System.Id] FROM WorkItems WHERE [System.AssignedTo] = '${sanitizedAssignedTo}' AND [System.TeamProject] = '${settings.projectName}' AND [System.State] NOT IN ('Done', 'Closed', 'Removed')`;

    if (query?.trim()) {
      const sanitizedQuery = query.replace(/'/g, "''");
      wiql += ` AND [System.Title] CONTAINS '${sanitizedQuery}'`;
    }

    wiql += ` ORDER BY [System.ChangedDate] DESC`;

    const wiqlResponse = await fetch(
      `${settings.organizationUrl}/${settings.projectName}/_apis/wit/wiql?api-version=7.1&$top=50`,
      {
        method: 'POST',
        headers: { 'Authorization': auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: wiql }),
      },
    );

    if (!wiqlResponse.ok) {
      const errorText = await wiqlResponse.text();
      throw new Error(`ADO WIQL error (${wiqlResponse.status}): ${errorText.slice(0, 300)}`);
    }

    const wiqlResult = await wiqlResponse.json() as { workItems: { id: number }[] };
    const ids = wiqlResult.workItems?.map((wi: { id: number }) => wi.id) || [];

    return fetchWorkItemDetails(settings.organizationUrl, auth, ids);
  },

  // ── Import Work Items as Tasks ──
  async import(ctx, boardId, items) {
    const settings = await ctx.getSettings();
    if (!settings) throw new Error('ADO settings not configured');

    const { prisma } = ctx;

    // Ensure columns
    const adoColumn = await ctx.ensureColumn(boardId, 'ADO_PUSH');
    const itemNoColumn = await ctx.ensureColumn(boardId, 'ITEM_NO');
    const sourceColumn = await ctx.ensureColumn(boardId, 'SOURCE');

    const textColumn = await prisma.column.findFirst({
      where: { boardId, type: 'TEXT' },
      orderBy: { order: 'asc' },
    });

    const maxTaskOrder = await prisma.task.aggregate({
      where: { boardId },
      _max: { order: true },
    });
    let nextOrder = (maxTaskOrder._max?.order ?? -1) + 1;

    const createdTasks = [];

    for (const wi of items) {
      const cellData: { columnId: string; value: string }[] = [];

      if (textColumn) {
        cellData.push({
          columnId: textColumn.id,
          value: `${wi.workItemType} #${wi.id}: ${wi.title}`,
        });
      }

      cellData.push({
        columnId: adoColumn.id,
        value: JSON.stringify({
          workItemId: wi.id,
          workItemUrl: `${settings.organizationUrl}/${settings.projectName}/_workitems/edit/${wi.id}`,
        }),
      });

      cellData.push({
        columnId: itemNoColumn.id,
        value: JSON.stringify({
          ticketNumber: `#${wi.id}`,
          ticketUrl: `${settings.organizationUrl}/${settings.projectName}/_workitems/edit/${wi.id}`,
        }),
      });

      cellData.push({
        columnId: sourceColumn.id,
        value: JSON.stringify({
          platform: 'ado',
          extractionId: '',
          taskTitle: wi.title,
        }),
      });

      const task = await prisma.task.create({
        data: {
          boardId,
          order: nextOrder++,
          cellValues: { create: cellData },
        },
        include: { cellValues: true },
      });

      createdTasks.push(task);
    }

    const fullAdoColumn = await prisma.column.findUnique({
      where: { id: adoColumn.id },
      include: { options: { orderBy: { order: 'asc' } } },
    });

    const fullItemNoColumn = await prisma.column.findUnique({
      where: { id: itemNoColumn.id },
      include: { options: { orderBy: { order: 'asc' } } },
    });

    return { columns: [fullAdoColumn, fullItemNoColumn], tasks: createdTasks };
  },

  // ── Push Work Item ──
  async push(ctx, data) {
    const settings = await ctx.getSettings();
    if (!settings) throw new Error('ADO settings not configured');

    const { prisma } = ctx;
    const {
      taskId, columnId, title, workItemType, parentWorkItemId,
      description, acceptanceCriteria, reproSteps,
      priority, effort, severity, tags,
    } = data;

    if (!taskId || !columnId || !title || !workItemType || !parentWorkItemId) {
      throw new Error('taskId, columnId, title, workItemType, and parentWorkItemId are required');
    }

    const auth = authHeader(settings.pat);

    // Build JSON Patch document
    const patchDoc: { op: string; path: string; value: any; from?: null }[] = [
      { op: 'add', path: '/fields/System.Title', value: title },
    ];

    if (description) {
      patchDoc.push({ op: 'add', path: '/fields/System.Description', value: textToHtml(description) });
    }
    if (acceptanceCriteria) {
      patchDoc.push({ op: 'add', path: '/fields/Microsoft.VSTS.Common.AcceptanceCriteria', value: textToHtml(acceptanceCriteria) });
    }
    if (reproSteps) {
      patchDoc.push({ op: 'add', path: '/fields/Microsoft.VSTS.TCM.ReproSteps', value: textToHtml(reproSteps) });
    }
    if (settings.assignedTo) {
      patchDoc.push({ op: 'add', path: '/fields/System.AssignedTo', value: settings.assignedTo });
    }
    if (priority != null) {
      patchDoc.push({ op: 'add', path: '/fields/Microsoft.VSTS.Common.Priority', value: priority });
    }
    if (effort != null) {
      const effortField = EFFORT_FIELD_MAP[workItemType] || 'Microsoft.VSTS.Scheduling.StoryPoints';
      patchDoc.push({ op: 'add', path: `/fields/${effortField}`, value: effort });
    }
    if (severity) {
      patchDoc.push({ op: 'add', path: '/fields/Microsoft.VSTS.Common.Severity', value: severity });
    }
    if (tags) {
      patchDoc.push({ op: 'add', path: '/fields/System.Tags', value: tags });
    }
    if (parentWorkItemId) {
      patchDoc.push({
        op: 'add',
        path: '/relations/-',
        value: {
          rel: 'System.LinkTypes.Hierarchy-Reverse',
          url: `${settings.organizationUrl}/_apis/wit/workItems/${parentWorkItemId}`,
        },
        from: null,
      });
    }

    const adoResponse = await fetch(
      `${settings.organizationUrl}/${settings.projectName}/_apis/wit/workitems/$${workItemType}?api-version=7.1`,
      {
        method: 'POST',
        headers: {
          'Authorization': auth,
          'Content-Type': 'application/json-patch+json',
        },
        body: JSON.stringify(patchDoc),
      },
    );

    if (!adoResponse.ok) {
      const errorText = await adoResponse.text();
      throw new Error(`ADO API error (${adoResponse.status}): ${errorText.slice(0, 300)}`);
    }

    const workItem = await adoResponse.json() as { id: number; _links?: { html?: { href?: string } } };
    const workItemId = workItem.id;
    const workItemUrl = workItem._links?.html?.href
      || `${settings.organizationUrl}/${settings.projectName}/_workitems/edit/${workItemId}`;

    await prisma.cellValue.upsert({
      where: { taskId_columnId: { taskId, columnId } },
      update: { value: JSON.stringify({ workItemId, workItemUrl }) },
      create: { taskId, columnId, value: JSON.stringify({ workItemId, workItemUrl }) },
    });

    // Also populate ITEM_NO column if it exists
    const boardColumn = await prisma.column.findUnique({ where: { id: columnId } });
    if (boardColumn) {
      const itemNoColumn = await prisma.column.findFirst({
        where: { boardId: boardColumn.boardId, type: 'ITEM_NO' },
      });
      if (itemNoColumn) {
        const itemNoCellValue = JSON.stringify({
          ticketNumber: `#${workItemId}`,
          ticketUrl: workItemUrl,
        });
        await prisma.cellValue.upsert({
          where: { taskId_columnId: { taskId, columnId: itemNoColumn.id } },
          update: { value: itemNoCellValue },
          create: { taskId, columnId: itemNoColumn.id, value: itemNoCellValue },
        });
      }
    }

    return prisma.task.findUnique({
      where: { id: taskId },
      include: { cellValues: true },
    });
  },

  // ── AI Field Generation ──
  async generateField(ctx, data) {
    return generateFieldFromTask(ctx.prisma, {
      taskId: data.taskId,
      fieldName: data.fieldName,
      workItemType: data.workItemType || 'User Story',
      aiInstructions: data.aiInstructions,
      title: data.title,
    });
  },

  // ── Custom Routes ──
  registerCustomRoutes(router: Router, ctx: ConnectorContext) {
    // Backward-compat route aliases that the client currently calls
    router.get('/search-work-items', async (req, res) => {
      try {
        const query = req.query.query as string;
        if (!query) return res.json([]);

        const settings = await ctx.getSettings();
        if (!settings) return res.status(400).json({ error: 'ADO settings not configured' });

        const auth = authHeader(settings.pat);
        const sanitizedQuery = query.replace(/'/g, "''");
        const wiqlBody = {
          query: `SELECT [System.Id] FROM WorkItems WHERE [System.Title] CONTAINS '${sanitizedQuery}' AND [System.TeamProject] = '${settings.projectName}' ORDER BY [System.ChangedDate] DESC`,
          $top: 20,
        };

        const wiqlResponse = await fetch(
          `${settings.organizationUrl}/${settings.projectName}/_apis/wit/wiql?api-version=7.1&$top=20`,
          {
            method: 'POST',
            headers: { 'Authorization': auth, 'Content-Type': 'application/json' },
            body: JSON.stringify(wiqlBody),
          },
        );

        if (!wiqlResponse.ok) {
          const errorText = await wiqlResponse.text();
          return res.status(wiqlResponse.status).json({
            error: `ADO WIQL error (${wiqlResponse.status}): ${errorText.slice(0, 300)}`,
          });
        }

        const wiqlResult = await wiqlResponse.json() as { workItems: { id: number }[] };
        const ids = wiqlResult.workItems?.map((wi: { id: number }) => wi.id) || [];

        const results = await fetchWorkItemDetails(settings.organizationUrl, auth, ids);
        res.json(results);
      } catch (error: any) {
        console.error('Error searching ADO work items:', error);
        res.status(500).json({ error: `Failed to search work items: ${error.message}` });
      }
    });

    router.get('/search-work-items-assigned', async (req, res) => {
      try {
        const query = (req.query.query as string) || '';
        const results = await handlers.search!(ctx, query);
        res.json(results);
      } catch (error: any) {
        console.error('Error searching assigned ADO work items:', error);
        res.status(500).json({ error: error.message });
      }
    });

    router.post('/import-work-items', async (req, res) => {
      try {
        const { boardId, workItems } = req.body;
        if (!boardId || !Array.isArray(workItems) || workItems.length === 0) {
          return res.status(400).json({ error: 'boardId and workItems array are required' });
        }
        const result = await handlers.import!(ctx, boardId, workItems);
        res.json({
          column: result.columns[0],
          itemNoColumn: result.columns[1] || null,
          tasks: result.tasks,
        });
      } catch (error: any) {
        console.error('Error importing ADO work items:', error);
        res.status(500).json({ error: error.message });
      }
    });

    router.post('/push-work-item', async (req, res) => {
      try {
        const result = await handlers.push!(ctx, req.body);
        res.json(result);
      } catch (error: any) {
        console.error('Error pushing to ADO:', error);
        res.status(500).json({ error: error.message });
      }
    });

    router.get('/tags', async (req, res) => {
      try {
        const query = (req.query.query as string) || '';

        const settings = await ctx.getSettings();
        if (!settings) return res.status(400).json({ error: 'ADO settings not configured' });

        const auth = authHeader(settings.pat);
        const response = await fetch(
          `${settings.organizationUrl}/${settings.projectName}/_apis/wit/tags?api-version=7.1`,
          { headers: { 'Authorization': auth } },
        );

        if (!response.ok) {
          const errorText = await response.text();
          return res.status(response.status).json({
            error: `ADO tags error (${response.status}): ${errorText.slice(0, 300)}`,
          });
        }

        const result = await response.json() as { value: { name: string }[] };
        const allTags = result.value || [];

        const filtered = query
          ? allTags.filter((t) => t.name.toLowerCase().startsWith(query.toLowerCase()))
          : allTags;

        res.json(filtered.map((t) => ({ name: t.name })));
      } catch (error: any) {
        console.error('Error fetching ADO tags:', error);
        res.status(500).json({ error: `Failed to fetch tags: ${error.message}` });
      }
    });
  },
};

export default handlers;
