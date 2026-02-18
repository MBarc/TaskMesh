import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { X, Loader2 } from 'lucide-react';
import { useBoardStore } from '../stores/boardStore';
import * as api from '../api';
import { PlatformBadge } from './PlatformBadge';
import type { Platform } from '../types';

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'can', 'shall', 'it', 'its', 'this', 'that',
  'these', 'those', 'i', 'we', 'you', 'he', 'she', 'they', 'me', 'us',
  'him', 'her', 'them', 'my', 'our', 'your', 'his', 'their', 'not', 'no',
  'so', 'if', 'up', 'out', 'all', 'get', 'got', 'just', 'from', 'about',
]);

function getKeywords(taskTitle: string): string[] {
  return taskTitle
    .split(/\s+/)
    .map((w) => w.replace(/[^a-zA-Z0-9]/g, '').toLowerCase())
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

interface HighlightSegment {
  text: string;
  highlighted: boolean;
}

function highlightText(text: string, keywords: string[]): HighlightSegment[] {
  if (keywords.length === 0) return [{ text, highlighted: false }];

  const escaped = keywords.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const regex = new RegExp(`(${escaped.join('|')})`, 'gi');

  const segments: HighlightSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ text: text.slice(lastIndex, match.index), highlighted: false });
    }
    segments.push({ text: match[0], highlighted: true });
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex), highlighted: false });
  }

  return segments;
}

export function TranscriptOverlay() {
  const { transcriptOverlay, closeTranscriptOverlay } = useBoardStore();
  const [sourceText, setSourceText] = useState('');
  const [platform, setPlatform] = useState<Platform>(transcriptOverlay?.platform ?? 'unknown');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const firstHighlightRef = useRef<HTMLElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeTranscriptOverlay();
      }
    },
    [closeTranscriptOverlay]
  );

  useEffect(() => {
    if (!transcriptOverlay) return;

    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [transcriptOverlay, handleKeyDown]);

  useEffect(() => {
    if (!transcriptOverlay) return;

    setLoading(true);
    setError(null);
    setSourceText('');
    setPlatform(transcriptOverlay.platform);

    api
      .getExtraction(transcriptOverlay.extractionId)
      .then((data) => {
        setSourceText(data.sourceText);
        setPlatform(data.platform);
      })
      .catch(() => setError('Failed to load transcript'))
      .finally(() => setLoading(false));
  }, [transcriptOverlay]);

  // Auto-scroll to first highlight after content renders
  useEffect(() => {
    if (sourceText && firstHighlightRef.current) {
      firstHighlightRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [sourceText]);

  const keywords = useMemo(
    () => (transcriptOverlay ? getKeywords(transcriptOverlay.taskTitle) : []),
    [transcriptOverlay]
  );

  const segments = useMemo(() => highlightText(sourceText, keywords), [sourceText, keywords]);

  if (!transcriptOverlay) return null;

  let firstHighlightAssigned = false;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={(e) => {
        if (e.target === overlayRef.current) closeTranscriptOverlay();
      }}
    >
      <div className="relative w-full h-full max-w-4xl max-h-[90vh] m-4 bg-surface rounded-xl shadow-2xl flex flex-col overflow-hidden border border-border">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-surface-secondary">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-text-primary">Transcript</h2>
            <PlatformBadge platform={platform} />
          </div>
          <button
            onClick={closeTranscriptOverlay}
            className="p-2 text-text-muted hover:text-text-primary hover:bg-surface-tertiary rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Task title context */}
        <div className="px-6 py-3 bg-surface-tertiary border-b border-border">
          <span className="text-sm text-text-secondary">
            Highlighting keywords from: <span className="font-medium text-text-primary">{transcriptOverlay.taskTitle}</span>
          </span>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
            </div>
          )}
          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}
          {!loading && !error && sourceText && (
            <div className="text-sm text-text-primary leading-relaxed whitespace-pre-wrap font-mono">
              {segments.map((seg, i) => {
                if (seg.highlighted) {
                  const isFirst = !firstHighlightAssigned;
                  if (isFirst) firstHighlightAssigned = true;
                  return (
                    <mark
                      key={i}
                      ref={isFirst ? (firstHighlightRef as React.RefObject<HTMLElement>) : undefined}
                      className="bg-yellow-200 text-yellow-900 px-0.5 rounded"
                    >
                      {seg.text}
                    </mark>
                  );
                }
                return <span key={i}>{seg.text}</span>;
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
