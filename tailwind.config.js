/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        'chat-bg': '#0f0f23',
        'chat-surface': '#1a1a2e',
        'chat-surface-elevated': '#16213e',
        'chat-border': '#2a2a3e',
        'chat-text': '#e8e8f0',
        'chat-text-muted': '#9ca3af',
        'chat-input': '#1f2937',
        'chat-input-border': '#374151',
        'chat-primary': '#6366f1',
        'chat-primary-hover': '#4f46e5',
        'chat-secondary': '#8b5cf6',
        'chat-accent': '#ec4899',
        'chat-user-avatar': '#6366f1',
        'chat-assistant-bg': '#1e1b4b',
        'chat-card': '#1a1a2e',
        'chat-card-hover': '#16213e',
      },
      backgroundImage: {
        'gradient-primary': 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        'gradient-secondary': 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
        'gradient-accent': 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
      },
      keyframes: {
        typing: {
          '0%, 60%, 100%': {
            transform: 'translateY(0)',
            opacity: '0.7',
          },
          '30%': {
            transform: 'translateY(-10px)',
            opacity: '1',
          },
        },
      },
      animation: {
        typing: 'typing 1.4s infinite',
      },
    },
  },
  plugins: [],
}
