/* eslint-disable prettier/prettier */
export interface TailscaleClientConnectivity {
  endpoints?: string[];
  mappingVariesByDestIP?: boolean;
  latency?: Record<
    string,
    {
      preferred?: boolean;
      latencyMs?: number;
    }
  >;
  clientSupports?: {
    hairPinning?: boolean | null;
    ipv6?: boolean | null;
    pcp?: boolean | null;
    pmp?: boolean | null;
    udp?: boolean | null;
    upnp?: boolean | null;
  };
}

export interface TailscalePostureIdentity {
  serialNumbers?: string[];
  disabled?: boolean;
}

export interface TailscaleDistro {
  name?: string;
  version?: string;
  codeName?: string;
}

export interface TailscaleDevice {
  addresses: string[];
  id: string;
  nodeId: string;
  user: string;
  name: string;
  hostname: string;
  clientVersion: string;
  updateAvailable: boolean;
  os: string;
  created: string;
  connectedToControl: boolean;
  lastSeen?: string;
  keyExpiryDisabled: boolean;
  expires: string;
  authorized: boolean;
  isExternal: boolean;
  multipleConnections?: boolean;
  machineKey: string;
  nodeKey: string;
  blocksIncomingConnections: boolean;
  enabledRoutes: string[];
  advertisedRoutes: string[];
  clientConnectivity?: TailscaleClientConnectivity;
  tags: string[];
  tailnetLockError: string;
  tailnetLockKey: string;
  sshEnabled: boolean;
  postureIdentity?: TailscalePostureIdentity;
  isEphemeral: boolean;
  distro?: TailscaleDistro;

  isHost?: boolean;
  isThisDevice?: boolean;

  androidConfig?: {
    adb?: {
      port?: number;
    };
    battery?: BatteryStatus;
  };

  windowsConfig?: {
    macAddress?: string;
  };
}

export interface TailscaleDevicesResponse {
  devices: TailscaleDevice[];
}

export interface BatteryStatus {
  level: number;
  plugged: boolean;
  timestamp: number;
}
