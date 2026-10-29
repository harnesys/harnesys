import type { GooglePickerSessionResponse } from '@/shared/api/integrations';

export interface PickedGoogleFolder {
  id: string;
  name: string;
}

interface GapiPickerNamespace {
  load: (name: string, callback: () => void) => void;
}

interface GooglePickerApi {
  PickerBuilder: new () => GooglePickerBuilder;
  DocsView: new (viewId?: string) => GoogleDocsView;
  ViewId: { FOLDERS: string; DOCS: string };
  DocsViewMode: { LIST: string };
  Response: { ACTION: string; DOCUMENTS: string };
  Action: { PICKED: string; CANCEL: string };
  Document: { ID: string; NAME: string; MIME_TYPE: string };
}

interface GooglePickerBuilder {
  addView: (view: GoogleDocsView) => GooglePickerBuilder;
  setOAuthToken: (token: string) => GooglePickerBuilder;
  setDeveloperKey: (key: string) => GooglePickerBuilder;
  setAppId: (appId: string) => GooglePickerBuilder;
  setTitle: (title: string) => GooglePickerBuilder;
  setCallback: (cb: (data: Record<string, unknown>) => void) => GooglePickerBuilder;
  build: () => { setVisible: (visible: boolean) => void };
}

interface GoogleDocsView {
  setIncludeFolders: (value: boolean) => GoogleDocsView;
  setSelectFolderEnabled: (value: boolean) => GoogleDocsView;
  setMimeTypes: (types: string) => GoogleDocsView;
  setMode: (mode: string) => GoogleDocsView;
}

declare global {
  interface Window {
    gapi?: GapiPickerNamespace;
    google?: { picker?: GooglePickerApi };
  }
}

let pickerScriptPromise: Promise<void> | null = null;

function loadPickerScript(): Promise<void> {
  if (window.google?.picker) {
    return Promise.resolve();
  }
  if (pickerScriptPromise) {
    return pickerScriptPromise;
  }
  pickerScriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-google-picker]');
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Google Picker script failed')), {
        once: true,
      });
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://apis.google.com/js/api.js';
    script.async = true;
    script.dataset.googlePicker = '1';
    script.onload = () => {
      const gapi = window.gapi;
      if (!gapi) {
        reject(new Error('gapi missing after script load'));
        return;
      }
      gapi.load('picker', () => resolve());
    };
    script.onerror = () => reject(new Error('Failed to load Google Picker script'));
    document.head.appendChild(script);
  });
  return pickerScriptPromise;
}

export async function pickGoogleDriveFolder(
  session: GooglePickerSessionResponse,
): Promise<PickedGoogleFolder | null> {
  await loadPickerScript();
  const pickerApi = window.google?.picker;
  if (!pickerApi) {
    throw new Error('Google Picker API unavailable');
  }
  return new Promise<PickedGoogleFolder | null>((resolve) => {
    const view = new pickerApi.DocsView(pickerApi.ViewId.FOLDERS)
      .setIncludeFolders(true)
      .setSelectFolderEnabled(true)
      .setMimeTypes('application/vnd.google-apps.folder')
      .setMode(pickerApi.DocsViewMode.LIST);
    const picker = new pickerApi.PickerBuilder()
      .addView(view)
      .setOAuthToken(session.accessToken)
      .setDeveloperKey(session.apiKey)
      .setAppId(session.appId)
      .setTitle('Choose a Drive folder')
      .setCallback((data) => {
        const action = data[pickerApi.Response.ACTION];
        if (action === pickerApi.Action.CANCEL) {
          resolve(null);
          return;
        }
        if (action !== pickerApi.Action.PICKED) {
          return;
        }
        const docs = data[pickerApi.Response.DOCUMENTS];
        if (!Array.isArray(docs) || docs.length === 0) {
          resolve(null);
          return;
        }
        const doc = docs[0] as Record<string, unknown>;
        const id = String(doc[pickerApi.Document.ID] ?? '');
        const name = String(doc[pickerApi.Document.NAME] ?? 'Google Drive');
        if (!id) {
          resolve(null);
          return;
        }
        resolve({ id, name });
      })
      .build();
    picker.setVisible(true);
  });
}
