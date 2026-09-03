'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Hook for billing engineer authentication.
 * Checks the server-side HttpOnly cookie session via /api/auth/me.
 * Engineers log in with email + password (set by admin).
 */
export function useEngineerAuth() {
  const router = useRouter();
  const [engineerName, setEngineerName] = useState<string>('');
  const [engineerId, setEngineerId] = useState<string>('');
  const [engineerEmail, setEngineerEmail] = useState<string>('');
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const checkSession = async () => {
      try {
        const res = await fetch('/api/auth/me');
        const data = await res.json();
        if (!res.ok || !data.authenticated || data.role !== 'engineer') {
          router.push('/');
          return;
        }
        setEngineerName(data.engineerName);
        setEngineerId(data.engineerId);
        setEngineerEmail(data.engineerEmail);
        setIsReady(true);
      } catch {
        router.push('/');
      }
    };
    checkSession();
  }, [router]);

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch { /* ignore */ }
    router.push('/');
  };

  return { engineerName, engineerId, engineerEmail, isReady, logout };
}
