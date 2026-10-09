export const Theme = {
  colors: {
    bg: '#F8F9FA',
    card: '#FFFFFF',
    surfaceSoft: '#F3F4F6',
    textPrimary: '#111827',
    textSecondary: '#6B7280',
    border: 'rgba(17, 24, 39, 0.06)',
    primary: '#77877F',
    primaryDeep: '#2B3935',
    primaryLight: '#E7ECE8',
    aiAccent: '#7C3AED',
    status: {
      pending: { bg: '#EFF6FF', text: '#1D4ED8' },
      success: { bg: '#ECFDF5', text: '#047857' },
      closed: { bg: '#F3F4F6', text: '#4B5563' },
    },
  },
  radius: {
    control: 8,
    card: 12,
  },
  shadow: {
    paper: {
      shadowColor: '#111827',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.035,
      shadowRadius: 8,
      elevation: 1,
    },
  },
} as const;

export const SCREEN_TOP_GAP = 12;
export const MAX_FONT_SIZE_MULTIPLIER = 1.2;
