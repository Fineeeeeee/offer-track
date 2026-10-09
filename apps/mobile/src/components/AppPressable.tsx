import * as Haptics from 'expo-haptics';
import { useRef } from 'react';
import {
  Animated,
  Pressable,
  type PressableProps,
  type PressableStateCallbackType,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

export type HapticKind = 'light' | 'selection' | 'success' | 'none';

export type AppPressableProps = Omit<PressableProps, 'style'> & {
  style?: StyleProp<ViewStyle> | ((state: PressableStateCallbackType) => StyleProp<ViewStyle>);
  haptic?: HapticKind;
  scaleTo?: number;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function AppPressable({
  children,
  disabled,
  haptic = 'none',
  onPress,
  onPressIn,
  onPressOut,
  scaleTo = 0.97,
  style,
  ...props
}: AppPressableProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  const animatePressIn = () => {
    Animated.parallel([
      Animated.timing(scale, { toValue: scaleTo, duration: 80, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0.82, duration: 80, useNativeDriver: true }),
    ]).start();
  };

  const animatePressOut = () => {
    Animated.parallel([
      Animated.spring(scale, {
        toValue: 1,
        damping: 18,
        stiffness: 150,
        mass: 0.7,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, { toValue: 1, duration: 130, useNativeDriver: true }),
    ]).start();
  };

  return (
    <AnimatedPressable
      {...props}
      disabled={disabled}
      onPressIn={(event) => {
        if (!disabled) animatePressIn();
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        animatePressOut();
        onPressOut?.(event);
      }}
      onPress={(event) => {
        if (!disabled) triggerAppHaptic(haptic);
        onPress?.(event);
      }}
      style={[
        typeof style === 'function' ? style({ pressed: false }) : style,
        { opacity, transform: [{ scale }] },
      ]}
    >
      {children}
    </AnimatedPressable>
  );
}

export function triggerAppHaptic(kind: HapticKind) {
  if (kind === 'none') return;
  const feedback = kind === 'selection'
    ? Haptics.selectionAsync()
    : kind === 'success'
      ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      : Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  void feedback.catch(() => undefined);
}
