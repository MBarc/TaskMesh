import { Router } from 'express';
import { ConnectorHandlers, ConnectorContext } from '../framework/types.js';
import { prisma } from '../../lib/prisma.js';
import { restartEmailPoller, fetchAndClassifyEmails } from '../../lib/emailPoller.js';
import { ensureColumn } from '../framework/columnManager.js';

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://ai-service:8000';

const handlers: ConnectorHandlers = {

  // ── Test Connection (IMAP) ──
  async testConnection() {
    const activeSettings = await prisma.emailSettings.findFirst({
      where: { active: true },
    });

    if (!activeSettings) {
      return { success: false, message: 'No active email connector configured' };
    }

    const { ImapFlow } = await import('imapflow');

    const client = new ImapFlow({
      host: activeSettings.imapHost,
      port: activeSettings.imapPort,
      secure: true,
      auth: {
        user: activeSettings.username,
        pass: activeSettings.password,
      },
      logger: false,
    });

    await client.connect();
    await client.logout();

    return { success: true, message: 'IMAP connection successful' };
  },

  // ── All routes are custom for email ──
  registerCustomRoutes(router: Router, ctx: ConnectorContext) {
    // GET /settings/:provider
    router.get('/settings/:provider', async (req, res) => {
      try {
        const { provider } = req.params;

        if (provider !== 'outlook' && provider !== 'gmail') {
          return res.status(400).json({ error: 'Provider must be outlook or gmail' });
        }

        const settings = await prisma.emailSettings.findUnique({
          where: { id: provider },
        });

        if (!settings) {
          return res.json(null);
        }

        const maskedPassword = settings.password.length > 4
          ? '****' + settings.password.slice(-4)
          : '****';

        res.json({
          id: settings.id,
          provider: settings.provider,
          displayName: settings.displayName,
          emailAddress: settings.emailAddress,
          imapHost: settings.imapHost,
          imapPort: settings.imapPort,
          smtpHost: settings.smtpHost,
          smtpPort: settings.smtpPort,
          username: settings.username,
          passwordConfigured: true,
          passwordMasked: maskedPassword,
          pollingInterval: settings.pollingInterval,
          active: settings.active,
          replyTemplate: settings.replyTemplate || '',
          signature: settings.signature || '',
        });
      } catch (error) {
        console.error('Error fetching email settings:', error);
        res.status(500).json({ error: 'Failed to fetch email settings' });
      }
    });

    // PUT /settings
    router.put('/settings', async (req, res) => {
      try {
        const {
          provider, displayName, emailAddress,
          imapHost, imapPort, smtpHost, smtpPort,
          username, password, pollingInterval, active,
          replyTemplate, signature,
        } = req.body;

        if (!provider || !displayName || !emailAddress || !imapHost || !imapPort || !smtpHost || !smtpPort || !username || !password) {
          return res.status(400).json({ error: 'All connection fields are required' });
        }

        if (provider !== 'outlook' && provider !== 'gmail') {
          return res.status(400).json({ error: 'Provider must be outlook or gmail' });
        }

        if (active) {
          await prisma.emailSettings.updateMany({
            where: { id: { not: provider }, active: true },
            data: { active: false },
          });
        }

        const settings = await prisma.emailSettings.upsert({
          where: { id: provider },
          update: {
            provider, displayName, emailAddress,
            imapHost, imapPort: Number(imapPort),
            smtpHost, smtpPort: Number(smtpPort),
            username, password,
            pollingInterval: Number(pollingInterval) || 60,
            active: !!active,
            replyTemplate: replyTemplate || null,
            signature: signature || null,
          },
          create: {
            id: provider, provider, displayName, emailAddress,
            imapHost, imapPort: Number(imapPort),
            smtpHost, smtpPort: Number(smtpPort),
            username, password,
            pollingInterval: Number(pollingInterval) || 60,
            active: !!active,
            replyTemplate: replyTemplate || null,
            signature: signature || null,
          },
        });

        restartEmailPoller();

        const maskedPassword = settings.password.length > 4
          ? '****' + settings.password.slice(-4)
          : '****';

        res.json({
          id: settings.id,
          provider: settings.provider,
          displayName: settings.displayName,
          emailAddress: settings.emailAddress,
          imapHost: settings.imapHost,
          imapPort: settings.imapPort,
          smtpHost: settings.smtpHost,
          smtpPort: settings.smtpPort,
          username: settings.username,
          passwordConfigured: true,
          passwordMasked: maskedPassword,
          pollingInterval: settings.pollingInterval,
          active: settings.active,
          replyTemplate: settings.replyTemplate || '',
          signature: settings.signature || '',
        });
      } catch (error) {
        console.error('Error saving email settings:', error);
        res.status(500).json({ error: 'Failed to save email settings' });
      }
    });

    // GET /queue
    router.get('/queue', async (req, res) => {
      try {
        const emails = await prisma.emailMessage.findMany({
          where: { imported: false },
          orderBy: { receivedAt: 'desc' },
          take: 100,
        });
        res.json(emails);
      } catch (error) {
        console.error('Error fetching email queue:', error);
        res.status(500).json({ error: 'Failed to fetch email queue' });
      }
    });

    // POST /refresh
    router.post('/refresh', async (req, res) => {
      try {
        const fetched = await fetchAndClassifyEmails();
        res.json({ fetched });
      } catch (error: any) {
        console.error('Error refreshing emails:', error);
        res.status(500).json({ error: `Failed to refresh: ${error.message}` });
      }
    });

    // POST /import-emails
    router.post('/import-emails', async (req, res) => {
      try {
        const { boardId, emailIds } = req.body;

        if (!boardId || !Array.isArray(emailIds) || emailIds.length === 0) {
          return res.status(400).json({ error: 'boardId and emailIds array are required' });
        }

        const emails = await prisma.emailMessage.findMany({
          where: { id: { in: emailIds } },
        });

        if (emails.length === 0) {
          return res.status(400).json({ error: 'No matching emails found' });
        }

        const textColumn = await prisma.column.findFirst({
          where: { boardId, type: 'TEXT' },
          orderBy: { order: 'asc' },
        });

        const emailColumn = await ensureColumn(prisma, boardId, 'EMAIL', 'Email');
        const sourceColumn = await ensureColumn(prisma, boardId, 'SOURCE', 'Source');

        const maxTaskOrder = await prisma.task.aggregate({
          where: { boardId },
          _max: { order: true },
        });
        let nextOrder = (maxTaskOrder._max.order ?? -1) + 1;

        const createdTasks = [];

        for (const email of emails) {
          const cellData: { columnId: string; value: string }[] = [];

          if (textColumn) {
            cellData.push({
              columnId: textColumn.id,
              value: email.taskTitle || email.subject,
            });
          }

          cellData.push({
            columnId: emailColumn.id,
            value: JSON.stringify({
              messageId: email.messageId,
              threadId: email.threadId,
              subject: email.subject,
              from: email.from,
              provider: email.provider,
            }),
          });

          cellData.push({
            columnId: sourceColumn.id,
            value: JSON.stringify({
              platform: email.provider,
              extractionId: '',
              taskTitle: email.taskTitle || email.subject,
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

          await prisma.emailMessage.update({
            where: { id: email.id },
            data: { imported: true, boardId },
          });
        }

        const fullEmailColumn = await prisma.column.findUnique({
          where: { id: emailColumn.id },
          include: { options: { orderBy: { order: 'asc' } } },
        });

        res.json({ column: fullEmailColumn, tasks: createdTasks });
      } catch (error: any) {
        console.error('Error importing emails:', error);
        res.status(500).json({ error: `Failed to import emails: ${error.message}` });
      }
    });

    // POST /send-reply
    router.post('/send-reply', async (req, res) => {
      try {
        const { taskId, columnId, replyAll, body } = req.body;

        if (!taskId || !columnId || !body) {
          return res.status(400).json({ error: 'taskId, columnId, and body are required' });
        }

        const cellValue = await prisma.cellValue.findUnique({
          where: { taskId_columnId: { taskId, columnId } },
        });

        if (!cellValue) {
          return res.status(404).json({ error: 'Email cell not found' });
        }

        const emailData = JSON.parse(cellValue.value);

        const emailMsg = await prisma.emailMessage.findUnique({
          where: { messageId: emailData.messageId },
        });

        if (!emailMsg) {
          return res.status(404).json({ error: 'Email message not found' });
        }

        const settings = await prisma.emailSettings.findFirst({
          where: { active: true },
        });

        if (!settings) {
          return res.status(400).json({ error: 'No active email connector configured' });
        }

        const nodemailer = await import('nodemailer');
        const transporter = nodemailer.default.createTransport({
          host: settings.smtpHost,
          port: settings.smtpPort,
          secure: settings.smtpPort === 465,
          auth: {
            user: settings.username,
            pass: settings.password,
          },
        });

        const toAddresses = replyAll
          ? [emailMsg.from, ...(emailMsg.cc ? emailMsg.cc.split(',').map((s: string) => s.trim()) : [])].filter(Boolean)
          : [emailMsg.from];

        await transporter.sendMail({
          from: `"${settings.displayName}" <${settings.emailAddress}>`,
          to: toAddresses.join(', '),
          subject: emailMsg.subject.startsWith('Re:') ? emailMsg.subject : `Re: ${emailMsg.subject}`,
          text: body,
          inReplyTo: emailMsg.messageId,
          references: emailMsg.messageId,
        });

        res.json({ success: true, message: 'Reply sent successfully' });
      } catch (error: any) {
        console.error('Error sending reply:', error);
        res.status(500).json({ error: `Failed to send reply: ${error.message}` });
      }
    });

    // POST /generate-reply
    router.post('/generate-reply', async (req, res) => {
      try {
        const { taskId, columnId } = req.body;

        if (!taskId || !columnId) {
          return res.status(400).json({ error: 'taskId and columnId are required' });
        }

        const cellValue = await prisma.cellValue.findUnique({
          where: { taskId_columnId: { taskId, columnId } },
        });

        if (!cellValue) {
          return res.status(404).json({ error: 'Email cell not found' });
        }

        const emailData = JSON.parse(cellValue.value);

        const emailMsg = await prisma.emailMessage.findUnique({
          where: { messageId: emailData.messageId },
        });

        if (!emailMsg) {
          return res.status(404).json({ error: 'Email message not found' });
        }

        const task = await prisma.task.findUnique({
          where: { id: taskId },
          include: {
            cellValues: { include: { column: true } },
          },
        });

        let taskTitle = emailMsg.subject;
        let taskContext = '';

        if (task) {
          for (const cv of task.cellValues) {
            if (cv.column.type === 'TEXT') {
              taskTitle = cv.value || taskTitle;
            } else if (cv.column.type !== 'EMAIL' && cv.column.type !== 'SOURCE') {
              taskContext += `${cv.column.name}: ${cv.value}\n`;
            }
          }
        }

        const settings = await prisma.emailSettings.findFirst({
          where: { active: true },
        });

        let template = settings?.replyTemplate || '';
        if (settings?.signature) {
          template += `\n\n${settings.signature}`;
        }

        const aiResponse = await fetch(`${AI_SERVICE_URL}/generate-reply`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email_subject: emailMsg.subject,
            email_body: emailMsg.bodyText,
            email_sender: emailMsg.from,
            task_title: taskTitle,
            task_context: taskContext,
            template,
          }),
        });

        if (!aiResponse.ok) {
          const errorText = await aiResponse.text();
          return res.status(500).json({ error: `AI service error: ${errorText.slice(0, 300)}` });
        }

        const result = (await aiResponse.json()) as { content: string };
        res.json({ content: result.content });
      } catch (error: any) {
        console.error('Error generating reply:', error);
        res.status(500).json({ error: `Failed to generate reply: ${error.message}` });
      }
    });

    // GET /thread/:threadId
    router.get('/thread/:threadId', async (req, res) => {
      try {
        const { threadId } = req.params;
        const messages = await prisma.emailMessage.findMany({
          where: { threadId },
          orderBy: { receivedAt: 'asc' },
        });
        res.json(messages);
      } catch (error) {
        console.error('Error fetching email thread:', error);
        res.status(500).json({ error: 'Failed to fetch email thread' });
      }
    });
  },
};

export default handlers;
