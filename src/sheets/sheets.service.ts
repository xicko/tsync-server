import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { GoogleAuth } from 'google-auth-library';
import { SheetRow } from '../schemas/sheet-row.schema';
import { TableColumnType } from '../types/sheets.interface';
import { convertToType, hashRow } from '../utils/sheets';
import getRedisClient from '../utils/redis';
import { OneSignal } from '../utils/onesignal';

const REDIS_ROW_PREFIX = 'sheet:row:';

@Injectable()
export class SheetsService {
  private readonly logger = new Logger(SheetsService.name);
  private gcloudAuth: GoogleAuth;

  constructor(
    @InjectModel(SheetRow.name) private sheetRowModel: Model<SheetRow>,
  ) {
    this.gcloudAuth = new GoogleAuth({
      scopes: 'https://www.googleapis.com/auth/spreadsheets',
      credentials: {
        client_email: process.env.SHEETS_GOOGLE_SERVICE_ACCOUNT_EMAIL || '',
        private_key:
          process.env.SHEETS_GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(
            /\\n/g,
            '\n',
          ) || '',
      },
    });
  }

  async getGCloudAccessToken(): Promise<string> {
    const client = await this.gcloudAuth.getClient();
    const tokenResponse = await client.getAccessToken();
    return tokenResponse.token || '';
  }

  async syncSheet() {
    const accessToken = await this.getGCloudAccessToken();
    const baseUrl = 'https://sheets.googleapis.com/v4/spreadsheets/';
    const url = new URL(
      baseUrl + process.env.SHEET_ID + '/values/Sheet1!A1:F100',
    );

    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const resJson = (await res.json()) as {
        range: string;
        majorDimension: string;
        values: string[][];
      };

      if (!resJson.values || resJson.values.length === 0) {
        return resJson;
      }

      // Convert raw rows - 1
      const liveRows: TableColumnType[] = [];
      for (const r of resJson.values) {
        const converted = convertToType(r);
        if (converted) liveRows.push(converted);
      }

      const redisClient = await getRedisClient();

      // Fetch all existing Redis keys for sheet rows - 2
      const existingKeys = (await redisClient.keys(
        `${REDIS_ROW_PREFIX}*`,
      )) as string[];
      const existingIdSet = new Set(
        existingKeys.map((k) => String(k).replace(REDIS_ROW_PREFIX, '')),
      );

      const liveIdSet = new Set(liveRows.map((r) => r.id));

      let newCount = 0;
      let updatedCount = 0;
      let unchangedCount = 0;

      // Detect new / updated / unchanged rows - 3
      for (const row of liveRows) {
        const hash = hashRow(row);
        const redisKey = `${REDIS_ROW_PREFIX}${row.id}`;
        const storedHash = (await redisClient.get(redisKey)) as string | null;

        if (storedHash === null) {
          // NEW: never seen before
          await this.sheetRowModel.findOneAndUpdate(
            { id: row.id },
            { ...row, _hash: hash },
            { upsert: true, returnDocument: 'after' },
          );
          await redisClient.set(redisKey, hash);
          newCount++;
        } else if (storedHash !== hash) {
          // UPDATED: hash changed
          await this.sheetRowModel.findOneAndUpdate(
            { id: row.id },
            { ...row, _hash: hash },
            { upsert: true, returnDocument: 'after' },
          );
          await redisClient.set(redisKey, hash);
          updatedCount++;
        } else {
          // UNCHANGED: skip
          unchangedCount++;
        }
      }

      // Detect deleted rows - 4
      const deletedIds = [...existingIdSet].filter((id) => !liveIdSet.has(id));
      let deletedCount = 0;
      for (const id of deletedIds) {
        await this.sheetRowModel.deleteOne({ id });
        await redisClient.del(`${REDIS_ROW_PREFIX}${id}`);
        deletedCount++;
      }

      this.logger.debug(
        `[syncSheet] new=${newCount} updated=${updatedCount} unchanged=${unchangedCount} deleted=${deletedCount}`,
      );

      void OneSignal.create()
        .title('SHEETS')
        .message(
          `New: ${newCount} | Updated: ${updatedCount} | Deleted: ${deletedCount}`,
        )
        .rest({
          priority: 10,
        })
        .sendPush({ isImportant: true })
        .then((n) => n.sendToNtfy());

      return resJson;
    } catch (error) {
      this.logger.error(error);
    }
  }
}
