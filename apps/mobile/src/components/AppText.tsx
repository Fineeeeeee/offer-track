import type { TextInputProps, TextProps } from 'react-native';
import { Text as NativeText, TextInput as NativeTextInput } from 'react-native';
import { MAX_FONT_SIZE_MULTIPLIER } from '../theme';

export function AppText({ allowFontScaling = true, maxFontSizeMultiplier = MAX_FONT_SIZE_MULTIPLIER, ...props }: TextProps) {
  return <NativeText allowFontScaling={allowFontScaling} maxFontSizeMultiplier={maxFontSizeMultiplier} {...props} />;
}

export function AppTextInput({ allowFontScaling = true, maxFontSizeMultiplier = MAX_FONT_SIZE_MULTIPLIER, ...props }: TextInputProps) {
  return <NativeTextInput allowFontScaling={allowFontScaling} maxFontSizeMultiplier={maxFontSizeMultiplier} {...props} />;
}
