export interface Theme {
  background: string;
  surface: string;
  surfaceBorder: string;
  text: string;
  textMuted: string;
  primary: string;
  primaryText: string;
}

export const lightTheme: Theme = {
  background: '#F1F5F9',
  surface: '#FFFFFF',
  surfaceBorder: '#E2E8F0',
  text: '#0F172A',
  textMuted: '#64748B',
  primary: '#2563EB',
  primaryText: '#FFFFFF',
};

export const darkTheme: Theme = {
  background: '#0F172A',
  surface: '#1E293B',
  surfaceBorder: '#334155',
  text: '#F1F5F9',
  textMuted: '#94A3B8',
  primary: '#3B82F6',
  primaryText: '#FFFFFF',
};
