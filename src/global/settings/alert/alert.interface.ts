export interface GlobalAlertSettings {
  enabled: boolean; // global flag
  denylist: string[]; // array of tailscale device IDs
}
