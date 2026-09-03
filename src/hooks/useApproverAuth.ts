'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Hook for approver authentication.
 * Checks the server-side HttpOnly cookie session via /api/auth/me.
 * Never reads tokens from localStorage.
 */
export function useApproverAuth() {
  const router = useRouter();
  const [approverName, setApproverName] = useState<string>('');
  const [approverId, setApproverId] = useState<string>('');
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const checkSession = async () => {
      try {
        const res = await fetch('/api/auth/me');
        const data = await res.json();
        if (!res.ok || !data.authenticated || data.role !== 'approver') {
          router.push('/');
          return;
        }
        setApproverName(data.approverName);
        setApproverId(data.approverId);
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

  return { approverName, approverId, isReady, logout };
}
