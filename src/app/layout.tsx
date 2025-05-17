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
      <AuthProvider>
        <ThemeProvider>
          <ThemedBody>{children}</ThemedBody>
        </ThemeProvider>
      </AuthProvider>
    </html>
  );
}
