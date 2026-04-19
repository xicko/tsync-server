/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/no-floating-promises */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable prettier/prettier */
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { TailscaleDevice } from 'src/types/tailscale.interface';
import { runCommandSpawn } from 'src/utils/shell';
import { OneSignal } from 'src/utils/onesignal';
import { RealtimeNoteMessageType } from 'src/types/realtimenote.interface';
import getRedisClient from 'src/utils/redis';
import { ShellEventPayload } from 'src/types/shell.interface';

// helper
async function getAdbIdentifier(tailscaleDeviceId: string): Promise<string | null> {
  const redisClient = await getRedisClient();
  const devices = await redisClient.get('devices');
  if (devices && typeof devices === 'string') {
    const devicesParsed: TailscaleDevice[] = JSON.parse(devices);
    const device = devicesParsed.find((d) => d.id === tailscaleDeviceId);
    if (device) return device.adbIdentifier || null;
  }
  return null;
}

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class EventsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(EventsGateway.name);

  afterInit() {
    this.logger.log('WebSocket gateway initialized');
  }

  handleConnection(client: Socket) {
    // prettier-ignore
    this.logger.log(`Client connected: ${client.id} ${(client.handshake?.query as unknown as TailscaleDevice)?.name || ''}`);
  }

  handleDisconnect(client: Socket) {
    // prettier-ignore
    this.logger.log(`Client disconnected: ${client.id} ${(client.handshake?.query as unknown as TailscaleDevice)?.name || ''}`);
  }

  @SubscribeMessage('message')
  async handleMessage(
    @MessageBody() rawData: string,
    @ConnectedSocket() client: Socket,
  ): Promise<void> {
    this.logger.log(`Message from ${client.id}: ${rawData}`);
    // broadcast to all connected clients
    this.server.emit('message', { senderId: client.id, rawData });

    // ADB COMMANDS
    (async () => {
      // parse shell event payload
      const data = (() => {
        try {
          return JSON.parse(rawData) as ShellEventPayload;
        } catch (error) {
          this.logger.debug(`Error parsing shell event payload: ${error}`);
          return null;
        }
      })();
      if (!data || data.type !== 'ADB' || typeof data !== 'object') return;

      const [tailscaleDeviceId, rawCommand] = [data.deviceId, data.command];
      if (!rawCommand || rawCommand.length === 0) return;
      if (!tailscaleDeviceId || tailscaleDeviceId.length === 0) return;

      const adbIdentifier: string | null = await getAdbIdentifier(tailscaleDeviceId);
      if (!adbIdentifier) {
        this.logger.error(`Device not found for tailscaleDeviceId: ${tailscaleDeviceId}`);
        this.server.emit('shell_stdout', 'Error: Device not found.');
        return;
      }

      const parts = rawCommand.trim().split(/\s+/);
      const command = 'adb';
      const args = parts;

      const result = await runCommandSpawn(command, ['-s', adbIdentifier, ...args]);

      this.logger.log(result);
      this.server.emit('shell_stdout', result);
    })();

    // ADB UNLOCK
    const unlockAndroidPrefix = 'adb_unlock:';
    (async () => {
      if (!rawData.startsWith(unlockAndroidPrefix)) return;

      const [_, tailscaleDeviceId, password] = rawData.split(':');
      if (!password || password.length === 0) return;
      if (!tailscaleDeviceId || tailscaleDeviceId.length === 0) return;

      const adbIdentifier: string | null = await getAdbIdentifier(tailscaleDeviceId);
      if (!adbIdentifier) {
        this.logger.error(`Device not found for tailscaleDeviceId: ${tailscaleDeviceId}`);
        this.server.emit('shell_stdout', 'Error: Device not found.');
        return;
      }

      await runCommandSpawn('sh', ['./src/scripts/shell/unlock.sh', password, adbIdentifier]);
    })();
  }










  // REALTIME NOTE
  @SubscribeMessage('realtimeNote')
  async handleRealtimeNote(
    @MessageBody() data: string,
    @ConnectedSocket() client: Socket,
  ): Promise<void> {
    this.logger.log(`Realtime note from ${client.id}: ${data}`);

    this.server.emit('realtimeNote', { senderId: client.id, data });

    const message: RealtimeNoteMessageType = JSON.parse(data);

    if (!message.tailscaleDeviceData.name) return;
    
    void OneSignal
      .create()
      .title('REALTIME NOTE')
      .message(`${message.tailscaleDeviceData.name.split('.')[0]}: ${message.message}`)
      .rest({
        priority: 10,
      })
      .sendPush({ isImportant: true });
  }
}
