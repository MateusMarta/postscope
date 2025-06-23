/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./viewer.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Roboto', 'Arial', 'sans-serif'],
      },
    },
  },
  plugins: [],
}