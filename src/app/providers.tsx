'use client';

import { AuthProvider } from "../contexts/AuthContext";
import { ThemeProvider, useTheme } from "../contexts/ThemeContext";
import { useEffect } from "react";
import { DM_Sans } from "next/font/google";
import { useWakeLock } from "../hooks/useWakeLock";

const dmSans = DM_Sans({ 
  subsets: ["latin"],
  weight: ['400', '500', '700'],
  variable: '--font-dm-sans'
});

function ThemedBody({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();
  
  useEffect(() => {
    console.log(`[ThemedBody] Theme is now: ${theme}`);
  }, [theme]);
  
  return (
    <body 
      className={`${dmSans.variable} ${dmSans.className} font-sans bg-gray-50 dark:bg-[#161616] text-gray-800 dark:text-[#F9FAFB]`}
      data-theme={theme}
    >
      {children}
    </body>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  useWakeLock();
  return (
    <AuthProvider>
      <ThemeProvider>
        <ThemedBody>{children}</ThemedBody>
      </ThemeProvider>
    </AuthProvider>
  );
} 