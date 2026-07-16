export const colors = {
  primary:        '#2d6a4f',
  primaryLight:   '#e8f5e9',
  primaryDark:    '#085041',
  primaryMuted:   '#95d5b2',
  accent:         '#c71418',
  accentLight:    '#fce9e9',
  white:          '#ffffff',
  background:     '#f5f5f5',
  card:           '#ffffff',
  border:         '#e0e0e0',
  textPrimary:    '#222222',
  textSecondary:  '#666666',
  textMuted:      '#999999',
  textGhost:      '#c9c9c9',
  textOnPrimary:  '#ffffff',
  danger:         '#c0392b',
  dangerLight:    '#fdecea',
  warning:        '#BA7517',
  warningLight:   '#fff3e0',
  info:           '#1565c0',
  infoLight:      '#e3f2fd',
  success:        '#2d6a4f',
  successLight:   '#e8f5e9',
  amber:          '#FFD700',
}

export const spacing = {
  xs:   4,
  sm:   8,
  md:   12,
  lg:   16,
  xl:   20,
  xxl:  24,
  xxxl: 32,
}

// Strict radius scale. Cards/containers = lg (12), controls (buttons/inputs)
// = md (8), chips/small = sm (6), pills/avatars = full. Cards are flat:
// hairline border, no shadow.
export const radius = {
  sm:   6,
  md:   8,
  card: 12,
  lg:   12,
  xl:   16,
  full: 999,
}

export const typography = {
  sizeXs:       11,
  sizeSm:       13,
  sizeMd:       15,
  sizeLg:       17,
  sizeXl:       20,
  sizeXxl:      26,
  sizeDisplay:  32,
  weightRegular: '400',
  weightMedium:  '500',
  weightBold:    '600',
  lineHeightBody: 1.6,
}

export const elevation = {
  level0: {},
  level1: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  level2: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.10,
    shadowRadius: 12,
    elevation: 6,
  },
}

export const touchTarget = {
  minHeight: 44,
  minWidth:  44,
}
