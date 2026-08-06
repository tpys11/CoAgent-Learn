/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'sans-serif'],
        display: ['Georgia', 'Times New Roman', 'Songti SC', 'STSong', 'SimSun', 'serif'],
      },
      borderRadius: {
        lg: '10px',
        xl: '14px',
        '2xl': '18px',
        '3xl': '24px',
      },
      boxShadow: {
        soft: '0 1px 2px rgba(20,20,20,0.04), 0 4px 16px rgba(20,20,20,0.05)',
        lift: '0 2px 6px rgba(20,20,20,0.06), 0 12px 32px rgba(20,20,20,0.08)',
      },
    },
  },
  plugins: [],
}
