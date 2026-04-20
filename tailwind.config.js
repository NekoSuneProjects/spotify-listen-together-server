/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        spotify: {
          50: '#effef5',
          100: '#d8fce6',
          200: '#b5f7cf',
          300: '#82edae',
          400: '#45dd84',
          500: '#1db954',
          600: '#149846',
          700: '#11783a',
          800: '#125f31',
          900: '#114e2b',
        },
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(29,185,84,0.18), 0 24px 80px rgba(0,0,0,0.45)',
      },
      backgroundImage: {
        'hero-radial':
          'radial-gradient(circle at top left, rgba(29,185,84,0.24), transparent 32%), radial-gradient(circle at top right, rgba(22,163,74,0.18), transparent 28%), linear-gradient(180deg, #07110b 0%, #0a120d 24%, #050806 100%)',
      },
      animation: {
        float: 'float 8s ease-in-out infinite',
        pulsebar: 'pulsebar 1.6s ease-in-out infinite',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-8px)' },
        },
        pulsebar: {
          '0%, 100%': { opacity: '0.45', transform: 'scaleY(0.72)' },
          '50%': { opacity: '1', transform: 'scaleY(1)' },
        },
      },
    },
  },
  plugins: [],
}
