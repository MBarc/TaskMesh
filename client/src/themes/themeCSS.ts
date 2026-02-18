import type { ThemeDefinition } from './themeDefinitions';
import { THEME_COLOR_KEYS } from './themeDefinitions';

const STYLE_ELEMENT_ID = 'taskmesh-themes';

export function generateThemeCSS(theme: ThemeDefinition): string {
  const vars = THEME_COLOR_KEYS
    .map((key) => `  --color-${key}: ${theme.colors[key]};`)
    .join('\n');
  return `[data-theme="${theme.id}"] {\n${vars}\n}`;
}

export function injectAllThemeStyles(themes: ThemeDefinition[]): void {
  let styleEl = document.getElementById(STYLE_ELEMENT_ID) as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = STYLE_ELEMENT_ID;
    document.head.appendChild(styleEl);
  }
  styleEl.textContent = themes.map(generateThemeCSS).join('\n\n');
}
