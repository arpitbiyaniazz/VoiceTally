import { useContext } from 'react';
import { ThemeContext, type ThemeContextType } from './themeContextDef';

const defaultThemeFallback: ThemeContextType = {
  theme: 'dark',
  toggleTheme: () => {},
  setTheme: () => {},
};

export function useTheme(): ThemeContextType {
  const context = useContext(ThemeContext);
  return context || defaultThemeFallback;
}

