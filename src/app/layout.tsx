'use client'; // Convert to client component

import type { Metadata } from "next";
import { DM_Sans } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "../contexts/AuthContext";
import { ThemeProvider, useTheme } from "../contexts/ThemeContext";
import { useEffect } from "react";

const dmSans = DM_Sans({ 
  subsets: ["latin"],
  weight: ['400', '500', '700'],
  variable: '--font-dm-sans'
});

// Metadata export is fine in client components for app router
// export const metadata: Metadata = {
// title: "Simple Gemini Chat",
// description: "A simple chat interface powered by Gemini",
// };

// ThemedBody component to handle the theme state
function ThemedBody({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();
  
  // Log theme changes for debugging
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        {/* Add script to unregister service workers */}
        <script dangerouslySetInnerHTML={{ __html: `
          if ('serviceWorker' in navigator) {
            navigator.serviceWorker.getRegistrations().then(function(registrations) {
              for (let registration of registrations) {
                registration.unregister();
              }
            });
            caches.keys().then(function(names) {
              for (let name of names) {
                caches.delete(name);
              }
            });
          }
          // Clear local storage for this domain
          localStorage.clear();
          // Clear session storage for this domain
          sessionStorage.clear();
        `}} />
      </head>
      <AuthProvider>
        <ThemeProvider>
          <ThemedBody>{children}</ThemedBody>
        </ThemeProvider>
      </AuthProvider>
    </html>
  );
}
