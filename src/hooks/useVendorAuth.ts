'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export function useVendorAuth() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [vendorName, setVendorName] = useState<string>('');
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const t = localStorage.getItem('vendorToken');
    const name = localStorage.getItem('vendorName');
    if (!t || !name) {
      router.push('/');
      return;
    }
    setToken(t);
    setVendorName(name);
    setIsReady(true);
  }, [router]);

  const logout = () => {
    localStorage.removeItem('vendorToken');
    localStorage.removeItem('vendorName');
    router.push('/');
  };

  return { token, vendorName, isReady, logout };
}
