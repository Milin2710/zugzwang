import { fontFamily } from "tailwindcss/defaultTheme";

const token = (name) => `hsl(var(--${name}) / <alpha-value>)`;

export default {
  darkMode: ["class"],
  content: ["./src/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        border: token("border"),
        input: token("input"),
        ring: token("ring"),
        background: token("background"),
        foreground: token("foreground"),
        card: { DEFAULT: token("card"), foreground: token("card-foreground") },
        muted: { DEFAULT: token("muted"), foreground: token("muted-foreground") },
        accent: { DEFAULT: token("accent"), foreground: token("accent-foreground") },
        primary: { DEFAULT: token("primary"), foreground: token("primary-foreground") },
        secondary: { DEFAULT: token("secondary"), foreground: token("secondary-foreground") },
        destructive: { DEFAULT: token("destructive"), foreground: token("destructive-foreground") },
        ink: token("ink"),
        win: token("win"),
        loss: token("loss"),
        draw: token("draw"),
      },
      borderRadius: { lg: "10px", md: "6px", sm: "3px" },
      fontFamily: {
        sans: ["var(--font-archivo)", ...fontFamily.sans],
        mono: ["var(--font-jetbrains)", ...fontFamily.mono],
      },
    },
  },
  plugins: [],
};
