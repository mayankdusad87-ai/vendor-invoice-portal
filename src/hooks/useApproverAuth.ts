'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export function useApproverAuth() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [approverName, setApproverName] = useState<string>('');
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const t = localStorage.getItem('approverToken');
    const name = localStorage.getItem('approverName');
    if (!t || !name) {
      router.push('/');
      return;
    }
    setToken(t);
    setApproverName(name);
    setIsReady(true);
  }, [router]);

  const logout = () => {
    localStorage.removeItem('approverToken');
    localStorage.removeItem('approverName');
    router.push('/');
  };

  return { token, approverName, isReady, logout };
}
