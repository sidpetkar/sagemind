"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function ResetPage() {
  const router = useRouter();

  useEffect(() => {
    // Clear all caches
    if ('caches' in window) {
      caches.keys().then((names) => {
        names.forEach(name => {
          caches.delete(name);
        });
      });
    }

    // Unregister service workers
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        registrations.forEach(registration => {
          registration.unregister();
        });
      });
    }

    // Clear storage
    localStorage.clear();
    sessionStorage.clear();

    // Add a delay before redirecting to ensure cache clearing completes
    setTimeout(() => {
      // Force a hard reload and redirect to home
      window.location.href = '/?t=' + new Date().getTime();
    }, 1000);
  }, []);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <h1 className="text-2xl font-bold mb-4">Clearing Cache...</h1>
        <p>Resetting application state and clearing browser cache.</p>
        <p className="mt-4">You will be redirected to the home page shortly.</p>
      </div>
    </div>
  );
} 