import { TailscaleDevice } from './tailscale.interface';

export interface RealtimeNoteMessageType {
  id: string;
  message: string;
  timestamp: number;
  tailscaleDeviceData: Partial<TailscaleDevice>;
}
