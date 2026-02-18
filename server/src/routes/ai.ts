import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { prisma } from '../lib/prisma.js';
import { detectPlatform } from '../lib/detectPlatform.js';

export const aiRoutes = Router();

// Type definitions for AI service responses
interface ExtractTasksResponse {
  tasks: Array<{
    title: string;
    description?: string;
    dueDate?: string;
    priority?: string;
  }>;
}

interface TranscribeResponse {
  transcript: string;
}

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://ai-service:8000';

// Configure multer for video uploads
const storage = multer.diskStorage({
  destination: '/app/uploads',
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB max
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.mp4', '.webm', '.mov', '.m4a', '.mp3', '.wav'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  },
});

/**
 * @openapi
 * /api/ai/extract-from-notes:
 *   post:
 *     tags: [AI]
 *     summary: Extract tasks from meeting notes
 *     responses:
 *       200:
 *         description: Extracted tasks
 */
aiRoutes.post('/extract-from-notes', async (req, res) => {
  try {
    const { text, boardId, targetIndividual } = req.body;

    if (!text || !boardId) {
      return res.status(400).json({ error: 'Text and boardId are required' });
    }

    // Call AI service
    const response = await fetch(`${AI_SERVICE_URL}/extract-tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, target_individual: targetIndividual }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`AI service error: ${error}`);
    }

    const data = await response.json() as ExtractTasksResponse;

    // Save extraction to database
    const extraction = await prisma.aIExtraction.create({
      data: {
        boardId,
        sourceType: 'meeting_notes',
        sourceText: text,
        extractedTasks: data.tasks,
        status: 'pending_review',
      },
    });

    const platform = detectPlatform(text);

    res.json({
      extractionId: extraction.id,
      tasks: data.tasks,
      platform,
    });
  } catch (error) {
    console.error('Error extracting tasks from notes:', error);
    res.status(500).json({ error: 'Failed to extract tasks' });
  }
});

/**
 * @openapi
 * /api/ai/transcribe-video:
 *   post:
 *     tags: [AI]
 *     summary: Transcribe video and extract tasks
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               video:
 *                 type: string
 *                 format: binary
 *               boardId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Transcript and extracted tasks
 */
aiRoutes.post('/transcribe-video', upload.single('video'), async (req, res) => {
  try {
    const { boardId } = req.body;
    const file = req.file;

    if (!file || !boardId) {
      return res.status(400).json({ error: 'Video file and boardId are required' });
    }

    // Call AI service for transcription
    const transcribeResponse = await fetch(`${AI_SERVICE_URL}/transcribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filepath: file.path }),
    });

    if (!transcribeResponse.ok) {
      const error = await transcribeResponse.text();
      throw new Error(`Transcription error: ${error}`);
    }

    const transcribeData = await transcribeResponse.json() as TranscribeResponse;
    const transcript = transcribeData.transcript;

    // Extract tasks from transcript
    const extractResponse = await fetch(`${AI_SERVICE_URL}/extract-tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: transcript }),
    });

    if (!extractResponse.ok) {
      const error = await extractResponse.text();
      throw new Error(`Task extraction error: ${error}`);
    }

    const extractData = await extractResponse.json() as ExtractTasksResponse;

    // Save extraction to database
    const extraction = await prisma.aIExtraction.create({
      data: {
        boardId,
        sourceType: 'video',
        sourceText: transcript,
        extractedTasks: extractData.tasks,
        status: 'pending_review',
      },
    });

    const platform = detectPlatform(transcript);

    res.json({
      extractionId: extraction.id,
      transcript,
      tasks: extractData.tasks,
      platform,
    });
  } catch (error) {
    console.error('Error processing video:', error);
    res.status(500).json({ error: 'Failed to process video' });
  }
});

/**
 * @openapi
 * /api/ai/extractions/{boardId}:
 *   get:
 *     tags: [AI]
 *     summary: Get pending extractions for a board
 *     parameters:
 *       - in: path
 *         name: boardId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of pending extractions
 */
aiRoutes.get('/extractions/:boardId', async (req, res) => {
  try {
    const { boardId } = req.params;

    const extractions = await prisma.aIExtraction.findMany({
      where: {
        boardId,
        status: 'pending_review',
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(extractions);
  } catch (error) {
    console.error('Error fetching extractions:', error);
    res.status(500).json({ error: 'Failed to fetch extractions' });
  }
});

/**
 * @openapi
 * /api/ai/extraction/{id}:
 *   get:
 *     tags: [AI]
 *     summary: Get a single extraction by ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Extraction details
 */
aiRoutes.get('/extraction/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const extraction = await prisma.aIExtraction.findUnique({
      where: { id },
    });

    if (!extraction) {
      return res.status(404).json({ error: 'Extraction not found' });
    }

    const platform = detectPlatform(extraction.sourceText);

    res.json({
      ...extraction,
      platform,
    });
  } catch (error) {
    console.error('Error fetching extraction:', error);
    res.status(500).json({ error: 'Failed to fetch extraction' });
  }
});

/**
 * @openapi
 * /api/ai/extractions/{id}/complete:
 *   put:
 *     tags: [AI]
 *     summary: Complete an extraction
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Extraction completed
 */
/**
 * @openapi
 * /api/ai/reword:
 *   post:
 *     tags: [AI]
 *     summary: Reword selected text using AI
 *     responses:
 *       200:
 *         description: Reworded text
 */
aiRoutes.post('/reword', async (req, res) => {
  try {
    const { text, context } = req.body;
    if (!text) {
      return res.status(400).json({ error: 'text is required' });
    }

    const response = await fetch(`${AI_SERVICE_URL}/reword-text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, context: context || '' }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`AI service error: ${error}`);
    }

    const data = await response.json() as { content: string };
    res.json(data);
  } catch (error) {
    console.error('Error rewording text:', error);
    res.status(500).json({ error: 'Failed to reword text' });
  }
});

