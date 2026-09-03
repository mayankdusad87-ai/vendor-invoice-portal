'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export function useAdminAuth() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const t = localStorage.getItem('adminToken');
    if (!t) {
      router.push('/');
      return;
    }
    setToken(t);
    setIsReady(true);
  }, [router]);

  const logout = () => {
    localStorage.removeItem('adminToken');
    router.push('/');
  };

  return { token, isReady, logout };
}
