import { PrismaClient } from '@prisma/client';

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://ai-service:8000';

/** Column types that should be excluded from AI context building */
const CONNECTOR_COLUMN_TYPES = new Set([
  'ADO_PUSH', 'SNOW_PUSH', 'ITEM_NO', 'EMAIL', 'DOCUMENTATION',
]);

/**
 * Generate a field value using the AI service.
 * Builds context from the task's cell values and source transcript,
 * then calls the AI service's /generate-field endpoint.
 */
export async function generateFieldFromTask(
  prisma: PrismaClient,
  params: {
    taskId: string;
    fieldName: string;
    workItemType: string;
    aiInstructions: string;
    title?: string;
  },
): Promise<{ content: string }> {
  const { taskId, fieldName, workItemType, aiInstructions, title } = params;

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      cellValues: {
        include: { column: true },
      },
    },
  });

  if (!task) {
    throw new Error('Task not found');
  }

  const contextParts: string[] = [];
  let sourceText = '';

  if (title) {
    contextParts.push(`Task Title: ${title}`);
  }

  for (const cv of task.cellValues) {
    if (cv.column.type === 'SOURCE') {
      try {
        const sourceData = JSON.parse(cv.value);
        if (sourceData.extractionId) {
          const extraction = await prisma.aIExtraction.findUnique({
            where: { id: sourceData.extractionId },
          });
          if (extraction?.sourceText) {
            sourceText = extraction.sourceText.slice(0, 4000);
          }
        }
        if (sourceData.taskTitle && !title) {
          contextParts.push(`Task Title: ${sourceData.taskTitle}`);
        }
      } catch {
        // not JSON, skip
      }
    } else if (CONNECTOR_COLUMN_TYPES.has(cv.column.type)) {
      // skip connector-specific columns
    } else {
      contextParts.push(`${cv.column.name}: ${cv.value}`);
    }
  }

  const context = contextParts.join('\n') + (sourceText ? `\n\nSource Transcript:\n${sourceText}` : '');

  const aiResponse = await fetch(`${AI_SERVICE_URL}/generate-field`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      context,
      field_name: fieldName,
      work_item_type: workItemType,
      ai_instructions: aiInstructions,
    }),
  });

  if (!aiResponse.ok) {
    const errorText = await aiResponse.text();
    throw new Error(`AI service error: ${errorText.slice(0, 300)}`);
  }

  const result = await aiResponse.json() as { content: string };
  return { content: result.content };
}
