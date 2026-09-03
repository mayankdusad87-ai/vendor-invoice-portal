'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Hook for admin authentication.
 * Checks the server-side HttpOnly cookie session via /api/auth/me.
 * Never reads tokens from localStorage.
 */
export function useAdminAuth() {
  const router = useRouter();
  const [username, setUsername] = useState<string>('');
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const checkSession = async () => {
      try {
        const res = await fetch('/api/auth/me');
        const data = await res.json();
        if (!res.ok || !data.authenticated || data.role !== 'admin') {
          router.push('/');
          return;
        }
        setUsername(data.username);
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

  return { username, isReady, logout };
}
