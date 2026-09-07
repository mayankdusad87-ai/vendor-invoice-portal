'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Hook for accounts team authentication.
 * Checks the server-side HttpOnly cookie session via /api/auth/me.
 */
export function useAccountsAuth() {
  const router = useRouter();
  const [accountsName, setAccountsName] = useState<string>('');
  const [accountsId, setAccountsId] = useState<string>('');
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const checkSession = async () => {
      try {
        const res = await fetch('/api/auth/me');
        const data = await res.json();
        if (!res.ok || !data.authenticated || data.role !== 'accounts') {
          router.push('/');
          return;
        }
        setAccountsName(data.accountsName);
        setAccountsId(data.accountsId);
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

  return { accountsName, accountsId, isReady, logout };
}
