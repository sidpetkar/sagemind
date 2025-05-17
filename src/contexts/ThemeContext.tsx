'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextProps {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextProps | undefined>(undefined);

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const [theme, setTheme] = useState<Theme>('light'); // Default to light

  // Initialize theme from localStorage or system preference
  useEffect(() => {
    // Get stored theme or check system preference
    const storedTheme = localStorage.getItem('theme') as Theme | null;
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    console.log('[ThemeContext] Initializing theme. Stored:', storedTheme, 'Prefers Dark:', prefersDark);
    
    // Determine which theme to use
    let initialTheme: Theme;
    if (storedTheme) {
      initialTheme = storedTheme;
    } else if (prefersDark) {
      initialTheme = 'dark';
    } else {
      initialTheme = 'light';
    }
    
    // Set theme state
    setTheme(initialTheme);
    
    // Apply theme class immediately on mount
    if (initialTheme === 'dark') {
      document.documentElement.classList.add('theme-dark');
      document.documentElement.classList.add('dark');
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.classList.remove('theme-dark');
      document.documentElement.classList.remove('dark');
      document.documentElement.setAttribute('data-theme', 'light');
    }
  }, []);

  // Apply theme changes when theme state changes
  useEffect(() => {
    console.log('[ThemeContext] Theme changed to:', theme);
    
    // Apply theme by adding/removing class on html element
    if (theme === 'dark') {
      document.documentElement.classList.add('theme-dark');
      document.documentElement.classList.add('dark');
      document.documentElement.setAttribute('data-theme', 'dark');
      
      // Force a refresh for stubborn styles
      setTimeout(() => {
        document.body.style.backgroundColor = '';
        document.body.style.color = '';
      }, 0);
    } else {
      document.documentElement.classList.remove('theme-dark');
      document.documentElement.classList.remove('dark');
      document.documentElement.setAttribute('data-theme', 'light');
      
      // Force a refresh for stubborn styles
      setTimeout(() => {
        document.body.style.backgroundColor = '';
        document.body.style.color = '';
      }, 0);
    }
    
    // Save to localStorage
    localStorage.setItem('theme', theme);
    
    // Log for debugging
    console.log('[ThemeContext] Applied theme:', theme);
    console.log('[ThemeContext] HTML classes:', document.documentElement.className);
  }, [theme]);

  // Toggle theme function
  const toggleTheme = () => {
    console.log('[ThemeContext] Toggle theme clicked');
    const currentHtmlClasses = document.documentElement.className;
    console.log('[ThemeContext] Current HTML classes:', currentHtmlClasses);
    
    setTheme(prevTheme => {
      const newTheme = prevTheme === 'light' ? 'dark' : 'light';
      console.log('[ThemeContext] Changing theme from', prevTheme, 'to', newTheme);
      
      // Log the current state for debugging
      requestAnimationFrame(() => {
        console.log('[ThemeContext] After theme change, HTML classes:', document.documentElement.className);
        console.log('[ThemeContext] Body data-theme attribute:', document.body.getAttribute('data-theme'));
      });
      
      return newTheme;
    });
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextProps => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}; 