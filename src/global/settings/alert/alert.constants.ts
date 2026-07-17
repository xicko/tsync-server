/* eslint-disable prettier/prettier */
import { GlobalAlertSettings } from "./alert.interface";

export const DEFAULT_GLOBAL_NOTIFICATION_SETTINGS: GlobalAlertSettings = {
  enabled: false,
  denylist: [], // array of tailscale device IDs
};
