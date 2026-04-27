/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#E10600',
          light: '#FF2B26',
        }
      },
      fontFamily: {
        sans: ['Titillium Web', 'Inter', 'sans-serif'],
        display: ['Titillium Web', 'sans-serif'],
        mono: ['Space Grotesk', 'monospace'],
      },
    },
  },
  plugins: [],
}
