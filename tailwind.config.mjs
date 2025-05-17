import defaultTheme from 'tailwindcss/defaultTheme';

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class', // Keep class-based dark mode
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  safelist: [
    'dark',
    'theme-dark',
    'dark:bg-[#161616]',
    'dark:text-[#F9FAFB]',
    'dark:bg-[#292929]',
    'dark:bg-[#1E1E1E]',
    'dark:border-[#2F2F2E]',
    'dark:border-transparent'
  ],
  theme: {
    extend: {
      fontFamily: {
        // Add DM Sans variable as the primary sans-serif font
        sans: ['var(--font-dm-sans)', ...defaultTheme.fontFamily.sans],
      },
      // You can add dark mode specific colors here if needed, or use dark: prefix
      // For example:
      // colors: {
      //   dark: {
      //     surface: '#161616',
      //     textPrimary: '#F9FAFB',
      //     // ... other dark theme colors
      //   }
      // }
    },
  },
  plugins: [],
}; 