/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,jsx}',
    './components/**/*.{js,jsx}',
  ],
  theme: {
    extend: {
      // ポケモンスリープ風の明るい配色
      colors: {
        sleep: {
          blue: '#1c9dff',
          deep: '#0f7ae5',
          sky: '#4fc3f7',
          cyan: '#6ee7ff',
          green: '#1ed760',
          greendeep: '#12b76a',
          coral: '#ff6b57',
          orange: '#ffa726',
          teal: '#26c6da',
          yellow: '#ffca28',
          pink: '#f06292',
          purple: '#ab7be8',
        },
      },
      borderRadius: {
        '4xl': '2rem',
      },
    },
  },
  plugins: [],
}
