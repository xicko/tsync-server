import { TableColumnType } from 'src/types/sheets.interface';
import * as crypto from 'crypto';

export function hashRow(row: TableColumnType): string {
  return crypto.createHash('sha256').update(JSON.stringify(row)).digest('hex');
}

export function convertToType(data: string[]): TableColumnType | null {
  if (data.length !== 6 || data[0] === 'ID') return null;
  return {
    id: data[0],
    date: data[1],
    project: data[2],
    description: data[3],
    startTime: data[4],
    endTime: data[5],
  };
}
