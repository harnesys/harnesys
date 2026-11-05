import {
  TelegramBlockedError,
  type TelegramChatMember,
  type TelegramFileRef,
  TelegramUnauthorizedError,
} from '../../domain/connector/telegram-api.port.ts';
import { API_ROOT, asRecord, callJson, isMemberLookupMiss } from './telegram-api.http.ts';

export async function getFileRequest(
  token: string,
  fileId: string,
): Promise<TelegramFileRef & { bytes: Uint8Array }> {
  const result = asRecord(await callJson(token, 'getFile', { file_id: fileId }));
  const filePath = result?.file_path;
  const fileSize = result?.file_size;
  if (typeof filePath !== 'string' || filePath.length === 0) {
    throw new Error('Telegram getFile returned no file_path');
  }
  const size = typeof fileSize === 'number' ? fileSize : 0;
  const response = await fetch(`${API_ROOT}/file/bot${token}/${filePath}`);
  if (response.status === 401) {
    throw new TelegramUnauthorizedError();
  }
  if (response.status === 403 && (await response.text()).toLowerCase().includes('blocked')) {
    throw new TelegramBlockedError();
  }
  if (!response.ok) {
    throw new Error(`Telegram file download failed with HTTP ${response.status}`);
  }
  return {
    filePath,
    fileSize: size,
    bytes: new Uint8Array(await response.arrayBuffer()),
  };
}

export async function getChatMemberRequest(
  token: string,
  chatId: string,
  userId: string,
): Promise<TelegramChatMember | null> {
  try {
    const result = asRecord(
      await callJson(token, 'getChatMember', { chat_id: chatId, user_id: userId }),
    );
    const status = result?.status;
    if (typeof status !== 'string') {
      return null;
    }
    return {
      status,
      canManageChat: result?.can_manage_chat === true,
      canManageTopics: result?.can_manage_topics === true,
    };
  } catch (error) {
    if (isMemberLookupMiss(error)) {
      return null;
    }
    throw error;
  }
}
