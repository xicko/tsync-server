export interface OneSignalCustomDataType {
  type: string;
  data?: Record<string, any>;
}

export type OneSignalSegmentType =
  | 'Active Subscriptions'
  | 'Total Subscriptions'
  | 'Inactive Subscriptions'
  | 'Engaged Subscriptions';

export interface OneSignalPayloadType {
  app_id: string;
  include_external_user_ids?: string[];
  included_segments?: OneSignalSegmentType[];
  target_channel: 'push' | 'email' | 'sms';
  email_to?: string[];
  headings: Record<string, any>;
  contents: Record<string, any>;
  data?: OneSignalCustomDataType;
  android_channel_id?: string;
}
