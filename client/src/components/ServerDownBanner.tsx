import { useEffect, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { API_URL } from '../api/http';

// The UI keeps working in an open tab after the server stops, so every action then
// fails with only console errors. Poll the server and say so plainly instead.
export function ServerDownBanner() {
  const [down, setDown] = useState(false);

  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch(`${API_URL}/api/health`, { cache: 'no-store' });
        setDown(!res.ok);
      } catch {
        setDown(true);
      }
    };
    check();
    const interval = setInterval(check, 15_000);
    window.addEventListener('focus', check);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', check);
    };
  }, []);

  if (!down) return null;

  return (
    <div role="alert" className="bg-red-50 border-b border-red-200 dark:bg-red-950/30 dark:border-red-800">
      <div className="max-w-7xl mx-auto px-4 py-2 flex items-center gap-2">
        <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
        <p className="text-sm text-red-800 dark:text-red-300">
          Buzz can't reach the TaskMesh server, so changes won't be saved. Open TaskMesh from the Start Menu
          or restart the <strong>TaskMesh-Server</strong> service. This message clears once it's back.
        </p>
      </div>
    </div>
  );
}
