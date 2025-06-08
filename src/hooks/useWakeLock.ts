'use client';

import { useState, useEffect } from 'react';

export const useWakeLock = () => {
  const [wakeLock, setWakeLock] = useState<WakeLockSentinel | null>(null);

  useEffect(() => {
    const requestWakeLock = async () => {
      if ('wakeLock' in navigator) {
        try {
          const wl = await navigator.wakeLock.request('screen');
          setWakeLock(wl);
          console.log('Screen Wake Lock is active.');

          wl.addEventListener('release', () => {
            console.log('Screen Wake Lock has been released.');
            setWakeLock(null);
          });
        } catch (err: any) {
          console.error(`${err.name}, ${err.message}`);
        }
      } else {
        console.log('Wake Lock API is not supported in this browser.');
      }
    };

    requestWakeLock();

    const handleVisibilityChange = () => {
      if (wakeLock !== null && document.visibilityState === 'visible') {
        requestWakeLock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    document.addEventListener('fullscreenchange', handleVisibilityChange);

    return () => {
      if (wakeLock !== null) {
        wakeLock.release();
        setWakeLock(null);
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      document.removeEventListener('fullscreenchange', handleVisibilityChange);
    };
  }, [wakeLock]);

  return wakeLock;
}; 