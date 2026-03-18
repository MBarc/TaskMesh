import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Check, X, ChevronLeft, ChevronRight } from 'lucide-react';
import type { Column } from '../types';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const DAY_HEADERS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function DatePickerEditor({ value, onSave, onCancel }: { value: string; onSave: (v: string) => void; onCancel: () => void }) {
  const parseSelected = () => {
    if (!value) return null;
    const parts = value.split('T')[0].split('-').map(Number);
    if (parts.length === 3) return new Date(parts[0], parts[1] - 1, parts[2]);
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  };

  const selected = parseSelected();
  const today = new Date();

  const [viewYear, setViewYear] = useState(selected?.getFullYear() ?? today.getFullYear());
  const [viewMonth, setViewMonth] = useState(selected?.getMonth() ?? today.getMonth());

  // Manual text inputs (MM / DD / YYYY)
  const [inputMonth, setInputMonth] = useState(selected ? String(selected.getMonth() + 1) : '');
  const [inputDay, setInputDay] = useState(selected ? String(selected.getDate()) : '');
  const [inputYear, setInputYear] = useState(selected ? String(selected.getFullYear()) : '');

  // Anchor: sits in the cell at normal row height; used to measure position
  const anchorRef = useRef<HTMLDivElement>(null);
  const calendarRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  // Measure position after mount
  useEffect(() => {
    if (!anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    const calH = 330;
    const calW = 240;
    const top = rect.bottom + calH > window.innerHeight ? rect.top - calH - 4 : rect.bottom + 4;
    const left = Math.min(rect.left, window.innerWidth - calW - 8);
    setPos({ top, left });
  }, []);

  // Close on scroll or resize
  useEffect(() => {
    const close = () => onCancel();
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => { window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close); };
  }, [onCancel]);

  // Click outside both anchor and calendar → cancel
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        calendarRef.current && !calendarRef.current.contains(e.target as Node) &&
        anchorRef.current && !anchorRef.current.contains(e.target as Node)
      ) onCancel();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onCancel]);

  // Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onCancel(); }
    };
    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);
  }, [onCancel]);

  const prevMonth = () => {
    const newMonth = viewMonth === 0 ? 11 : viewMonth - 1;
    const newYear = viewMonth === 0 ? viewYear - 1 : viewYear;
    setViewMonth(newMonth);
    setViewYear(newYear);
    setInputMonth(String(newMonth + 1));
    setInputYear(String(newYear));
  };
  const nextMonth = () => {
    const newMonth = viewMonth === 11 ? 0 : viewMonth + 1;
    const newYear = viewMonth === 11 ? viewYear + 1 : viewYear;
    setViewMonth(newMonth);
    setViewYear(newYear);
    setInputMonth(String(newMonth + 1));
    setInputYear(String(newYear));
  };

  const handleMonthInput = (val: string) => {
    const digits = val.replace(/\D/g, '').slice(0, 2);
    setInputMonth(digits);
    const m = parseInt(digits, 10);
    if (m >= 1 && m <= 12) setViewMonth(m - 1);
  };

  const handleDayInput = (val: string) => {
    setInputDay(val.replace(/\D/g, '').slice(0, 2));
  };

  const handleYearInput = (val: string) => {
    const digits = val.replace(/\D/g, '').slice(0, 4);
    setInputYear(digits);
    if (digits.length === 4) {
      const y = parseInt(digits, 10);
      if (y >= 1000) setViewYear(y);
    }
  };

  // Save if all three inputs form a valid date
  const tryApply = () => {
    const m = parseInt(inputMonth, 10);
    const d = parseInt(inputDay, 10);
    const y = parseInt(inputYear, 10);
    if (m >= 1 && m <= 12 && d >= 1 && inputYear.length === 4 && y >= 1000) {
      const maxDay = new Date(y, m, 0).getDate();
      if (d <= maxDay) {
        onSave(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
      }
    }
  };

  const inputClass = 'text-center text-xs font-mono bg-surface-tertiary border border-border rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-primary-500 text-text-primary';
  const inputKeyDown = (e: React.KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); tryApply(); } };

  const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDayOfWeek).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const isSelected = (day: number) =>
    selected !== null &&
    selected.getFullYear() === viewYear &&
    selected.getMonth() === viewMonth &&
    selected.getDate() === day;

  const isToday = (day: number) =>
    today.getFullYear() === viewYear &&
    today.getMonth() === viewMonth &&
    today.getDate() === day;

  const handleDayClick = (day: number) => {
    const iso = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    setInputMonth(String(viewMonth + 1));
    setInputDay(String(day));
    setInputYear(String(viewYear));
    onSave(iso);
  };

  const handleToday = () => {
    const t = today;
    const iso = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
    setInputMonth(String(t.getMonth() + 1));
    setInputDay(String(t.getDate()));
    setInputYear(String(t.getFullYear()));
    onSave(iso);
  };

  const calendar = pos && (
    <div
      ref={calendarRef}
      style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999 }}
      className="bg-surface border border-primary-500 rounded-lg shadow-xl p-3 w-[240px]"
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Manual date inputs: MM / DD / YYYY */}
      <div className="flex items-center justify-center gap-1 mb-3">
        <input type="text" placeholder="MM" maxLength={2} value={inputMonth}
          onChange={(e) => handleMonthInput(e.target.value)} onKeyDown={inputKeyDown}
          className={`${inputClass} w-9`} />
        <span className="text-text-muted text-xs">/</span>
        <input type="text" placeholder="DD" maxLength={2} value={inputDay}
          onChange={(e) => handleDayInput(e.target.value)} onKeyDown={inputKeyDown}
          className={`${inputClass} w-9`} />
        <span className="text-text-muted text-xs">/</span>
        <input type="text" placeholder="YYYY" maxLength={4} value={inputYear}
          onChange={(e) => handleYearInput(e.target.value)} onKeyDown={inputKeyDown}
          className={`${inputClass} w-14`} />
      </div>

      {/* Month / year header */}
      <div className="flex items-center justify-between mb-2">
        <button onClick={prevMonth} className="p-1 rounded hover:bg-surface-tertiary text-text-muted hover:text-text-primary transition-colors">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-sm font-medium text-text-primary">{MONTH_NAMES[viewMonth]} {viewYear}</span>
        <button onClick={nextMonth} className="p-1 rounded hover:bg-surface-tertiary text-text-muted hover:text-text-primary transition-colors">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 mb-1">
        {DAY_HEADERS.map((d) => (
          <div key={d} className="text-center text-[11px] font-medium text-text-muted py-0.5">{d}</div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-y-0.5">
        {cells.map((day, i) => (
          <div key={i} className="flex items-center justify-center">
            {day !== null && (
              <button
                onClick={() => handleDayClick(day)}
                className={`w-7 h-7 rounded-full text-xs font-medium transition-colors ${
                  isSelected(day)
                    ? 'bg-primary-500 text-white'
                    : isToday(day)
                      ? 'ring-1 ring-primary-400 text-primary-500 hover:bg-primary-50'
                      : 'text-text-primary hover:bg-surface-tertiary'
                }`}
              >
                {day}
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Today / Clear */}
      <div className="flex items-center justify-between mt-2 pt-2 border-t border-border">
        <button onClick={handleToday} className="text-xs text-text-muted hover:text-primary-500 transition-colors">Today</button>
        {selected && (
          <button onClick={() => onSave('')} className="text-xs text-text-muted hover:text-red-500 transition-colors">Clear</button>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Anchor stays in the cell — keeps the row at normal height */}
      <div ref={anchorRef} className="min-h-[32px] px-2 py-1 flex items-center">
        <span className="text-sm text-text-muted">
          {selected ? selected.toLocaleDateString() : 'Pick a date…'}
        </span>
      </div>
      {createPortal(calendar, document.body)}
    </>
  );
}

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
        return <DatePickerEditor value={editValue} onSave={onSave} onCancel={onCancel} />;

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
