export const colors = {
  navy950: '#060E1A',
  navy900: '#0A1628',
  navy800: '#0F1F38',
  navy700: '#13294B',
  navy600: '#1A3560',
  ocean500: '#1E5A8A',
  ocean300: '#4FA3D9',
  steel600: '#4A5A70',
  steel400: '#8A9BB0',
  steel200: '#C3CFDC',
  steel100: '#E3E9F0',
  signalRed: '#E53935',
  signalRedDark: '#9E1F1C',
  fireOrange: '#FF8F00',
  radarGreen: '#3DDC97',
  brass: '#D4A93A',
  brassDark: '#8E6E1F',
  missWhite: '#CFD8DC',
  bronze: '#B8733A',
  silver: '#B8C4D0',
  gold: '#E8C14A',
  overlay: 'rgba(6, 14, 26, 0.82)',
  panel: 'rgba(19, 41, 75, 0.88)',
  transparent: 'transparent',
} as const;

export const fonts = {
  heading: 'BlackOpsOne_400Regular',
  body: 'Rajdhani_500Medium',
  bodySemi: 'Rajdhani_600SemiBold',
  bodyBold: 'Rajdhani_700Bold',
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radii = { sm: 6, md: 10, lg: 16, pill: 999 } as const;

export const text = {
  hero: { fontFamily: fonts.heading, fontSize: 40, color: colors.steel100, letterSpacing: 2 },
  title: { fontFamily: fonts.heading, fontSize: 26, color: colors.steel100, letterSpacing: 1.5 },
  heading: { fontFamily: fonts.heading, fontSize: 18, color: colors.steel100, letterSpacing: 1 },
  body: { fontFamily: fonts.body, fontSize: 16, color: colors.steel100 },
  bodyBold: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.steel100 },
  caption: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.steel400, letterSpacing: 0.5 },
  label: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.steel400, letterSpacing: 1.5 },
} as const;
