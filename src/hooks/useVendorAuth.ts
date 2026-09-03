'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Hook for vendor/billing-engineer authentication.
 * Checks the server-side HttpOnly cookie session via /api/auth/me.
 * Never reads tokens from localStorage.
 */
export function useVendorAuth() {
  const router = useRouter();
  const [vendorName, setVendorName] = useState<string>('');
  const [vendorId, setVendorId] = useState<string>('');
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const checkSession = async () => {
      try {
        const res = await fetch('/api/auth/me');
        const data = await res.json();
        if (!res.ok || !data.authenticated || data.role !== 'vendor') {
          router.push('/');
          return;
        }
        setVendorName(data.vendorName);
        setVendorId(data.vendorId);
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

  return { vendorName, vendorId, isReady, logout };
}
