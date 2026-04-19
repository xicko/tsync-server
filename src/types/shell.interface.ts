export interface ShellEventPayload {
  deviceId: string;
  type: 'ADB';
  command: string;
}
