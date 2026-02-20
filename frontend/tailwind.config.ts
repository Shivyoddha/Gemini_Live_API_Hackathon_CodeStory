/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        "./app/**/*.{js,ts,jsx,tsx,mdx}",
        "./components/**/*.{js,ts,jsx,tsx,mdx}",
    ],
    theme: {
        extend: {
            fontFamily: {
                sans: ["Google Sans", "Roboto", "sans-serif"],
                mono: ["Google Sans Mono", "JetBrains Mono", "monospace"],
            },
            colors: {
                // Google Brand Colors
                "g-blue": "#4285F4",
                "g-red": "#DB4437",
                "g-yellow": "#F4B400",
                "g-green": "#0F9D58",
                "g-blue-light": "#8AB4F8",
                "g-blue-dark": "#1A73E8",
                // Surfaces (light/dark)
                surface: {
                    DEFAULT: "#FFFFFF",
                    1: "#F8F9FA",
                    2: "#F1F3F4",
                    3: "#E8EAED",
                },
                "on-surface": {
                    DEFAULT: "#202124",
                    2: "#5F6368",
                    3: "#80868B",
                },
                border: "#DADCE0",
                // Dark session surfaces
                dark: {
                    surface: "#1A1C20",
                    surface1: "#202124",
                    surface2: "#2C2E33",
                    surface3: "#3C4043",
                },
            },
            borderRadius: {
                "2xl": "16px",
                "3xl": "24px",
            },
            animation: {
                "waveform": "waveform 1.2s ease-in-out infinite",
                "shimmer": "shimmer 1.5s infinite",
                "rec-pulse": "recPulse 1.5s ease-in-out infinite",
            },
        },
    },
    plugins: [],
};
