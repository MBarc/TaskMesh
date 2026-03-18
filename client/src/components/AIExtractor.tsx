import { useState, useRef, useEffect } from 'react';
import { Upload, FileText, Loader2, Check, X, Sparkles, Download, RefreshCw, AlertCircle } from 'lucide-react';
import { useBoardStore } from '../stores/boardStore';
import * as api from '../api';
import type { ExtractedTask, Platform } from '../types';

type Tab = 'notes' | 'video';

type VideoPhase =
  | 'idle'
  | 'uploading'
  | 'transcribing'
  | 'extracting'
  | 'done'
  | 'error'
  | 'cancelled';

interface ExtractedTaskWithSelection extends ExtractedTask {
  selected: boolean;
  edited: boolean;
}

const ALLOWED_EXTS = ['.mp4', '.webm', '.mov', '.m4a', '.mp3', '.wav'];
const MAX_SIZE = 500 * 1024 * 1024;

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatElapsed(startIso: string): string {
  const secs = Math.floor((Date.now() - new Date(startIso).getTime()) / 1000);
  if (secs < 60) return `${secs}s`;
  return `${Math.floor(secs / 60)}m ${secs % 60}s`;
}

export function AIExtractor() {
  const { currentBoard, bulkCreateTasks, ensureSourceColumn } = useBoardStore();
  const [activeTab, setActiveTab] = useState<Tab>('notes');

  // Notes tab state
  const [notes, setNotes] = useState('');
  const [targetIndividual, setTargetIndividual] = useState('');
  const [notesLoading, setNotesLoading] = useState(false);
  const [notesError, setNotesError] = useState<string | null>(null);

  // Shared extraction state
  const [extractedTasks, setExtractedTasks] = useState<ExtractedTaskWithSelection[]>([]);
  const [extractionId, setExtractionId] = useState<string | null>(null);
  const [platform, setPlatform] = useState<Platform>('unknown');
  const [approveLoading, setApproveLoading] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);

  // Video tab state
  const [videoPhase, setVideoPhase] = useState<VideoPhase>('idle');
  const [uploadPct, setUploadPct] = useState(0);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobFileName, setJobFileName] = useState('');
  const [jobFileSize, setJobFileSize] = useState(0);
  const [jobCreatedAt, setJobCreatedAt] = useState('');
  const [transcript, setTranscript] = useState('');
  const [videoError, setVideoError] = useState<string | null>(null);
  const [videoPlatform, setVideoPlatform] = useState<Platform>('unknown');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [, forceRender] = useState(0);

  // Tick every second for elapsed time display
  useEffect(() => {
    if (videoPhase === 'transcribing' || videoPhase === 'extracting') {
      const ticker = setInterval(() => forceRender((n) => n + 1), 1000);
      return () => clearInterval(ticker);
    }
  }, [videoPhase]);

  // Clean up polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  function startPolling(id: string) {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const job = await api.getTranscriptionJob(id);
        switch (job.status) {
          case 'queued':
            setVideoPhase('uploading');
            break;
          case 'transcribing':
            setVideoPhase('transcribing');
            break;
          case 'extracting':
            setVideoPhase('extracting');
            break;
          case 'done': {
            clearInterval(pollRef.current!);
            pollRef.current = null;
            setTranscript(job.transcript ?? '');
            setVideoPhase('done');
            // Load extraction tasks
            if (job.extractionId) {
              try {
                const extraction = await api.getExtraction(job.extractionId);
                setExtractionId(extraction.id);
                setPlatform(videoPlatform !== 'unknown' ? videoPlatform : extraction.platform);
                setExtractedTasks(
                  (extraction.extractedTasks as ExtractedTask[]).map((t) => ({
                    ...t,
                    selected: true,
                    edited: false,
                  }))
                );
              } catch {
                // extraction load failed — user can still download transcript
              }
            }
            break;
          }
          case 'error':
            clearInterval(pollRef.current!);
            pollRef.current = null;
            setVideoError(job.errorMessage ?? 'An unknown error occurred');
            setVideoPhase('error');
            break;
          case 'cancelled':
            clearInterval(pollRef.current!);
            pollRef.current = null;
            setVideoPhase('cancelled');
            break;
        }
      } catch {
        // Network blip — keep polling
      }
    }, 3000);
  }

  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset input so same file can be re-selected
    e.target.value = '';
    if (!file || !currentBoard) return;

    // Client-side validation
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!ALLOWED_EXTS.includes(ext)) {
      setVideoError(`Unsupported file type "${ext}". Please upload MP4, WebM, MOV, M4A, MP3, or WAV.`);
      return;
    }
    if (file.size > MAX_SIZE) {
      setVideoError(`File is too large (${formatBytes(file.size)}). Maximum size is 500 MB.`);
      return;
    }

    setVideoError(null);
    setVideoPhase('uploading');
    setUploadPct(0);
    setJobFileName(file.name);
    setJobFileSize(file.size);
    setTranscript('');
    setExtractedTasks([]);
    setExtractionId(null);

    try {
      const result = await api.startTranscription(currentBoard.id, file, (pct) =>
        setUploadPct(pct)
      );
      setJobId(result.jobId);
      setJobCreatedAt(new Date().toISOString());
      setVideoPhase('transcribing');
      startPolling(result.jobId);
    } catch (err) {
      setVideoPhase('error');
      setVideoError(err instanceof Error ? err.message : 'Upload failed');
    }
  };

  const handleCancelJob = async () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (jobId) {
      try {
        await api.cancelTranscription(jobId);
      } catch {
        // best-effort
      }
    }
    setVideoPhase('cancelled');
  };

  const resetVideoTab = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    setVideoPhase('idle');
    setUploadPct(0);
    setJobId(null);
    setJobFileName('');
    setJobFileSize(0);
    setTranscript('');
    setVideoError(null);
    setExtractedTasks([]);
    setExtractionId(null);
  };

  const handleReExtract = async () => {
    if (!currentBoard || !transcript) return;
    setNotesLoading(true);
    setNotesError(null);
    try {
      const result = await api.extractTasksFromNotes(currentBoard.id, transcript);
      setExtractionId(result.extractionId);
      setPlatform(videoPlatform !== 'unknown' ? videoPlatform : result.platform);
      setExtractedTasks(result.tasks.map((t) => ({ ...t, selected: true, edited: false })));
    } catch (err) {
      setNotesError(err instanceof Error ? err.message : 'Re-extraction failed');
    } finally {
      setNotesLoading(false);
    }
  };

  const handleDownloadTranscript = () => {
    const blob = new Blob([transcript], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${jobFileName.replace(/\.[^.]+$/, '')}-transcript.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Notes tab handlers
  const handleExtractFromNotes = async () => {
    if (!currentBoard || !notes.trim()) return;
    setNotesLoading(true);
    setNotesError(null);
    setExtractedTasks([]);
    try {
      const result = await api.extractTasksFromNotes(
        currentBoard.id,
        notes,
        targetIndividual.trim() || undefined
      );
      setExtractionId(result.extractionId);
      setPlatform(result.platform);
      setExtractedTasks(result.tasks.map((t) => ({ ...t, selected: true, edited: false })));
    } catch (err) {
      setNotesError(err instanceof Error ? err.message : 'Failed to extract tasks');
    } finally {
      setNotesLoading(false);
    }
  };

  const toggleTaskSelection = (index: number) => {
    setExtractedTasks((tasks) =>
      tasks.map((task, i) => (i === index ? { ...task, selected: !task.selected } : task))
    );
  };

  const updateTaskTitle = (index: number, title: string) => {
    setExtractedTasks((tasks) =>
      tasks.map((task, i) => (i === index ? { ...task, title, edited: true } : task))
    );
  };

  const selectAll = () => setExtractedTasks((tasks) => tasks.map((t) => ({ ...t, selected: true })));
  const deselectAll = () => setExtractedTasks((tasks) => tasks.map((t) => ({ ...t, selected: false })));

  const handleApprove = async () => {
    if (!currentBoard) return;
    const selectedTasks = extractedTasks.filter((t) => t.selected);
    if (selectedTasks.length === 0) return;

    const titleColumn = currentBoard.columns.find((c) => c.type === 'TEXT') || currentBoard.columns[0];
    if (!titleColumn) {
      setApproveError('No columns available to add tasks');
      return;
    }

    setApproveLoading(true);
    setApproveError(null);
    try {
      const sourceColumn = await ensureSourceColumn();
      const tasksToCreate = selectedTasks.map((task) => {
        const cellValues: Record<string, string> = { [titleColumn.id]: task.title };
        if (sourceColumn && extractionId) {
          cellValues[sourceColumn.id] = JSON.stringify({ platform, extractionId, taskTitle: task.title });
        }
        return { cellValues };
      });

      await bulkCreateTasks(tasksToCreate);

      if (extractionId) {
        await api.completeExtraction(extractionId);
      }

      setExtractedTasks([]);
      setExtractionId(null);
      setPlatform('unknown');
      setNotes('');
      if (activeTab === 'video') {
        // Keep transcript visible; just clear task list
      }
    } catch (err) {
      setApproveError(err instanceof Error ? err.message : 'Failed to add tasks');
    } finally {
      setApproveLoading(false);
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
              disabled={notesLoading || !notes.trim()}
              className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {notesLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              Extract Tasks
            </button>
            {notesError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {notesError}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {/* Meeting platform selector — only in idle state */}
            {videoPhase === 'idle' && (
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
            )}

            {/* ── IDLE: drop zone ── */}
            {videoPhase === 'idle' && (
              <div>
                <label className="block text-sm font-medium text-text-primary mb-2">
                  Upload meeting recording
                </label>
                {videoError && (
                  <div className="mb-3 flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>{videoError}</span>
                  </div>
                )}
                <div className="border-2 border-dashed border-border rounded-lg p-8 text-center hover:border-primary-500 transition-colors">
                  <input
                    type="file"
                    accept=".mp4,.webm,.mov,.m4a,.mp3,.wav"
                    onChange={handleVideoUpload}
                    className="hidden"
                    id="video-upload"
                  />
                  <label htmlFor="video-upload" className="cursor-pointer flex flex-col items-center gap-2">
                    <Upload className="w-8 h-8 text-text-muted" />
                    <span className="text-sm text-text-secondary">Click to upload or drag and drop</span>
                    <span className="text-xs text-text-muted">MP4, WebM, MOV, M4A, MP3, WAV up to 500 MB</span>
                  </label>
                </div>
              </div>
            )}

            {/* ── UPLOADING ── */}
            {videoPhase === 'uploading' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-text-primary">{jobFileName}</p>
                    <p className="text-xs text-text-muted">{formatBytes(jobFileSize)}</p>
                  </div>
                  <span className="text-sm text-text-secondary">{uploadPct}%</span>
                </div>
                <div className="w-full bg-surface-tertiary rounded-full h-2">
                  <div
                    className="bg-primary-500 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${uploadPct}%` }}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-text-secondary flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-primary-500" />
                    Uploading…
                  </span>
                  <button
                    onClick={handleCancelJob}
                    className="text-sm text-text-secondary hover:text-text-primary flex items-center gap-1"
                  >
                    <X className="w-4 h-4" />
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* ── TRANSCRIBING ── */}
            {videoPhase === 'transcribing' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-text-primary">{jobFileName}</p>
                    <p className="text-xs text-text-muted">{formatBytes(jobFileSize)}</p>
                  </div>
                  {jobCreatedAt && (
                    <span className="text-xs text-text-muted">{formatElapsed(jobCreatedAt)}</span>
                  )}
                </div>
                <div className="w-full bg-surface-tertiary rounded-full h-2 overflow-hidden">
                  <div className="h-2 rounded-full bg-primary-500 animate-pulse w-full" />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-text-secondary flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-primary-500" />
                    Transcribing audio…
                  </span>
                  <button
                    onClick={handleCancelJob}
                    className="text-sm text-text-secondary hover:text-text-primary flex items-center gap-1"
                  >
                    <X className="w-4 h-4" />
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* ── EXTRACTING ── */}
            {videoPhase === 'extracting' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-text-primary">{jobFileName}</p>
                    <p className="text-xs text-text-muted">{formatBytes(jobFileSize)}</p>
                  </div>
                  {jobCreatedAt && (
                    <span className="text-xs text-text-muted">{formatElapsed(jobCreatedAt)}</span>
                  )}
                </div>
                <div className="w-full bg-surface-tertiary rounded-full h-2 overflow-hidden">
                  <div className="h-2 rounded-full bg-primary-500 animate-pulse w-full" />
                </div>
                <span className="text-sm text-text-secondary flex items-center gap-2">
                  <Sparkles className="w-4 h-4 animate-spin text-primary-500" />
                  Extracting tasks…
                </span>
              </div>
            )}

            {/* ── DONE ── */}
            {videoPhase === 'done' && (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                    <Check className="w-4 h-4 text-green-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text-primary truncate">{jobFileName}</p>
                    <p className="text-xs text-text-muted">
                      {formatBytes(jobFileSize)}
                      {jobCreatedAt && ` · ${formatElapsed(jobCreatedAt)}`}
                    </p>
                  </div>
                  <button
                    onClick={resetVideoTab}
                    className="text-xs text-text-secondary hover:text-text-primary"
                  >
                    Upload another
                  </button>
                </div>

                {transcript && (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-sm font-medium text-text-primary">Transcript</label>
                      <div className="flex gap-2">
                        <button
                          onClick={handleDownloadTranscript}
                          className="flex items-center gap-1 text-xs text-primary-500 hover:text-primary-600"
                        >
                          <Download className="w-3 h-3" />
                          Download
                        </button>
                        <button
                          onClick={handleReExtract}
                          disabled={notesLoading}
                          className="flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary disabled:opacity-50"
                        >
                          <RefreshCw className={`w-3 h-3 ${notesLoading ? 'animate-spin' : ''}`} />
                          Re-extract tasks
                        </button>
                      </div>
                    </div>
                    <div className="max-h-48 overflow-y-auto p-3 bg-surface border border-border rounded-lg text-sm text-text-secondary">
                      {transcript}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── ERROR ── */}
            {videoPhase === 'error' && (
              <div className="space-y-3">
                <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                    <X className="w-4 h-4 text-red-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-red-800 truncate">{jobFileName}</p>
                    <p className="text-sm text-red-700 mt-1">{videoError}</p>
                  </div>
                </div>
                <button
                  onClick={resetVideoTab}
                  className="text-sm text-primary-500 hover:text-primary-600"
                >
                  Try again
                </button>
              </div>
            )}

            {/* ── CANCELLED ── */}
            {videoPhase === 'cancelled' && (
              <div className="space-y-3">
                <div className="flex items-center gap-3 p-3 bg-surface-tertiary border border-border rounded-lg">
                  <div className="w-8 h-8 rounded-full bg-surface flex items-center justify-center shrink-0">
                    <X className="w-4 h-4 text-text-muted" />
                  </div>
                  <p className="text-sm text-text-secondary">Upload cancelled</p>
                </div>
                <button
                  onClick={resetVideoTab}
                  className="text-sm text-primary-500 hover:text-primary-600"
                >
                  Try again
                </button>
              </div>
            )}
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
              <button onClick={selectAll} className="text-sm text-primary-500 hover:text-primary-600">
                Select All
              </button>
              <span className="text-text-muted">|</span>
              <button onClick={deselectAll} className="text-sm text-text-secondary hover:text-text-primary">
                Deselect All
              </button>
            </div>
          </div>

          <div className="space-y-2 max-h-96 overflow-y-auto">
            {extractedTasks.map((task, index) => (
              <div
                key={index}
                className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                  task.selected ? 'bg-primary-50 border-primary-200' : 'bg-surface border-border'
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

          {approveError && (
            <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {approveError}
            </div>
          )}

          <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-border">
            <button
              onClick={() => { setExtractedTasks([]); setExtractionId(null); setApproveError(null); }}
              className="flex items-center gap-2 px-4 py-2 text-text-secondary hover:text-text-primary hover:bg-surface-tertiary rounded-lg"
            >
              <X className="w-4 h-4" />
              Cancel
            </button>
            <button
              onClick={handleApprove}
              disabled={approveLoading || selectedCount === 0}
              className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {approveLoading ? (
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
