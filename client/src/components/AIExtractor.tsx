import { useState } from 'react';
import { Upload, FileText, Loader2, Check, X, Sparkles } from 'lucide-react';
import { useBoardStore } from '../stores/boardStore';
import * as api from '../api';
import type { ExtractedTask, Platform } from '../types';

type Tab = 'notes' | 'video';

interface ExtractedTaskWithSelection extends ExtractedTask {
  selected: boolean;
  edited: boolean;
}

export function AIExtractor() {
  const { currentBoard, bulkCreateTasks, ensureSourceColumn } = useBoardStore();
  const [activeTab, setActiveTab] = useState<Tab>('notes');
  const [notes, setNotes] = useState('');
  const [targetIndividual, setTargetIndividual] = useState('');
  const [transcript, setTranscript] = useState('');
  const [extractedTasks, setExtractedTasks] = useState<ExtractedTaskWithSelection[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [extractionId, setExtractionId] = useState<string | null>(null);
  const [platform, setPlatform] = useState<Platform>('unknown');
  const [videoPlatform, setVideoPlatform] = useState<Platform>('unknown');

  const handleExtractFromNotes = async () => {
    if (!currentBoard || !notes.trim()) return;

    setLoading(true);
    setError(null);
    setExtractedTasks([]);

    try {
      const result = await api.extractTasksFromNotes(
        currentBoard.id,
        notes,
        targetIndividual.trim() || undefined
      );
      setExtractionId(result.extractionId);
      setPlatform(result.platform);
      setExtractedTasks(
        result.tasks.map((task) => ({ ...task, selected: true, edited: false }))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to extract tasks');
    } finally {
      setLoading(false);
    }
  };

  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentBoard) return;

    setLoading(true);
    setError(null);
    setExtractedTasks([]);
    setTranscript('');

    try {
      const result = await api.transcribeVideo(currentBoard.id, file);
      setExtractionId(result.extractionId);
      setPlatform(videoPlatform !== 'unknown' ? videoPlatform : result.platform);
      setTranscript(result.transcript);
      setExtractedTasks(
        result.tasks.map((task) => ({ ...task, selected: true, edited: false }))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process video');
    } finally {
      setLoading(false);
    }
  };

  const toggleTaskSelection = (index: number) => {
    setExtractedTasks((tasks) =>
      tasks.map((task, i) =>
        i === index ? { ...task, selected: !task.selected } : task
      )
    );
  };

  const updateTaskTitle = (index: number, title: string) => {
    setExtractedTasks((tasks) =>
      tasks.map((task, i) =>
        i === index ? { ...task, title, edited: true } : task
      )
    );
  };

  const selectAll = () => {
    setExtractedTasks((tasks) => tasks.map((task) => ({ ...task, selected: true })));
  };

  const deselectAll = () => {
    setExtractedTasks((tasks) => tasks.map((task) => ({ ...task, selected: false })));
  };

  const handleApprove = async () => {
    if (!currentBoard) return;

    const selectedTasks = extractedTasks.filter((t) => t.selected);
    if (selectedTasks.length === 0) return;

    // Find the first TEXT column or the first column
    const titleColumn = currentBoard.columns.find((c) => c.type === 'TEXT') || currentBoard.columns[0];
    if (!titleColumn) {
      setError('No columns available to add tasks');
      return;
    }

    setLoading(true);
    try {
      // Ensure a SOURCE column exists on the board
      const sourceColumn = await ensureSourceColumn();

      // Create tasks with the title in the first text column and source info
      const tasksToCreate = selectedTasks.map((task) => {
        const cellValues: Record<string, string> = {
          [titleColumn.id]: task.title,
        };

        // Populate source cell if we have the column and extraction info
        if (sourceColumn && extractionId) {
          cellValues[sourceColumn.id] = JSON.stringify({
            platform,
            extractionId,
            taskTitle: task.title,
          });
        }

        return { cellValues };
      });

      await bulkCreateTasks(tasksToCreate);

      // Mark extraction as complete
      if (extractionId) {
        await api.completeExtraction(extractionId);
      }

      // Clear the form
      setExtractedTasks([]);
      setNotes('');
      setTranscript('');
      setExtractionId(null);
      setPlatform('unknown');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add tasks');
    } finally {
      setLoading(false);
    }
  };

  const selectedCount = extractedTasks.filter((t) => t.selected).length;

  if (!currentBoard) {
    return (
      <div className="text-center py-12">
        <Sparkles className="w-12 h-12 mx-auto text-text-muted mb-4" />
        <p className="text-text-secondary">Select a board to use AI extraction</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Tab Selection */}
      <div className="flex gap-2">
        <button
          onClick={() => setActiveTab('notes')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
            activeTab === 'notes'
              ? 'bg-primary-500 text-white'
              : 'bg-surface-secondary text-text-secondary hover:bg-surface-tertiary hover:text-text-primary'
          }`}
        >
          <FileText className="w-4 h-4" />
          Meeting Notes
        </button>
        <button
          onClick={() => setActiveTab('video')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
            activeTab === 'video'
              ? 'bg-primary-500 text-white'
              : 'bg-surface-secondary text-text-secondary hover:bg-surface-tertiary hover:text-text-primary'
          }`}
        >
          <Upload className="w-4 h-4" />
          Video/Audio
        </button>
      </div>

      {/* Input Section */}
      <div className="bg-surface-secondary rounded-lg border border-border p-4">
        {activeTab === 'notes' ? (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-primary mb-2">
                Paste your meeting notes
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Paste your Zoom meeting notes, chat transcript, or any text with action items..."
                rows={8}
                className="w-full px-3 py-2 bg-surface border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-text-primary resize-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-primary mb-2">
                Target Individual (optional)
              </label>
              <input
                type="text"
                value={targetIndividual}
                onChange={(e) => setTargetIndividual(e.target.value)}
                placeholder="e.g., John, Sarah, Michael - only extract tasks for this person"
                className="w-full px-3 py-2 bg-surface border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-text-primary"
              />
              <p className="mt-1 text-xs text-text-muted">
                Leave empty to extract all tasks, or enter a name to filter tasks assigned to that person
              </p>
            </div>
            <button
              onClick={handleExtractFromNotes}
              disabled={loading || !notes.trim()}
              className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              Extract Tasks
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-primary mb-2">
                Meeting Platform
              </label>
              <select
                value={videoPlatform}
                onChange={(e) => setVideoPlatform(e.target.value as Platform)}
                className="w-full px-3 py-2 bg-surface border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-text-primary"
              >
                <option value="unknown">Unknown</option>
                <option value="zoom">Zoom</option>
                <option value="teams">Teams</option>
                <option value="google_meet">Google Meet</option>
                <option value="slack">Slack</option>
                <option value="webex">Webex</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-text-primary mb-2">
                Upload meeting recording
              </label>
              <div className="border-2 border-dashed border-border rounded-lg p-8 text-center hover:border-primary-500 transition-colors">
                <input
                  type="file"
                  accept=".mp4,.webm,.mov,.m4a,.mp3,.wav"
                  onChange={handleVideoUpload}
                  className="hidden"
                  id="video-upload"
                  disabled={loading}
                />
                <label
                  htmlFor="video-upload"
                  className="cursor-pointer flex flex-col items-center gap-2"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
                      <span className="text-sm text-text-secondary">
                        Processing... This may take a few minutes
                      </span>
                    </>
                  ) : (
                    <>
                      <Upload className="w-8 h-8 text-text-muted" />
                      <span className="text-sm text-text-secondary">
                        Click to upload or drag and drop
                      </span>
                      <span className="text-xs text-text-muted">
                        MP4, WebM, MOV, M4A, MP3, WAV (max 500MB)
                      </span>
                    </>
                  )}
                </label>
              </div>
            </div>

            {transcript && (
              <div>
                <label className="block text-sm font-medium text-text-primary mb-2">
                  Transcript
                </label>
                <div className="max-h-48 overflow-y-auto p-3 bg-surface border border-border rounded-lg text-sm text-text-secondary">
                  {transcript}
                </div>
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}
      </div>

      {/* Extracted Tasks Review */}
      {extractedTasks.length > 0 && (
        <div className="bg-surface-secondary rounded-lg border border-border p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-text-primary">
              Extracted Tasks ({selectedCount}/{extractedTasks.length} selected)
            </h3>
            <div className="flex items-center gap-2">
              <button
                onClick={selectAll}
                className="text-sm text-primary-500 hover:text-primary-600"
              >
                Select All
              </button>
              <span className="text-text-muted">|</span>
              <button
                onClick={deselectAll}
                className="text-sm text-text-secondary hover:text-text-primary"
              >
                Deselect All
              </button>
            </div>
          </div>

          <div className="space-y-2 max-h-96 overflow-y-auto">
            {extractedTasks.map((task, index) => (
              <div
                key={index}
                className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                  task.selected
                    ? 'bg-primary-50 border-primary-200'
                    : 'bg-surface border-border'
                }`}
              >
                <input
                  type="checkbox"
                  checked={task.selected}
                  onChange={() => toggleTaskSelection(index)}
                  className="mt-1 w-4 h-4 rounded border-border text-primary-500 focus:ring-primary-500"
                />
                <div className="flex-1 min-w-0">
                  <input
                    type="text"
                    value={task.title}
                    onChange={(e) => updateTaskTitle(index, e.target.value)}
                    className="w-full px-2 py-1 bg-transparent border-0 border-b border-transparent hover:border-border focus:border-primary-500 focus:outline-none text-text-primary"
                  />
                  {task.description && (
                    <p className="mt-1 text-sm text-text-muted">{task.description}</p>
                  )}
                  {(task.dueDate || task.priority) && (
                    <div className="flex gap-2 mt-2">
                      {task.dueDate && (
                        <span className="text-xs px-2 py-0.5 bg-surface-tertiary rounded text-text-secondary">
                          Due: {task.dueDate}
                        </span>
                      )}
                      {task.priority && (
                        <span className="text-xs px-2 py-0.5 bg-surface-tertiary rounded text-text-secondary">
                          Priority: {task.priority}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-border">
            <button
              onClick={() => {
                setExtractedTasks([]);
                setExtractionId(null);
              }}
              className="flex items-center gap-2 px-4 py-2 text-text-secondary hover:text-text-primary hover:bg-surface-tertiary rounded-lg"
            >
              <X className="w-4 h-4" />
              Cancel
            </button>
            <button
              onClick={handleApprove}
              disabled={loading || selectedCount === 0}
              className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Check className="w-4 h-4" />
              )}
              Add {selectedCount} Tasks to Board
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
