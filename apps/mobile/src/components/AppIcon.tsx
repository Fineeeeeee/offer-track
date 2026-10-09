import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';

export type AppIconName =
  | 'add'
  | 'attachment'
  | 'back'
  | 'calendar'
  | 'clock'
  | 'check'
  | 'chevron'
  | 'chevronDown'
  | 'circle'
  | 'close'
  | 'copy'
  | 'filter'
  | 'globe'
  | 'home'
  | 'import'
  | 'interviews'
  | 'jobs'
  | 'link'
  | 'marker'
  | 'mockInterview'
  | 'more'
  | 'moveDown'
  | 'moveUp'
  | 'pause'
  | 'play'
  | 'profile'
  | 'record'
  | 'search'
  | 'sparkles'
  | 'stop'
  | 'trash'
  | 'upload'
  | 'offer';

const iconNames: Record<AppIconName, ComponentProps<typeof Ionicons>['name']> = {
  add: 'add',
  attachment: 'image-outline',
  back: 'chevron-back',
  calendar: 'calendar-outline',
  clock: 'time-outline',
  check: 'checkmark',
  chevron: 'chevron-forward',
  chevronDown: 'chevron-down',
  circle: 'ellipse-outline',
  close: 'close',
  copy: 'copy-outline',
  filter: 'options-outline',
  globe: 'globe-outline',
  home: 'home-outline',
  import: 'scan-outline',
  interviews: 'mic-outline',
  jobs: 'briefcase-outline',
  link: 'link-outline',
  marker: 'bookmark-outline',
  mockInterview: 'sparkles-outline',
  more: 'ellipsis-horizontal',
  moveDown: 'arrow-down',
  moveUp: 'arrow-up',
  pause: 'pause',
  play: 'play',
  profile: 'person-circle-outline',
  record: 'ellipse',
  search: 'search-outline',
  sparkles: 'sparkles',
  stop: 'square',
  trash: 'trash-outline',
  upload: 'cloud-upload-outline',
  offer: 'trophy-outline',
};

export function AppIcon({
  name,
  size = 20,
  color = '#6B7280',
}: {
  name: AppIconName;
  size?: number;
  color?: string;
}) {
  return <Ionicons name={iconNames[name]} size={size} color={color} />;
}
