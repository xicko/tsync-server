/* eslint-disable prettier/prettier */
import { GlobalAlertSettings } from "./alert/alert.interface";
import { GlobalWolSettings } from "./wol/wol.interface";

export interface GlobalSettings {
  alert?: GlobalAlertSettings;
  wol?: GlobalWolSettings;
}
