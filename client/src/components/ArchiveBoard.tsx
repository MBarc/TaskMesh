import { useEffect, useState } from 'react';
import { Archive, RotateCcw, Trash2, ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react';
import { useArchiveStore } from '../stores/archiveStore';
import type { ArchivedTask } from '../types';

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  const diffMonths = Math.floor(diffDays / 30);
  return `${diffMonths}mo ago`;
}

export function ArchiveBoard() {
  const { groups, loading, error, fetchArchivedTasks, restoreTask, deleteTask } = useArchiveStore();
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [restoringIds, setRestoringIds] = useState<Set<string>>(new Set());
  const [deleteConfirm, setDeleteConfirm] = useState<ArchivedTask | null>(null);

  useEffect(() => {
    fetchArchivedTasks();
  }, [fetchArchivedTasks]);

  const toggleGroup = (boardId: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(boardId)) next.delete(boardId);
      else next.add(boardId);
      return next;
    });
  };

  const handleRestore = async (task: ArchivedTask) => {
    setRestoringIds((prev) => new Set(prev).add(task.id));
    try {
      await restoreTask(task.id);
    } catch {
      // error is set in store
    } finally {
      setRestoringIds((prev) => {
        const next = new Set(prev);
        next.delete(task.id);
        return next;
      });
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    await deleteTask(deleteConfirm.id);
    setDeleteConfirm(null);
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full mx-auto mb-3" />
        <p className="text-sm text-text-muted">Loading archive...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-sm text-red-500">{error}</p>
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="text-center py-12">
        <Archive className="w-12 h-12 mx-auto text-text-muted mb-4" />
        <h2 className="text-lg font-medium text-text-primary mb-2">No archived tasks</h2>
        <p className="text-text-secondary">
          Tasks you delete will appear here when archiving is enabled.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        {groups.map((group) => {
          const isCollapsed = collapsedGroups.has(group.boardId);

          return (
            <div key={group.boardId} className="bg-surface-secondary rounded-lg border border-border overflow-hidden">
              {/* Group Header */}
              <button
                onClick={() => toggleGroup(group.boardId)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-surface-tertiary transition-colors"
              >
                {isCollapsed ? (
                  <ChevronRight className="w-4 h-4 text-text-muted shrink-0" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-text-muted shrink-0" />
                )}
                <span className="text-sm font-medium text-text-primary">{group.boardName}</span>
                {!group.boardStillExists && (
                  <span className="px-1.5 py-0.5 text-[10px] font-medium bg-red-100 text-red-600 rounded">
                    Board Deleted
                  </span>
                )}
                <span className="text-xs text-text-muted ml-auto">
                  {group.tasks.length} {group.tasks.length === 1 ? 'task' : 'tasks'}
                </span>
              </button>

              {/* Task Table */}
              {!isCollapsed && (
                <div className="border-t border-border">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border bg-surface">
                        {/* Gather all unique column names across tasks in this group */}
                        {(() => {
                          const seen = new Set<string>();
                          const cols: string[] = [];
                          for (const task of group.tasks) {
                            for (const col of task.snapshot.columns) {
                              if (!seen.has(col.name)) {
                                seen.add(col.name);
                                cols.push(col.name);
                              }
                            }
                          }
                          return cols.map((name) => (
                            <th key={name} className="px-3 py-2 text-xs font-medium text-text-muted text-left">
                              {name}
                            </th>
                          ));
                        })()}
                        <th className="px-3 py-2 text-xs font-medium text-text-muted text-left">Archived</th>
                        <th className="px-3 py-2 text-xs font-medium text-text-muted text-right w-24">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.tasks.map((task) => {
                        // Build column name set for this group
                        const seen = new Set<string>();
                        const colNames: string[] = [];
                        for (const t of group.tasks) {
                          for (const c of t.snapshot.columns) {
                            if (!seen.has(c.name)) {
                              seen.add(c.name);
                              colNames.push(c.name);
                            }
                          }
                        }

                        const colMap = new Map(task.snapshot.columns.map((c) => [c.name, c]));

                        return (
                          <tr key={task.id} className="border-b border-border last:border-0 hover:bg-surface-tertiary/50">
                            {colNames.map((name) => {
                              const col = colMap.get(name);
                              if (!col) {
                                return <td key={name} className="px-3 py-2 text-sm text-text-muted">—</td>;
                              }

                              // Render cell value based on type
                              let display: React.ReactNode = col.value;

                              if (col.type === 'DROPDOWN' || col.type === 'MULTI_SELECT') {
                                try {
                                  const parsed = JSON.parse(col.value);
                                  if (Array.isArray(parsed)) {
                                    display = (
                                      <div className="flex flex-wrap gap-1">
                                        {parsed.map((item: { id: string; value: string; color?: string }, i: number) => (
                                          <span
                                            key={i}
                                            className="inline-flex px-1.5 py-0.5 text-xs rounded"
                                            style={item.color ? { backgroundColor: item.color + '20', color: item.color } : undefined}
                                          >
                                            {item.value}
                                          </span>
                                        ))}
                                      </div>
                                    );
                                  } else if (parsed && parsed.value) {
                                    display = (
                                      <span
                                        className="inline-flex px-1.5 py-0.5 text-xs rounded"
                                        style={parsed.color ? { backgroundColor: parsed.color + '20', color: parsed.color } : undefined}
                                      >
                                        {parsed.value}
                                      </span>
                                    );
                                  }
                                } catch {
                                  display = col.optionLabel || col.value;
                                }
                              } else if (col.type === 'CHECKBOX') {
                                display = col.value === 'true' ? 'Yes' : 'No';
                              } else if (col.type === 'DATE' && col.value) {
                                try {
                                  display = new Date(col.value).toLocaleDateString();
                                } catch {
                                  display = col.value;
                                }
                              } else if ((col.type === 'SOURCE' || col.type === 'ADO_PUSH' || col.type === 'SNOW_PUSH' || col.type === 'EMAIL' || col.type === 'DOCUMENTATION') && col.value) {
                                try {
                                  const parsed = JSON.parse(col.value);
                                  display = parsed.taskTitle || parsed.workItemId || parsed.ticketNumber || parsed.subject || parsed.fileName || col.value;
                                } catch {
                                  display = col.value;
                                }
                              }

                              return (
                                <td key={name} className="px-3 py-2 text-sm text-text-primary max-w-[200px] truncate">
                                  {display}
                                </td>
                              );
                            })}
                            <td className="px-3 py-2 text-xs text-text-muted whitespace-nowrap">
                              {timeAgo(task.archivedAt)}
                            </td>
                            <td className="px-3 py-2 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  onClick={() => handleRestore(task)}
                                  disabled={!group.boardStillExists || restoringIds.has(task.id)}
                                  title={group.boardStillExists ? 'Restore to board' : 'Board deleted — cannot restore'}
                                  className="p-1.5 rounded text-text-muted hover:text-primary-500 hover:bg-primary-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-text-muted disabled:hover:bg-transparent"
                                >
                                  <RotateCcw className={`w-3.5 h-3.5 ${restoringIds.has(task.id) ? 'animate-spin' : ''}`} />
                                </button>
                                <button
                                  onClick={() => setDeleteConfirm(task)}
                                  title="Permanently delete"
                                  className="p-1.5 rounded text-text-muted hover:text-red-500 hover:bg-red-50 transition-colors"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-surface rounded-lg shadow-xl w-full max-w-md p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-amber-100 rounded-full">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
              </div>
              <h3 className="text-lg font-semibold text-text-primary">Permanently Delete?</h3>
            </div>
            <p className="text-sm text-text-secondary mb-5">
              This will permanently remove the archived task. This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 text-sm font-medium bg-primary-500 text-white rounded-md hover:bg-primary-600"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="px-4 py-2 text-sm font-medium text-red-600 border border-red-300 rounded-md hover:bg-red-50"
              >
                Delete Permanently
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
