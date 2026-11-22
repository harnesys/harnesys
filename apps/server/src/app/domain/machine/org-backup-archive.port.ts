export abstract class OrgBackupArchivePort {
  abstract create(files: string[], stagingDir: string, outPath: string): Promise<void>;
  abstract extract(archivePath: string, destDir: string): Promise<void>;
  abstract hashFile(path: string): Promise<string>;
}
