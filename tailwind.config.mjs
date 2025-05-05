import defaultTheme from 'tailwindcss/defaultTheme';

/** @type {import('tailwindcss').Config} */
const config = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        // Add DM Sans variable as the primary sans-serif font
        sans: ['var(--font-dm-sans)', ...defaultTheme.fontFamily.sans],
      },
    },
  },
  plugins: [],
};

export default config; 