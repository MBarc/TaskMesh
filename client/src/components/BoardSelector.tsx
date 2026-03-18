import { useState, useEffect, Fragment } from 'react';
import { Menu, Transition } from '@headlessui/react';
import { ChevronDown, Plus, Trash2, AlertTriangle, Archive, Star } from 'lucide-react';
import { useBoardStore } from '../stores/boardStore';
import { useArchiveStore } from '../stores/archiveStore';
import { useUiPrefsStore } from '../stores/uiPrefsStore';
import * as api from '../api';

interface DeleteConfirmState {
  boardId: string;
  boardName: string;
  taskCount: number;
}

export function BoardSelector() {
  const { boards, currentBoard, isArchiveView, fetchBoard, createBoard, deleteBoard, setArchiveView } = useBoardStore();
  const { settings: archiveSettings, fetchSettings: fetchArchiveSettings } = useArchiveStore();
  const { favoriteBoardId, setFavoriteBoardId, newBoardSignal } = useUiPrefsStore();
  const [isCreating, setIsCreating] = useState(false);

  // Open the new-board input when Ctrl+B triggers it from App
  useEffect(() => {
    if (newBoardSignal > 0) {
      setIsCreating(true);
      // Focus is applied via autoFocus on the input
    }
  }, [newBoardSignal]);
  const [newBoardName, setNewBoardName] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirmState | null>(null);
  const [hoveredBoardId, setHoveredBoardId] = useState<string | null>(null);

  useEffect(() => {
    fetchArchiveSettings();
  }, [fetchArchiveSettings]);

  const handleCreate = async () => {
    if (!newBoardName.trim()) return;
    try {
      const board = await createBoard(newBoardName.trim());
      await fetchBoard(board.id);
      setNewBoardName('');
      setIsCreating(false);
    } catch (error) {
      console.error('Failed to create board:', error);
    }
  };

  const handleSelect = (boardId: string) => {
    fetchBoard(boardId);
  };

  const handleToggleFavorite = (e: React.MouseEvent, boardId: string) => {
    e.stopPropagation();
    setFavoriteBoardId(favoriteBoardId === boardId ? null : boardId);
  };

  const handleDelete = async (e: React.MouseEvent, boardId: string, boardName: string) => {
    e.stopPropagation();

    try {
      // Fetch full board data to check for tasks
      const board = await api.getBoard(boardId);
      const taskCount = board.tasks?.length || 0;

      if (taskCount > 0) {
        // Show confirmation modal for boards with tasks
        setDeleteConfirm({ boardId, boardName, taskCount });
      } else {
        // No tasks, delete directly
        await deleteBoard(boardId);
      }
    } catch (error) {
      console.error('Failed to check board:', error);
    }
  };

  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    await deleteBoard(deleteConfirm.boardId);
    setDeleteConfirm(null);
  };

  return (
    <div className="flex items-center gap-2">
      <Menu as="div" className="relative">
        <Menu.Button className="flex items-center gap-2 px-3 py-1.5 text-sm bg-surface-tertiary hover:bg-primary-100 text-text-primary rounded-md transition-colors">
          {isArchiveView ? 'Archive' : (currentBoard?.name || 'Select Board')}
          <ChevronDown className="w-4 h-4" />
        </Menu.Button>
        <Transition
          as={Fragment}
          enter="transition ease-out duration-100"
          enterFrom="transform opacity-0 scale-95"
          enterTo="transform opacity-100 scale-100"
          leave="transition ease-in duration-75"
          leaveFrom="transform opacity-100 scale-100"
          leaveTo="transform opacity-0 scale-95"
        >
          <Menu.Items className="absolute left-0 mt-1 w-56 bg-surface rounded-md shadow-lg border border-border z-50 overflow-hidden">
            <div className="py-1">
              {boards.map((board) => (
                <Menu.Item key={board.id}>
                  {({ active }) => (
                    <button
                      onClick={() => handleSelect(board.id)}
                      onMouseEnter={() => setHoveredBoardId(board.id)}
                      onMouseLeave={() => setHoveredBoardId(null)}
                      className={`flex items-center justify-between w-full px-3 py-2 text-sm ${
                        active ? 'bg-surface-tertiary' : ''
                      } ${currentBoard?.id === board.id ? 'text-primary-500 font-medium' : 'text-text-primary'}`}
                    >
                      <span className="truncate">{board.name}</span>
                      <div className="flex items-center gap-0.5 shrink-0">
                        <button
                          onClick={(e) => handleToggleFavorite(e, board.id)}
                          className="p-1 rounded"
                          title={favoriteBoardId === board.id ? 'Remove from favorites' : 'Set as favorite'}
                        >
                          <Star
                            className="w-3.5 h-3.5"
                            style={
                              favoriteBoardId === board.id
                                ? { color: '#EAB308', fill: '#EAB308' }
                                : hoveredBoardId === board.id
                                  ? { color: '#EAB308', fill: 'none' }
                                  : { color: 'transparent', fill: 'none' }
                            }
                          />
                        </button>
                        <button
                          onClick={(e) => handleDelete(e, board.id, board.name)}
                          className="p-1 hover:bg-surface-secondary rounded text-text-muted hover:text-red-500"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </button>
                  )}
                </Menu.Item>
              ))}
              {boards.length === 0 && (
                <div className="px-3 py-2 text-sm text-text-muted">
                  No boards yet
                </div>
              )}
              {archiveSettings?.archiveEnabled && (
                <>
                  <div className="border-t border-border my-1" />
                  <Menu.Item>
                    {({ active }) => (
                      <button
                        onClick={() => setArchiveView(true)}
                        className={`flex items-center gap-2 w-full px-3 py-2 text-sm ${
                          active ? 'bg-surface-tertiary' : ''
                        } ${isArchiveView ? 'text-primary-500 font-medium' : 'text-text-primary'}`}
                      >
                        <Archive className="w-3.5 h-3.5" />
                        Archive
                      </button>
                    )}
                  </Menu.Item>
                </>
              )}
            </div>
          </Menu.Items>
        </Transition>
      </Menu>

      {isCreating ? (
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={newBoardName}
            onChange={(e) => setNewBoardName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            placeholder="Board name"
            className="px-2 py-1 text-sm bg-surface border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 text-text-primary"
            autoFocus
          />
          <button
            onClick={handleCreate}
            className="px-2 py-1 text-sm bg-primary-500 text-white rounded-md hover:bg-primary-600"
          >
            Create
          </button>
          <button
            onClick={() => {
              setIsCreating(false);
              setNewBoardName('');
            }}
            className="px-2 py-1 text-sm text-text-secondary hover:text-text-primary"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          onClick={() => setIsCreating(true)}
          className="flex items-center gap-1 px-2 py-1.5 text-sm text-primary-500 hover:text-primary-600 hover:bg-primary-50 rounded-md transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Board
        </button>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-surface rounded-lg shadow-xl w-full max-w-md p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-amber-100 rounded-full">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
              </div>
              <h3 className="text-lg font-semibold text-text-primary">Open Work Items</h3>
            </div>
            <p className="text-sm text-text-secondary mb-2">
              The board <span className="font-medium text-text-primary">"{deleteConfirm.boardName}"</span> contains{' '}
              <span className="font-medium text-text-primary">{deleteConfirm.taskCount}</span>{' '}
              {deleteConfirm.taskCount === 1 ? 'work item' : 'work items'} that will be permanently deleted.
            </p>
            <p className="text-sm text-text-muted mb-5">
              This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 text-sm font-medium bg-primary-500 text-white rounded-md hover:bg-primary-600"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="px-4 py-2 text-sm font-medium text-red-600 border border-red-300 rounded-md hover:bg-red-50"
              >
                I acknowledge. Delete anyways
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
