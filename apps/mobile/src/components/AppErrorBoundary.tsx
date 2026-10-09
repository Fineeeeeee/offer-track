import { Component, type ErrorInfo, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText as Text } from './AppText';
import { AppPressable as Pressable } from './AppPressable';

type Props = { children: ReactNode };
type State = { error: Error | null };

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('OfferJing runtime error', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <View style={styles.screen}>
        <Text style={styles.title}>页面运行失败</Text>
        <Text style={styles.message}>{this.state.error.message || '未知错误'}</Text>
        <Pressable style={styles.button} onPress={() => this.setState({ error: null })}>
          <Text style={styles.buttonText}>重试</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: 'center', gap: 16, padding: 24, backgroundColor: '#F7F6F2' },
  title: { color: '#263238', fontSize: 24, fontWeight: '800' },
  message: { color: '#6B7780', fontSize: 15, lineHeight: 22 },
  button: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: '#334A5A' },
  buttonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
});
