import { UseCase, InferenceLog } from '../types';
import { addInferenceLog } from './storage';
import * as Device from 'expo-device';

export async function logInference(
  useCase: UseCase,
  modelName: string,
  ttftMs: number,
  totalMs: number,
  tokensPredicted: number,
): Promise<void> {
  const deviceModel = Device.modelName || 'unknown';
  const deviceBrand = Device.brand || 'unknown';

  const log: InferenceLog = {
    timestamp: new Date().toISOString(),
    useCase,
    modelName,
    ttftMs,
    totalMs,
    tokensPredicted,
    deviceModel,
    deviceBrand,
  };

  await addInferenceLog(log);
}

export function logsToCSV(logs: InferenceLog[]): string {
  const headers = [
    'Timestamp',
    'UseCase',
    'ModelName',
    'TTFTms',
    'Totalms',
    'TokensPredicted',
    'DeviceModel',
    'DeviceBrand',
  ];

  const rows = logs.map((l) =>
    [
      l.timestamp,
      l.useCase,
      l.modelName,
      l.ttftMs,
      l.totalMs,
      l.tokensPredicted,
      l.deviceModel,
      l.deviceBrand,
    ].join(',')
  );

  return [headers.join(','), ...rows].join('\n');
}
