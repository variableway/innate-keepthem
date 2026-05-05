import BetterSqlite3 from "better-sqlite3";
import { mkdirSync } from "fs";
import { dirname } from "path";

export type DownloadStatus =
  | "pending"
  | "downloading"
  | "completed"
  | "failed"
  | "cancelled";

export interface DownloadRecord {
  id: string;
  url: string;
  title: string | null;
  status: DownloadStatus;
  progress: number;
  speed: string | null;
  eta: string | null;
  output_dir: string | null;
  filename: string | null;
  subtitles: string;
  error: string | null;
  queue_position: number;
  created_at: string;
  updated_at: string;
}

export class Database {
  private db: BetterSqlite3.Database;

  constructor(dbPath = "./data/vytdl.db") {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new BetterSqlite3(dbPath);
    this.init();
  }

  private init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS downloads (
        id TEXT PRIMARY KEY,
        url TEXT NOT NULL,
        title TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        progress REAL DEFAULT 0.0,
        speed TEXT,
        eta TEXT,
        output_dir TEXT,
        filename TEXT,
        subtitles TEXT DEFAULT '[]',
        error TEXT,
        queue_position INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
  }

  createDownload(record: DownloadRecord): void {
    this.db
      .prepare(
        `INSERT INTO downloads (id, url, title, status, progress, speed, eta, output_dir, filename, subtitles, error, queue_position, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        record.id,
        record.url,
        record.title,
        record.status,
        record.progress,
        record.speed,
        record.eta,
        record.output_dir,
        record.filename,
        record.subtitles,
        record.error,
        record.queue_position,
        record.created_at,
        record.updated_at
      );
  }

  getAllDownloads(): DownloadRecord[] {
    return this.db
      .prepare("SELECT * FROM downloads ORDER BY created_at DESC")
      .all() as DownloadRecord[];
  }

  getDownloadById(id: string): DownloadRecord | undefined {
    return this.db
      .prepare("SELECT * FROM downloads WHERE id = ?")
      .get(id) as DownloadRecord | undefined;
  }

  updateDownloadStatus(id: string, status: DownloadStatus): void {
    this.db
      .prepare("UPDATE downloads SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .run(status, id);
  }

  updateDownloadProgress(
    id: string,
    progress: number,
    speed: string | null,
    eta: string | null
  ): void {
    this.db
      .prepare(
        "UPDATE downloads SET progress = ?, speed = ?, eta = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
      )
      .run(progress, speed, eta, id);
  }

  updateDownloadComplete(
    id: string,
    title: string,
    filename: string,
    subtitles: string
  ): void {
    this.db
      .prepare(
        "UPDATE downloads SET title = ?, filename = ?, subtitles = ?, status = 'completed', progress = 100.0, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
      )
      .run(title, filename, subtitles, id);
  }

  updateDownloadError(id: string, error: string): void {
    this.db
      .prepare(
        "UPDATE downloads SET status = 'failed', error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
      )
      .run(error, id);
  }

  updateQueuePosition(id: string, position: number): void {
    this.db
      .prepare(
        "UPDATE downloads SET queue_position = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
      )
      .run(position, id);
  }

  deleteDownload(id: string): void {
    this.db.prepare("DELETE FROM downloads WHERE id = ?").run(id);
  }

  getSetting(key: string): string | undefined {
    const row = this.db
      .prepare("SELECT value FROM settings WHERE key = ?")
      .get(key) as { value: string } | undefined;
    return row?.value;
  }

  setSetting(key: string, value: string): void {
    this.db
      .prepare(
        `INSERT INTO settings (key, value, updated_at)
         VALUES (?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`
      )
      .run(key, value);
  }
}
