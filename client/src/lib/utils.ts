import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
export const getSearchHistory = (): string[] => {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem("searchHistory") || "[]");
  } catch {
    return [];
  }
};

export const addToSearchHistory = (username: string) => {
  let history = getSearchHistory();

  // prevent duplicates, put latest on top
  history = history.filter((u) => u !== username);
  history.unshift(username);

  // limit to 5 or 10 items
  if (history.length > 10) history = history.slice(0, 10);

  localStorage.setItem("searchHistory", JSON.stringify(history));
};
