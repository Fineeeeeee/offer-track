import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function configureLocalNotifications() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('interview-reminders', {
      name: '面试与跟进提醒',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 180, 120, 180],
    });
  }
}

export function subscribeToInterviewNotificationResponses(onOpenInterview: (interviewId: number) => void) {
  const open = (response: Notifications.NotificationResponse | null) => {
    const interviewId = readInterviewId(response);
    if (interviewId !== null) {
      onOpenInterview(interviewId);
      void Notifications.clearLastNotificationResponseAsync().catch(() => undefined);
    }
  };
  const subscription = Notifications.addNotificationResponseReceivedListener(open);
  void Notifications.getLastNotificationResponseAsync().then(open).catch(() => undefined);
  return () => subscription.remove();
}

export function readInterviewId(response: Notifications.NotificationResponse | null) {
  const value = response?.notification.request.content.data?.interviewId;
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) return value;
  if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value);
  return null;
}

export async function scheduleInterviewReminder({
  interviewId,
  date,
  title,
  body,
}: {
  interviewId: number;
  date: Date;
  title: string;
  body: string;
}) {
  if (date.getTime() <= Date.now()) throw new Error('提醒时间必须晚于当前时间。');
  const permission = await Notifications.getPermissionsAsync();
  const granted = permission.granted ? permission : await Notifications.requestPermissionsAsync();
  if (!granted.granted) throw new Error('通知权限未开启，请在系统设置中允许 OfferJing 发送通知。');

  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((item) => item.content.data?.interviewId === interviewId)
      .map((item) => Notifications.cancelScheduledNotificationAsync(item.identifier)),
  );
  return Notifications.scheduleNotificationAsync({
    content: { title, body, sound: true, data: { interviewId } },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date, channelId: 'interview-reminders' },
  });
}
