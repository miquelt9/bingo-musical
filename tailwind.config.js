/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--pc-font-family)", "monospace"],
        mono: ["var(--pc-font-family)", "monospace"],
      },
      colors: {
        pc: {
          desktop: "var(--pc-desktop-bg)",
          chrome: "var(--pc-chrome-bg)",
          title: "var(--pc-titlebar-bg)",
          text: "var(--pc-text-main)",
          muted: "var(--pc-text-muted)",
          link: "var(--pc-link)",
        },
        brand: {
          50: '#f0fdf4',
          100: '#dcfce7',
          500: '#22c55e',
          600: '#16a34a',
          700: '#15803d',
        },
        youtube: '#FF0000',
      },
    },
  },
  plugins: [],
}
