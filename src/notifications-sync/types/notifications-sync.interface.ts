// ======================================
export type CollectedNotification =
  | CollectedNotificationAndroid
  | CollectedNotificationWindows;

// Android ======================================
export interface CollectedNotificationAndroid {
  type: 'android';
  android: CollectedNotificationAndroidData;
}
export interface CollectedNotificationAndroidData {
  packageName: string;
  timestamp: number;
  title: string;
  text: string;
  bigText: string;
  infoText: string;
  titleBig: string;
  conversationTitle: string;
  peopleList: string;
}

// Windows (TODO) ======================================
export interface CollectedNotificationWindows {
  type: 'windows';
  windows: CollectedNotificationWindowsData;
}
export interface CollectedNotificationWindowsData {
  // Placeholders
  timestamp: number;
  title: string;
  text: string;
}
