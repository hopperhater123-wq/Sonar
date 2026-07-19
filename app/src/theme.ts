// Hell/Dunkel-Umschalter. Initialwert setzt index.html vor dem ersten Paint.

export type Theme = "dark" | "light";

export function currentTheme(): Theme {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

export function toggleTheme(): Theme {
  const next: Theme = currentTheme() === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  localStorage.setItem("sonar-theme", next);
  return next;
}
