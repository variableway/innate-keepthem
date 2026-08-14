import BetterSqlite3 from "better-sqlite3";
import { mkdirSync } from "fs";
import { dirname } from "path";

export type DownloadStatus =
  | "pending"
  | "downloading"
  | "completed"
  | "failed"
  | "cancelled";

export type VttReportStatus = "pending" | "processing" | "done" | "failed";

export interface VttReport {
  id: string;
  youtube_url: string;
  video_id: string | null;
  title: string | null;
  language: string | null;
  content: string;
  cue_count: number;
  duration_sec: number | null;
  created_at: string;
  status: VttReportStatus;
  error: string | null;
}

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

      CREATE TABLE IF NOT EXISTS vtt_reports (
        id TEXT PRIMARY KEY,
        youtube_url TEXT NOT NULL,
        video_id TEXT,
        title TEXT,
        language TEXT,
        content TEXT NOT NULL DEFAULT '',
        cue_count INTEGER DEFAULT 0,
        duration_sec REAL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        status TEXT NOT NULL DEFAULT 'pending',
        error TEXT
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

  createVttReport(report: VttReport): void {
    this.db
      .prepare(
        `INSERT INTO vtt_reports (id, youtube_url, video_id, title, language, content, cue_count, duration_sec, created_at, status, error)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        report.id,
        report.youtube_url,
        report.video_id,
        report.title,
        report.language,
        report.content,
        report.cue_count,
        report.duration_sec,
        report.created_at,
        report.status,
        report.error
      );
  }

  getVttReport(id: string): VttReport | undefined {
    return this.db
      .prepare("SELECT * FROM vtt_reports WHERE id = ?")
      .get(id) as VttReport | undefined;
  }

  listVttReports(
    page: number,
    limit: number,
    lang?: string
  ): { reports: VttReport[]; total: number } {
    const offset = (page - 1) * limit;
    let where = "";
    const params: (string | number)[] = [];
    if (lang) {
      where = " WHERE language = ?";
      params.push(lang);
    }
    const countStmt = this.db.prepare(`SELECT COUNT(*) as count FROM vtt_reports${where}`);
    const countRow = lang ? countStmt.get(lang) as { count: number } : countStmt.get() as { count: number };
    const listStmt = this.db.prepare(
      `SELECT * FROM vtt_reports${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`
    );
    const rows = lang
      ? listStmt.all(lang, limit, offset) as VttReport[]
      : listStmt.all(limit, offset) as VttReport[];
    return { reports: rows, total: countRow.count };
  }

  updateVttReport(
    id: string,
    updates: Partial<Pick<VttReport, "title" | "language" | "content" | "cue_count" | "duration_sec" | "status" | "error" | "video_id">>
  ): void {
    const keys = Object.keys(updates) as (keyof typeof updates)[];
    const fields = keys.map((k) => `${k} = ?`).join(", ");
    const values = keys.map((k) => updates[k]);
    this.db
      .prepare(`UPDATE vtt_reports SET ${fields} WHERE id = ?`)
      .run(...values, id);
  }

  deleteVttReport(id: string): void {
    this.db.prepare("DELETE FROM vtt_reports WHERE id = ?").run(id);
  }
}
