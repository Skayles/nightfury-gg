/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Subject-grounded palette: deep client-night blue + hextech teal + gold win / garnet loss
        night: '#0B1622',
        panel: '#0F1E2E',
        panel2: '#132A3E',
        edge: '#1E3A52',
        teal: '#2DD4BF',
        gold: '#C8A04A',
        win: '#2E9E7B',
        loss: '#C0435A',
        mute: '#7C93A8'
      },
      fontFamily: {
        display: ['"Beaufort for LOL"', 'Georgia', 'serif'],
        body: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace']
      }
    }
  },
  plugins: []
}
