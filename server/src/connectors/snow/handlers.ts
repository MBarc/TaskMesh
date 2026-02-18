import { Router } from 'express';
import { ConnectorHandlers, ConnectorContext } from '../framework/types.js';
import { generateFieldFromTask } from '../framework/aiFieldGenerator.js';

const handlers: ConnectorHandlers = {

  // ── Test Connection ──
  async testConnection(ctx) {
    const settings = await ctx.getSettings();
    if (!settings) {
      return { success: false, message: 'ServiceNow settings not configured' };
    }

    const response = await fetch(
      `${settings.instanceUrl}/api/now/table/incident?sysparm_limit=1`,
      {
        headers: {
          'Authorization': `Bearer ${settings.apiKey}`,
          'Accept': 'application/json',
        },
      },
    );

    if (response.ok) {
      return { success: true, message: 'Connection successful' };
    }
    const text = await response.text();
    return { success: false, message: `Connection failed (${response.status}): ${text.slice(0, 200)}` };
  },

  // ── Search Incidents ──
  async search(ctx, query) {
    const settings = await ctx.getSettings();
    if (!settings) throw new Error('ServiceNow settings not configured');
    if (!settings.assignedTo) throw new Error('Assigned To must be configured in ServiceNow settings');

    let sysparmQuery = `assigned_to.user_name=${settings.assignedTo}^stateNOT IN7,8`;

    if (query?.trim()) {
      sysparmQuery += `^short_descriptionLIKE${query}^ORnumberLIKE${query}`;
    }

    sysparmQuery += `^ORDERBYpriority^ORDERBYDESCsys_updated_on`;

    const url = `${settings.instanceUrl}/api/now/table/incident?sysparm_query=${encodeURIComponent(sysparmQuery)}&sysparm_limit=100&sysparm_fields=sys_id,number,short_description,state,priority,assigned_to&sysparm_display_value=true`;

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${settings.apiKey}`,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`ServiceNow API error (${response.status}): ${errorText.slice(0, 300)}`);
    }

    const data = await response.json() as {
      result: {
        sys_id: string;
        number: string;
        short_description: string;
        state: string;
        priority: string;
        assigned_to: string;
      }[];
    };

    return (data.result || []).map((inc) => ({
      sysId: inc.sys_id,
      number: inc.number,
      shortDescription: inc.short_description,
      state: inc.state,
      priority: inc.priority,
      assignedTo: inc.assigned_to || '',
    }));
  },

  // ── Import Incidents as Tasks ──
  async import(ctx, boardId, items) {
    const settings = await ctx.getSettings();
    if (!settings) throw new Error('ServiceNow settings not configured');

    const { prisma } = ctx;

    // Ensure columns
    const snowColumn = await ctx.ensureColumn(boardId, 'ITEM_NO');
    const sourceColumn = await ctx.ensureColumn(boardId, 'SOURCE');

    const textColumn = await prisma.column.findFirst({
      where: { boardId, type: 'TEXT' },
      orderBy: { order: 'asc' },
    });

    // Get max task order
    const maxTaskOrder = await prisma.task.aggregate({
      where: { boardId },
      _max: { order: true },
    });
    let nextOrder = (maxTaskOrder._max.order ?? -1) + 1;

    const createdTasks = [];

    for (const incident of items) {
      const cellData: { columnId: string; value: string }[] = [];

      if (textColumn) {
        cellData.push({
          columnId: textColumn.id,
          value: `${incident.number}: ${incident.shortDescription}`,
        });
      }

      cellData.push({
        columnId: snowColumn.id,
        value: JSON.stringify({
          sysId: incident.sysId,
          ticketNumber: incident.number,
          ticketUrl: `${settings.instanceUrl}/incident.do?sys_id=${incident.sysId}`,
          closed: false,
        }),
      });

      cellData.push({
        columnId: sourceColumn.id,
        value: JSON.stringify({
          platform: 'servicenow',
          extractionId: '',
          taskTitle: incident.shortDescription,
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

    const fullSnowColumn = await prisma.column.findUnique({
      where: { id: snowColumn.id },
      include: { options: { orderBy: { order: 'asc' } } },
    });

    return { columns: [fullSnowColumn], tasks: createdTasks };
  },

  // ── Push Incident ──
  async push(ctx, data) {
    const settings = await ctx.getSettings();
    if (!settings) throw new Error('ServiceNow settings not configured');

    const { prisma } = ctx;
    const {
      taskId, columnId, caller_id, category, subcategory,
      urgency, impact, assignment_group, assigned_to,
      short_description, description, contact_type, cmdb_ci,
    } = data;

    if (!taskId || !columnId || !short_description) {
      throw new Error('taskId, columnId, and short_description are required');
    }

    const incidentPayload: Record<string, string> = { short_description };
    if (description) incidentPayload.description = description;
    if (caller_id) incidentPayload.caller_id = caller_id;
    if (category) incidentPayload.category = category;
    if (subcategory) incidentPayload.subcategory = subcategory;
    if (urgency) incidentPayload.urgency = urgency;
    if (impact) incidentPayload.impact = impact;
    if (assignment_group) incidentPayload.assignment_group = assignment_group;
    if (assigned_to) incidentPayload.assigned_to = assigned_to;
    if (contact_type) incidentPayload.contact_type = contact_type;
    if (cmdb_ci) incidentPayload.cmdb_ci = cmdb_ci;

    const createResponse = await fetch(
      `${settings.instanceUrl}/api/now/table/incident`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${settings.apiKey}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(incidentPayload),
      },
    );

    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      throw new Error(`ServiceNow API error (${createResponse.status}): ${errorText.slice(0, 300)}`);
    }

    const createData = await createResponse.json() as {
      result: { sys_id: string; number: string };
    };

    const sysId = createData.result.sys_id;
    const ticketNumber = createData.result.number;
    const ticketUrl = `${settings.instanceUrl}/incident.do?sys_id=${sysId}`;

    await prisma.cellValue.upsert({
      where: { taskId_columnId: { taskId, columnId } },
      update: { value: JSON.stringify({ sysId, ticketNumber, ticketUrl }) },
      create: { taskId, columnId, value: JSON.stringify({ sysId, ticketNumber, ticketUrl }) },
    });

    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: { cellValues: true },
    });

    return task;
  },

  // ── AI Field Generation ──
  async generateField(ctx, data) {
    return generateFieldFromTask(ctx.prisma, {
      taskId: data.taskId,
      fieldName: data.fieldName,
      workItemType: data.workItemType || 'Incident',
      aiInstructions: data.aiInstructions,
      title: data.title,
    });
  },

  // ── Custom Routes (close-incident, add-comment, get-incident) ──
  registerCustomRoutes(router: Router, ctx: ConnectorContext) {
    const { prisma } = ctx;

    // Keep existing route paths for backward compat
    router.get('/search-incidents', async (req, res) => {
      try {
        const query = (req.query.query as string) || '';
        const results = await handlers.search!(ctx, query);
        res.json(results);
      } catch (error: any) {
        console.error('Error searching ServiceNow incidents:', error);
        res.status(500).json({ error: error.message });
      }
    });

    router.post('/import-incidents', async (req, res) => {
      try {
        const { boardId, incidents } = req.body;
        if (!boardId || !Array.isArray(incidents) || incidents.length === 0) {
          return res.status(400).json({ error: 'boardId and incidents array are required' });
        }
        const result = await handlers.import!(ctx, boardId, incidents);
        res.json({ column: result.columns[0], tasks: result.tasks });
      } catch (error: any) {
        console.error('Error importing ServiceNow incidents:', error);
        res.status(500).json({ error: error.message });
      }
    });

    router.post('/push-incident', async (req, res) => {
      try {
        const result = await handlers.push!(ctx, req.body);
        res.json(result);
      } catch (error: any) {
        console.error('Error pushing incident to ServiceNow:', error);
        res.status(500).json({ error: error.message });
      }
    });

    router.post('/close-incident', async (req, res) => {
      try {
        const { taskId, columnId, sysId } = req.body;
        if (!taskId || !columnId || !sysId) {
          return res.status(400).json({ error: 'taskId, columnId, and sysId are required' });
        }

        const settings = await ctx.getSettings();
        if (!settings) {
          return res.status(400).json({ error: 'ServiceNow settings not configured' });
        }

        const patchResponse = await fetch(
          `${settings.instanceUrl}/api/now/table/incident/${sysId}`,
          {
            method: 'PATCH',
            headers: {
              'Authorization': `Bearer ${settings.apiKey}`,
              'Content-Type': 'application/json',
              'Accept': 'application/json',
            },
            body: JSON.stringify({ state: '7' }),
          },
        );

        if (!patchResponse.ok) {
          const errorText = await patchResponse.text();
          return res.status(patchResponse.status).json({
            error: `ServiceNow API error (${patchResponse.status}): ${errorText.slice(0, 300)}`,
          });
        }

        const cellValue = await prisma.cellValue.findUnique({
          where: { taskId_columnId: { taskId, columnId } },
        });

        if (cellValue) {
          const parsed = JSON.parse(cellValue.value);
          parsed.closed = true;
          await prisma.cellValue.update({
            where: { id: cellValue.id },
            data: { value: JSON.stringify(parsed) },
          });
        }

        const task = await prisma.task.findUnique({
          where: { id: taskId },
          include: { cellValues: true },
        });

        res.json(task);
      } catch (error: any) {
        console.error('Error closing ServiceNow incident:', error);
        res.status(500).json({ error: `Failed to close incident: ${error.message}` });
      }
    });

    router.post('/add-comment', async (req, res) => {
      try {
        const { sysId, comment } = req.body;
        if (!sysId || !comment) {
          return res.status(400).json({ error: 'sysId and comment are required' });
        }

        const settings = await ctx.getSettings();
        if (!settings) {
          return res.status(400).json({ error: 'ServiceNow settings not configured' });
        }

        const patchResponse = await fetch(
          `${settings.instanceUrl}/api/now/table/incident/${sysId}`,
          {
            method: 'PATCH',
            headers: {
              'Authorization': `Bearer ${settings.apiKey}`,
              'Content-Type': 'application/json',
              'Accept': 'application/json',
            },
            body: JSON.stringify({ comments: comment }),
          },
        );

        if (!patchResponse.ok) {
          const errorText = await patchResponse.text();
          return res.status(patchResponse.status).json({
            error: `ServiceNow API error (${patchResponse.status}): ${errorText.slice(0, 300)}`,
          });
        }

        res.json({ success: true });
      } catch (error: any) {
        console.error('Error adding comment to ServiceNow incident:', error);
        res.status(500).json({ error: `Failed to add comment: ${error.message}` });
      }
    });

    router.post('/get-incident', async (req, res) => {
      try {
        const { sysId } = req.body;
        if (!sysId) {
          return res.status(400).json({ error: 'sysId is required' });
        }

        const settings = await ctx.getSettings();
        if (!settings) {
          return res.status(400).json({ error: 'ServiceNow settings not configured' });
        }

        const response = await fetch(
          `${settings.instanceUrl}/api/now/table/incident/${sysId}?sysparm_display_value=true`,
          {
            headers: {
              'Authorization': `Bearer ${settings.apiKey}`,
              'Accept': 'application/json',
            },
          },
        );

        if (!response.ok) {
          const errorText = await response.text();
          return res.status(response.status).json({
            error: `ServiceNow API error (${response.status}): ${errorText.slice(0, 300)}`,
          });
        }

        const data = await response.json() as { result: Record<string, string> };
        const inc = data.result;

        res.json({
          sysId: inc.sys_id,
          number: inc.number,
          shortDescription: inc.short_description || '',
          description: inc.description || '',
          callerId: inc.caller_id || '',
          category: inc.category || '',
          subcategory: inc.subcategory || '',
          urgency: inc.urgency || '',
          impact: inc.impact || '',
          priority: inc.priority || '',
          assignmentGroup: inc.assignment_group || '',
          assignedTo: inc.assigned_to || '',
          contactType: inc.contact_type || '',
          configurationItem: inc.cmdb_ci || '',
          state: inc.state || '',
        });
      } catch (error: any) {
        console.error('Error fetching ServiceNow incident:', error);
        res.status(500).json({ error: `Failed to fetch incident: ${error.message}` });
      }
    });
  },
};

export default handlers;
