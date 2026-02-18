import { useState, useRef, useEffect } from 'react';
import { Loader2, X, Reply } from 'lucide-react';
import { useBoardStore } from '../stores/boardStore';
import * as api from '../api';
import type { EmailThreadMessage } from '../types';
import { EmailReplyModal } from './EmailReplyModal';

export function EmailViewModal() {
  const { emailViewModal, closeEmailViewModal } = useBoardStore();
  const [thread, setThread] = useState<EmailThreadMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [showReply, setShowReply] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (emailViewModal) {
      setLoading(true);
      setShowReply(false);
      api
        .getEmailThread(emailViewModal.emailData.threadId)
        .then((data) => setThread(data))
        .catch(() => setThread([]))
        .finally(() => setLoading(false));
    }
  }, [emailViewModal]);

  useEffect(() => {
    if (!emailViewModal) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showReply) setShowReply(false);
        else closeEmailViewModal();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [emailViewModal, closeEmailViewModal, showReply]);

  if (!emailViewModal) return null;

  const { emailData, taskId, columnId } = emailViewModal;
  const isOutlook = emailData.provider === 'outlook';
  const accentColor = isOutlook ? '#0078d4' : '#ea4335';

  return (
    <>
      <div
        ref={overlayRef}
        className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
        onClick={(e) => {
          if (e.target === overlayRef.current) closeEmailViewModal();
        }}
      >
        <div
          className="rounded-sm shadow-2xl w-full max-w-2xl overflow-hidden"
          style={{ fontFamily: '"Segoe UI", "Helvetica Neue", Arial, sans-serif' }}
        >
          {/* Accent bar */}
          <div className="h-1" style={{ backgroundColor: accentColor }} />

          {/* Header */}
          <div
            className="flex items-center justify-between px-5 py-3"
            style={{ backgroundColor: '#f8f8f8', borderBottom: '1px solid #e0e0e0' }}
          >
            <div className="flex-1 min-w-0 mr-4">
              <h2 className="text-sm font-semibold truncate" style={{ color: '#333' }}>
                {emailData.subject}
              </h2>
              <span className="text-xs" style={{ color: '#666' }}>
                From: {emailData.from}
              </span>
            </div>
            <button
              onClick={closeEmailViewModal}
              className="p-1 rounded-sm transition-colors shrink-0"
              style={{ color: '#999' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#333')}
              onMouseLeave={(e) => (e.currentTarget.style.color = '#999')}
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Thread messages */}
          <div
            className="max-h-[400px] overflow-y-auto px-5 py-4"
            style={{ backgroundColor: '#ffffff' }}
          >
            {loading ? (
              <div className="flex items-center justify-center gap-2 text-sm py-12" style={{ color: '#999' }}>
                <Loader2 className="w-4 h-4 animate-spin" style={{ color: accentColor }} />
                Loading thread...
              </div>
            ) : thread.length === 0 ? (
              <div className="text-sm py-8 text-center" style={{ color: '#999' }}>
                No messages found
              </div>
            ) : (
              <div className="space-y-4">
                {thread.map((msg) => (
                  <div
                    key={msg.id}
                    className="rounded-md border"
                    style={{ borderColor: '#e5e7eb' }}
                  >
                    <div
                      className="flex items-center justify-between px-4 py-2 text-xs"
                      style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb', color: '#666' }}
                    >
                      <span className="font-medium" style={{ color: '#333' }}>
                        {msg.from.replace(/<[^>]+>/g, '').trim() || msg.from}
                      </span>
                      <span>{new Date(msg.receivedAt).toLocaleString()}</span>
                    </div>
                    <div
                      className="px-4 py-3 text-sm whitespace-pre-wrap"
                      style={{ color: '#333' }}
                    >
                      {msg.bodyText.substring(0, 2000)}
                    </div>
                    {msg.cc && (
                      <div
                        className="px-4 py-1 text-xs border-t"
                        style={{ color: '#999', borderColor: '#e5e7eb' }}
                      >
                        CC: {msg.cc}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer with Reply button */}
          <div
            className="flex items-center justify-end px-5 py-3 gap-2"
            style={{ backgroundColor: '#f8f8f8', borderTop: '1px solid #e0e0e0' }}
          >
            <button
              onClick={closeEmailViewModal}
              className="px-4 py-1.5 text-sm rounded-sm transition-colors"
              style={{
                color: '#333',
                backgroundColor: '#ffffff',
                border: '1px solid #d0d0d0',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f0f0f0')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#ffffff')}
            >
              Close
            </button>
            <button
              onClick={() => setShowReply(true)}
              className="px-4 py-1.5 text-sm text-white rounded-sm flex items-center gap-2 transition-colors"
              style={{ backgroundColor: accentColor }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.9')}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
            >
              <Reply className="w-3.5 h-3.5" />
              Reply
            </button>
          </div>
        </div>
      </div>

      {showReply && (
        <EmailReplyModal
          taskId={taskId}
          columnId={columnId}
          emailData={emailData}
          onClose={() => setShowReply(false)}
        />
      )}
    </>
  );
}
