/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        marinho: { 50: '#EEF3F8', 100: '#D5E1EC', 200: '#A9C2D8', 300: '#7397B9', 400: '#456F96', 500: '#2A5279', 600: '#1C3D5E', 700: '#0F2A44', 800: '#0B2036', 900: '#071526', 950: '#040D18' },
        esmeralda: { 50: '#ECFDF5', 100: '#D1FAE5', 400: '#34D399', 500: '#10B981', 600: '#059669', 700: '#047857' },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'],
        display: ['"Source Serif 4"', 'Georgia', 'serif'],
      },
    },
  },
  plugins: [],
};
