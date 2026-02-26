window.tailwind = window.tailwind || {};
window.tailwind.config = {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        obsidian: '#050505',
        'glass-edge': 'rgba(255, 255, 255, 0.15)',
        'glass-inner': 'rgba(10, 10, 10, 0.6)',
        accent: '#8B5CF6',
        neon: '#06b6d4',
        magenta: '#d946ef',
        primary: '#8B5CF6',
        'primary-hover': '#7C3AED',
        highlight: '#d946ef',
        data: '#06b6d4',
        'background-dark': '#020203',
      },
      fontFamily: {
        display: ['Space Grotesk', 'sans-serif'],
        body: ['Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      animation: {
        float: 'float 8s ease-in-out infinite',
        refract: 'refract 4s linear infinite',
        shimmer: 'shimmer 2.5s infinite',
        'pulse-fast': 'pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        scan: 'scan 4s linear infinite',
        'grid-move': 'gridMove 20s linear infinite',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-20px)' },
        },
        refract: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        shimmer: {
          '0%': { opacity: 0.1 },
          '50%': { opacity: 0.4 },
          '100%': { opacity: 0.1 },
        },
        scan: {
          '0%': { top: '0%' },
          '100%': { top: '100%' },
        },
        gridMove: {
          '0%': { transform: 'translateY(0)' },
          '100%': { transform: 'translateY(40px)' },
        },
      },
    },
  },
};
