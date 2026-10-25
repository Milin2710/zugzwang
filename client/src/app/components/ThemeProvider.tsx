"use client";

import React, {
  createContext,
  useState,
  useEffect,
  ReactNode,
  useContext,
} from "react";

const themes = ["pink", "blue", "yellow", "green", "gray"];

interface ThemeContextType {
  theme: string;
  changetheme: () => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: "pink",
  changetheme: () => {},
});

export const useTheme = () => useContext(ThemeContext);

export default function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState("pink");

  useEffect(() => {
    const stored = localStorage.getItem("theme");
    if (stored && themes.includes(stored)) {
      setTheme(stored);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("theme", theme);
  }, [theme]);

  const changetheme = () => {
    const currentIndex = themes.indexOf(theme);
    const nextIndex = (currentIndex + 1) % themes.length;
    setTheme(themes[nextIndex]);
  };

  return (
    <ThemeContext.Provider value={{ theme, changetheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
