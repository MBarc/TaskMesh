import { useState, useRef } from 'react';
import { Loader2, X, Sparkles, Send } from 'lucide-react';
import * as api from '../api';
import type { EmailCellValue } from '../types';

interface EmailReplyModalProps {
  taskId: string;
  columnId: string;
  emailData: EmailCellValue;
  onClose: () => void;
}

export function EmailReplyModal({ taskId, columnId, emailData, onClose }: EmailReplyModalProps) {
  const [replyBody, setReplyBody] = useState('');
  const [replyAll, setReplyAll] = useState(false);
  const [sending, setSending] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const isOutlook = emailData.provider === 'outlook';
  const accentColor = isOutlook ? '#0078d4' : '#ea4335';

  const handleGenerate = async () => {
    setGenerating(true);
    setFeedback(null);
    try {
      const result = await api.generateEmailReply(taskId, columnId);
      setReplyBody(result.content);
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to generate reply' });
    } finally {
      setGenerating(false);
    }
  };

  const handleSend = async () => {
    if (!replyBody.trim()) {
      setFeedback({ type: 'error', message: 'Reply body cannot be empty' });
      return;
    }

    setSending(true);
    setFeedback(null);
    try {
      const result = await api.sendEmailReply({
        taskId,
        columnId,
        replyAll,
        body: replyBody,
      });
      setFeedback({ type: 'success', message: result.message || 'Reply sent!' });
      setTimeout(onClose, 1500);
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to send reply' });
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]"
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
    >
      <div
        className="rounded-sm shadow-2xl w-full max-w-lg overflow-hidden"
        style={{ fontFamily: '"Segoe UI", "Helvetica Neue", Arial, sans-serif' }}
      >
        {/* Accent bar */}
        <div className="h-1" style={{ backgroundColor: accentColor }} />

        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-3"
          style={{ backgroundColor: '#f8f8f8', borderBottom: '1px solid #e0e0e0' }}
        >
          <h2 className="text-sm font-semibold" style={{ color: '#333' }}>
            Reply to: {emailData.subject}
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-sm transition-colors"
            style={{ color: '#999' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#333')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#999')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-3" style={{ backgroundColor: '#ffffff' }}>
          {/* Reply mode toggle */}
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: '#333' }}>
              <input
                type="radio"
                name="replyMode"
                checked={!replyAll}
                onChange={() => setReplyAll(false)}
                style={{ accentColor }}
              />
              Reply to Sender
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: '#333' }}>
              <input
                type="radio"
                name="replyMode"
                checked={replyAll}
                onChange={() => setReplyAll(true)}
                style={{ accentColor }}
              />
              Reply All
            </label>
          </div>

          {/* To display */}
          <div className="text-xs" style={{ color: '#666' }}>
            To: {emailData.from}
          </div>

          {/* Reply textarea */}
          <textarea
            value={replyBody}
            onChange={(e) => setReplyBody(e.target.value)}
            placeholder="Write your reply..."
            rows={8}
            className="w-full px-3 py-2 text-sm rounded-sm resize-none focus:outline-none"
            style={{
              backgroundColor: '#ffffff',
              border: '1px solid #d0d0d0',
              color: '#333',
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = accentColor;
              e.currentTarget.style.boxShadow = `0 0 0 1px ${accentColor}`;
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = '#d0d0d0';
              e.currentTarget.style.boxShadow = 'none';
            }}
          />

          {/* AI Generate button */}
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-sm transition-colors disabled:opacity-50"
            style={{
              color: accentColor,
              border: `1px solid ${accentColor}40`,
              backgroundColor: 'transparent',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = `${accentColor}10`)}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            {generating ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )}
            {generating ? 'Generating...' : 'AI Generate Reply'}
          </button>

          {/* Feedback */}
          {feedback && (
            <div
              className={`text-sm px-3 py-2 rounded-sm ${
                feedback.type === 'success'
                  ? 'bg-green-50 text-green-700 border border-green-200'
                  : 'bg-red-50 text-red-700 border border-red-200'
              }`}
            >
              {feedback.message}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-end px-5 py-3 gap-2"
          style={{ backgroundColor: '#f8f8f8', borderTop: '1px solid #e0e0e0' }}
        >
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-sm rounded-sm transition-colors"
            style={{
              color: '#333',
              backgroundColor: '#ffffff',
              border: '1px solid #d0d0d0',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f0f0f0')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#ffffff')}
          >
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={sending || !replyBody.trim()}
            className="px-4 py-1.5 text-sm text-white rounded-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
            style={{ backgroundColor: accentColor }}
            onMouseEnter={(e) => {
              if (!sending && replyBody.trim()) e.currentTarget.style.opacity = '0.9';
            }}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
          >
            {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
