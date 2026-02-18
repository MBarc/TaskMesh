import { useState, useRef, useEffect } from 'react';
import { Check, X } from 'lucide-react';
import type { Column } from '../types';

interface CellEditorProps {
  column: Column;
  value: string;
  onSave: (value: string) => void;
  onCancel: () => void;
}

export function CellEditor({ column, value, onSave, onCancel }: CellEditorProps) {
  const [editValue, setEditValue] = useState(value);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSave(editValue);
    } else if (e.key === 'Escape') {
      onCancel();
    }
  };

  const renderEditor = () => {
    switch (column.type) {
      case 'SOURCE':
      case 'ADO_PUSH':
      case 'EMAIL':
        // SOURCE, ADO_PUSH, and EMAIL cells are read-only; cancel immediately
        onCancel();
        return null;

      case 'TEXT':
        return (
          <input
            ref={inputRef as React.RefObject<HTMLInputElement>}
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={() => onSave(editValue)}
            className="w-full px-2 py-1 text-sm bg-surface border border-primary-500 rounded focus:outline-none focus:ring-2 focus:ring-primary-500 text-text-primary"
          />
        );

      case 'NUMBER':
        return (
          <input
            ref={inputRef as React.RefObject<HTMLInputElement>}
            type="number"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={() => onSave(editValue)}
            className="w-full px-2 py-1 text-sm bg-surface border border-primary-500 rounded focus:outline-none focus:ring-2 focus:ring-primary-500 text-text-primary font-mono"
          />
        );

      case 'DATE':
        return (
          <input
            ref={inputRef as React.RefObject<HTMLInputElement>}
            type="date"
            value={editValue ? editValue.split('T')[0] : ''}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={() => onSave(editValue)}
            className="w-full px-2 py-1 text-sm bg-surface border border-primary-500 rounded focus:outline-none focus:ring-2 focus:ring-primary-500 text-text-primary"
          />
        );

      case 'CHECKBOX':
        return (
          <div className="flex items-center gap-2 px-2 py-1">
            <input
              ref={inputRef as React.RefObject<HTMLInputElement>}
              type="checkbox"
              checked={editValue === 'true'}
              onChange={(e) => {
                const newValue = e.target.checked ? 'true' : 'false';
                setEditValue(newValue);
                onSave(newValue);
              }}
              className="w-4 h-4 rounded border-border text-primary-500 focus:ring-primary-500"
            />
          </div>
        );

      case 'DROPDOWN':
        return (
          <select
            ref={inputRef as React.RefObject<HTMLSelectElement>}
            value={editValue}
            onChange={(e) => {
              setEditValue(e.target.value);
              onSave(e.target.value);
            }}
            onKeyDown={handleKeyDown}
            onBlur={() => onSave(editValue)}
            className="w-full px-2 py-1 text-sm bg-surface border border-primary-500 rounded focus:outline-none focus:ring-2 focus:ring-primary-500 text-text-primary"
          >
            <option value="">Select...</option>
            {column.options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.value}
              </option>
            ))}
          </select>
        );

      case 'MULTI_SELECT': {
        let selectedIds: string[] = [];
        try {
          selectedIds = editValue ? JSON.parse(editValue) : [];
        } catch {
          selectedIds = [];
        }

        return (
          <div className="p-2 bg-surface border border-primary-500 rounded shadow-lg min-w-[200px]">
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {column.options.map((option) => (
                <label
                  key={option.id}
                  className="flex items-center gap-2 px-2 py-1 hover:bg-surface-tertiary rounded cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(option.id)}
                    onChange={(e) => {
                      const newSelected = e.target.checked
                        ? [...selectedIds, option.id]
                        : selectedIds.filter((id) => id !== option.id);
                      setEditValue(JSON.stringify(newSelected));
                    }}
                    className="w-4 h-4 rounded border-border text-primary-500 focus:ring-primary-500"
                  />
                  <span
                    className="text-sm"
                    style={{ color: option.color || undefined }}
                  >
                    {option.value}
                  </span>
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-2 mt-2 pt-2 border-t border-border">
              <button
                onClick={onCancel}
                className="p-1 text-text-muted hover:text-text-primary"
              >
                <X className="w-4 h-4" />
              </button>
              <button
                onClick={() => onSave(editValue)}
                className="p-1 text-primary-500 hover:text-primary-600"
              >
                <Check className="w-4 h-4" />
              </button>
            </div>
          </div>
        );
      }

      default:
        return (
          <input
            ref={inputRef as React.RefObject<HTMLInputElement>}
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={() => onSave(editValue)}
            className="w-full px-2 py-1 text-sm bg-surface border border-primary-500 rounded focus:outline-none focus:ring-2 focus:ring-primary-500 text-text-primary"
          />
        );
    }
  };

  return <div className="relative">{renderEditor()}</div>;
}
