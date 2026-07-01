/** @type {import('tailwindcss').Config} */
const colors = require("tailwindcss/colors");

// 把某个语义色（rose/red/emerald…）的 100/200/300 三档接到 CSS 变量上，
// 其余档位沿用 Tailwind 默认。这样浅色主题可把这三档「反转」成深色，
// 修复大量原为深底设计的 text-<color>-100/200/300 在白底上看不清的问题；
// 深色主题下变量值=Tailwind 原值，外观不变。
function themed(name) {
  return {
    ...colors[name],
    100: `rgb(var(--c-${name}-100) / <alpha-value>)`,
    200: `rgb(var(--c-${name}-200) / <alpha-value>)`,
    300: `rgb(var(--c-${name}-300) / <alpha-value>)`,
  };
}

module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx}",
    "../../../packages/editor/src/**/*.{ts,tsx}",
  ],
  darkMode: ["class", "html.theme-dark"],
  theme: {
    extend: {
      // B3: indeterminate progress bar animation —— 来回扫光
      animation: {
        "indeterminate-progress": "indeterminate-progress 1.5s ease-in-out infinite",
      },
      keyframes: {
        "indeterminate-progress": {
          "0%": { transform: "translateX(-100%)" },
          "50%": { transform: "translateX(200%)" },
          "100%": { transform: "translateX(-100%)" },
        },
      },
      colors: {
        // 语义状态色：仅 100/200/300 走主题变量（见 styles.css 的 --c-* 定义）。
        rose: themed("rose"),
        red: themed("red"),
        emerald: themed("emerald"),
        green: themed("green"),
        sky: themed("sky"),
        blue: themed("blue"),
        violet: themed("violet"),
        fuchsia: themed("fuchsia"),
        indigo: themed("indigo"),
        orange: themed("orange"),
        yellow: themed("yellow"),
        ink: {
          50: "rgb(var(--ink-50) / <alpha-value>)",
          100: "rgb(var(--ink-100) / <alpha-value>)",
          200: "rgb(var(--ink-200) / <alpha-value>)",
          300: "rgb(var(--ink-300) / <alpha-value>)",
          400: "rgb(var(--ink-400) / <alpha-value>)",
          500: "rgb(var(--ink-500) / <alpha-value>)",
          600: "rgb(var(--ink-600) / <alpha-value>)",
          700: "rgb(var(--ink-700) / <alpha-value>)",
          800: "rgb(var(--ink-800) / <alpha-value>)",
          900: "rgb(var(--ink-900) / <alpha-value>)",
        },
        // 强调色统一走 CSS 变量 --accent-*（苹果系统蓝，可随主题切换深浅）。
        accent: {
          50: "rgb(var(--accent-50) / <alpha-value>)",
          100: "rgb(var(--accent-100) / <alpha-value>)",
          200: "rgb(var(--accent-200) / <alpha-value>)",
          300: "rgb(var(--accent-300) / <alpha-value>)",
          400: "rgb(var(--accent-400) / <alpha-value>)",
          500: "rgb(var(--accent-500) / <alpha-value>)",
          600: "rgb(var(--accent-600) / <alpha-value>)",
          700: "rgb(var(--accent-700) / <alpha-value>)",
          800: "rgb(var(--accent-800) / <alpha-value>)",
          900: "rgb(var(--accent-900) / <alpha-value>)",
        },
      },
    },
  },
  plugins: [],
};
