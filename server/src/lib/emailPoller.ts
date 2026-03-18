import { prisma } from './prisma.js';

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://ai-service:8000';

let pollerInterval: ReturnType<typeof setInterval> | null = null;

export function startEmailPoller(): void {
  stopEmailPoller();

  // Check active settings and start polling
  prisma.emailSettings
    .findFirst({ where: { active: true } })
    .then((settings: Awaited<ReturnType<typeof prisma.emailSettings.findFirst>>) => {
      if (!settings) {
        console.log('[EmailPoller] No active email connector — poller not started');
        return;
      }

      const intervalMs = (settings.pollingInterval || 60) * 1000;
      console.log(`[EmailPoller] Starting poller for ${settings.provider} every ${settings.pollingInterval}s`);

      // Run immediately, then on interval
      fetchAndClassifyEmails().catch((err) =>
        console.error('[EmailPoller] Initial fetch error:', err)
      );

      pollerInterval = setInterval(() => {
        fetchAndClassifyEmails().catch((err) =>
          console.error('[EmailPoller] Fetch error:', err)
        );
      }, intervalMs);
    })
    .catch((err) => {
      console.error('[EmailPoller] Failed to read settings:', err);
    });
}

export function stopEmailPoller(): void {
  if (pollerInterval) {
    clearInterval(pollerInterval);
    pollerInterval = null;
    console.log('[EmailPoller] Stopped');
  }
}

export function restartEmailPoller(): void {
  stopEmailPoller();
  startEmailPoller();
}

export async function fetchAndClassifyEmails(): Promise<number> {
  const settings = await prisma.emailSettings.findFirst({ where: { active: true } });
  if (!settings) return 0;

  let fetched = 0;

  try {
    // Dynamic import of imapflow (ESM-friendly)
    const { ImapFlow } = await import('imapflow');

    const client = new ImapFlow({
      host: settings.imapHost,
      port: settings.imapPort,
      secure: true,
      auth: {
        user: settings.username,
        pass: settings.password,
      },
      logger: false,
    });

    await client.connect();

    const lock = await client.getMailboxLock('INBOX');

    try {
      // Fetch UNSEEN messages
      const messages = client.fetch({ seen: false }, {
        envelope: true,
        source: true,
        uid: true,
      });

      for await (const msg of messages) {
        const envelope = msg.envelope;
        if (!envelope) continue;

        const messageId = envelope.messageId || `gen-${Date.now()}-${Math.random()}`;

        // Check if already in DB
        const existing = await prisma.emailMessage.findUnique({
          where: { messageId },
        });
        if (existing) continue;

        // Parse body from source
        let bodyText = '';
        let bodyHtml: string | undefined;

        if (msg.source) {
          const sourceStr = msg.source.toString();
          // Simple extraction — get text after headers
          const headerEnd = sourceStr.indexOf('\r\n\r\n');
          if (headerEnd !== -1) {
            bodyText = sourceStr.substring(headerEnd + 4).substring(0, 10000);
          }
        }

        const fromAddr = envelope.from?.[0]
          ? `${envelope.from[0].name || ''} <${envelope.from[0].address || ''}>`.trim()
          : 'Unknown';

        const toAddr = envelope.to?.[0]
          ? `${envelope.to[0].name || ''} <${envelope.to[0].address || ''}>`.trim()
          : '';

        const ccAddr = envelope.cc?.map(
          (c: any) => `${c.name || ''} <${c.address || ''}>`.trim()
        ).join(', ') || null;

        const threadId = envelope.inReplyTo || messageId;

        await prisma.emailMessage.create({
          data: {
            messageId,
            threadId,
            from: fromAddr,
            to: toAddr,
            cc: ccAddr,
            subject: envelope.subject || '(no subject)',
            bodyText,
            bodyHtml: bodyHtml || null,
            receivedAt: envelope.date || new Date(),
            classification: null,
            provider: settings.provider,
          },
        });

        fetched++;
      }
    } finally {
      lock.release();
    }

    await client.logout();
  } catch (err) {
    console.error('[EmailPoller] IMAP fetch error:', err);
  }

  // Classify unclassified emails
  try {
    const unclassified = await prisma.emailMessage.findMany({
      where: { classification: null },
      take: 20,
    });

    for (const email of unclassified) {
      try {
        const aiResponse = await fetch(`${AI_SERVICE_URL}/classify-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            subject: email.subject,
            body: email.bodyText.substring(0, 3000),
            sender: email.from,
          }),
        });

        if (aiResponse.ok) {
          const result = (await aiResponse.json()) as {
            classification: string;
            task_title: string;
            confidence: number;
          };

          await prisma.emailMessage.update({
            where: { id: email.id },
            data: {
              classification: result.classification,
              taskTitle: result.task_title,
            },
          });
        }
      } catch (classifyErr) {
        console.error(`[EmailPoller] Classification error for ${email.id}:`, classifyErr);
      }
    }
  } catch (err) {
    console.error('[EmailPoller] Classification batch error:', err);
  }

  if (fetched > 0) {
    console.log(`[EmailPoller] Fetched ${fetched} new email(s)`);
  }

  return fetched;
}