/**
 * @openapi
 * /api/ai/generate-section:
 *   post:
 *     tags: [AI]
 *     summary: Generate a document section using AI
 *     responses:
 *       200:
 *         description: Generated section content
 */
aiRoutes.post('/generate-section', async (req, res) => {
  try {
    const { sectionName, templateContext, taskContext } = req.body;
    if (!sectionName) {
      return res.status(400).json({ error: 'sectionName is required' });
    }

    const response = await fetch(`${AI_SERVICE_URL}/generate-section`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        section_name: sectionName,
        template_context: templateContext || '',
        task_context: taskContext || '',
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`AI service error: ${error}`);
    }

    const data = await response.json() as { content: string };
    res.json(data);
  } catch (error) {
    console.error('Error generating section:', error);
    res.status(500).json({ error: 'Failed to generate section' });
  }
});

/**
 * @openapi
 * /api/ai/generate-theme:
 *   post:
 *     tags: [AI]
 *     summary: Generate a theme color palette from a text description
 *     responses:
 *       200:
 *         description: Generated theme colors
 */
aiRoutes.post('/generate-theme', async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: 'prompt is required' });
    }

    const response = await fetch(`${AI_SERVICE_URL}/generate-theme`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`AI service error: ${error}`);
    }

    const data = await response.json() as { isDark: boolean; colors: Record<string, string> };
    res.json(data);
  } catch (error) {
    console.error('Error generating theme:', error);
    res.status(500).json({ error: 'Failed to generate theme' });
  }
});

aiRoutes.put('/extractions/:id/complete', async (req, res) => {
  try {
    const { id } = req.params;

    const extraction = await prisma.aIExtraction.update({
      where: { id },
      data: { status: 'completed' },
    });

    res.json(extraction);
  } catch (error) {
    console.error('Error completing extraction:', error);
    res.status(500).json({ error: 'Failed to complete extraction' });
  }
});
