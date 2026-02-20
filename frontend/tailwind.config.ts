/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        "./app/**/*.{js,ts,jsx,tsx,mdx}",
        "./components/**/*.{js,ts,jsx,tsx,mdx}",
    ],
    theme: {
        extend: {
            fontFamily: {
                sans: ["var(--font-inter)", "sans-serif"],
                mono: ["var(--font-jetbrains-mono)", "monospace"],
            },
            colors: {
                brand: {
                    50: "#f0f4ff",
                    100: "#e0eaff",
                    200: "#c7d7fe",
                    300: "#a4bcfd",
                    400: "#8098fb",
                    500: "#6272fa",
                    600: "#4f52ef",
                    700: "#4341d4",
                    800: "#3838aa",
                    900: "#333586",
                    950: "#1e1d4f",
                },
                surface: {
                    DEFAULT: "#0a0b14",
                    1: "#0f1020",
                    2: "#161729",
                    3: "#1d1e35",
                    4: "#252640",
                },
            },
            animation: {
                "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
                "slide-up": "slideUp 0.5s ease-out",
                "fade-in": "fadeIn 0.4s ease-in",
                "ripple": "ripple 1.5s linear infinite",
                "glow": "glow 2s ease-in-out infinite alternate",
            },
            keyframes: {
                slideUp: {
                    "0%": { opacity: "0", transform: "translateY(20px)" },
                    "100%": { opacity: "1", transform: "translateY(0)" },
                },
                fadeIn: {
                    "0%": { opacity: "0" },
                    "100%": { opacity: "1" },
                },
                ripple: {
                    "0%": { transform: "scale(0.8)", opacity: "1" },
                    "100%": { transform: "scale(2.4)", opacity: "0" },
                },
                glow: {
                    "0%": { boxShadow: "0 0 20px rgba(98, 114, 250, 0.3)" },
                    "100%": { boxShadow: "0 0 40px rgba(98, 114, 250, 0.7)" },
                },
            },
        },
    },
    plugins: [],
};
