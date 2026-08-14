use std::collections::{HashMap, VecDeque};
use tokio::sync::mpsc;
use tauri::{AppHandle, Emitter, Manager};

use crate::database::{Database, DownloadStatus};
use crate::downloader::{DownloadLog, DownloadOptions, DownloadProgress, Downloader};
use crate::commands::ApiResponse;

/// Command sent to the queue manager background task.
pub enum QueueCommand {
    Enqueue {
        id: String,
        options: DownloadOptions,
        yt_dlp_path: Option<String>,
        app: AppHandle,
    },
    Cancel {
        id: String,
    },
    Finished {
        id: String,
    },
    SetMaxConcurrent {
        max: usize,
    },
}

/// Information about a pending download.
struct PendingDownload {
    id: String,
    options: DownloadOptions,
    yt_dlp_path: Option<String>,
}

/// Shared queue manager handle.
pub struct QueueManager {
    tx: mpsc::Sender<QueueCommand>,
}

impl QueueManager {
    pub fn new(db: Database, max_concurrent: usize) -> Self {
        let (tx, rx) = mpsc::channel::<QueueCommand>(100);
        tokio::spawn(run_queue(rx, db, max_concurrent));
        Self { tx }
    }

    pub async fn enqueue(
        &self,
        id: String,
        options: DownloadOptions,
        yt_dlp_path: Option<String>,
        app: AppHandle,
    ) {
        let _ = self
            .tx
            .send(QueueCommand::Enqueue {
                id,
                options,
                yt_dlp_path,
                app,
            })
            .await;
    }

    pub async fn cancel(&self, id: String) {
        let _ = self.tx.send(QueueCommand::Cancel { id }).await;
    }

    pub async fn notify_finished(&self, id: String) {
        let _ = self.tx.send(QueueCommand::Finished { id }).await;
    }

    pub async fn set_max_concurrent(&self, max: usize) {
        let _ = self.tx.send(QueueCommand::SetMaxConcurrent { max }).await;
    }
}

async fn run_queue(
    mut rx: mpsc::Receiver<QueueCommand>,
    db: Database,
    mut max_concurrent: usize,
) {
    let mut active: HashMap<String, tokio::task::JoinHandle<()>> = HashMap::new();
    let mut pending: VecDeque<PendingDownload> = VecDeque::new();
    let mut cancel_txs: HashMap<String, mpsc::Sender<()>> = HashMap::new();
    let mut app_handle: Option<AppHandle> = None;

    while let Some(cmd) = rx.recv().await {
        match cmd {
            QueueCommand::Enqueue {
                id,
                options,
                yt_dlp_path,
                app,
            } => {
                app_handle = Some(app.clone());
                pending.push_back(PendingDownload {
                    id,
                    options,
                    yt_dlp_path,
                });
                update_pending_positions(&pending, &db).await;
                try_start_pending(
                    &mut active,
                    &mut pending,
                    &mut cancel_txs,
                    &db,
                    max_concurrent,
                    &app,
                )
                .await;
            }
            QueueCommand::Cancel { id } => {
                if let Some(tx) = cancel_txs.get(&id) {
                    let _ = tx.send(()).await;
                }
                pending.retain(|p| p.id != id);
                let _ = db.update_download_status(&id, DownloadStatus::Cancelled).await;
            }
            QueueCommand::Finished { id } => {
                active.remove(&id);
                cancel_txs.remove(&id);
                update_pending_positions(&pending, &db).await;
                if let Some(ref app) = app_handle {
                    try_start_pending(
                        &mut active,
                        &mut pending,
                        &mut cancel_txs,
                        &db,
                        max_concurrent,
                        app,
                    )
                    .await;
                }
            }
            QueueCommand::SetMaxConcurrent { max } => {
                max_concurrent = max.max(1).min(10);
                log::info!("Queue max_concurrent updated to {}", max_concurrent);
                if let Some(ref app) = app_handle {
                    try_start_pending(
                        &mut active,
                        &mut pending,
                        &mut cancel_txs,
                        &db,
                        max_concurrent,
                        app,
                    )
                    .await;
                }
            }
        }
    }
}

async fn update_pending_positions(
    pending: &VecDeque<PendingDownload>,
    db: &Database,
) {
    for (i, item) in pending.iter().enumerate() {
        if let Err(e) = db.update_queue_position(&item.id, (i + 1) as i64).await {
            log::error!("Failed to update queue position for {}: {}", item.id, e);
        }
    }
}

async fn try_start_pending(
    active: &mut HashMap<String, tokio::task::JoinHandle<()>>,
    pending: &mut VecDeque<PendingDownload>,
    cancel_txs: &mut HashMap<String, mpsc::Sender<()>>,
    db: &Database,
    max_concurrent: usize,
    app: &AppHandle,
) {
    while active.len() < max_concurrent {
        let Some(download) = pending.pop_front() else {
            break;
        };

        let PendingDownload {
            id,
            options,
            yt_dlp_path,
        } = download;

        // Update DB status to downloading and clear queue position
        if let Err(e) = db.update_download_status(&id, DownloadStatus::Downloading).await {
            log::error!("Failed to update download status: {}", e);
            continue;
        }
        if let Err(e) = db.update_queue_position(&id, 0).await {
            log::error!("Failed to reset queue position: {}", e);
        }

        // Emit status change event so UI updates immediately
        let _ = app.emit(&format!("download:status:{}", id), "downloading");

        let (cancel_tx, cancel_rx) = mpsc::channel::<()>(1);
        cancel_txs.insert(id.clone(), cancel_tx);

        let db_clone = db.clone();
        let app_clone = app.clone();

        let id_for_task = id.clone();
        let handle = tokio::spawn(async move {
            run_download_task(id_for_task, options, yt_dlp_path, db_clone, app_clone, cancel_rx)
                .await;
        });

        active.insert(id, handle);
    }
}

async fn run_download_task(
    id: String,
    options: DownloadOptions,
    yt_dlp_path: Option<String>,
    db: Database,
    app: AppHandle,
    mut cancel_rx: mpsc::Receiver<()>,
) {
    let downloader = Downloader::new(options.clone(), id.clone()).with_yt_dlp_path(yt_dlp_path);

    let result = downloader
        .download(
            |progress: DownloadProgress| {
                let _ = app.emit(&format!("download:progress:{}", id), progress);
            },
            |log: DownloadLog| {
                let _ = app.emit(&format!("download:log:{}", id), log);
            },
            &mut cancel_rx,
        )
        .await;

    match result {
        Ok(output) => {
            if let Err(e) = db
                .update_download_complete(
                    &id,
                    output.title.clone(),
                    output.filename.clone(),
                    output.subtitles.clone(),
                )
                .await
            {
                log::error!("Failed to update download completion: {}", e);
            }
            let _ = app.emit(
                &format!("download:complete:{}", id),
                ApiResponse::ok(output),
            );
        }
        Err(e) => {
            if e == "Download cancelled" {
                if let Err(db_err) = db.update_download_status(&id, DownloadStatus::Cancelled).await {
                    log::error!("Failed to update cancel status: {}", db_err);
                }
            } else {
                if let Err(db_err) = db.update_download_error(&id, &e).await {
                    log::error!("Failed to update download error: {}", db_err);
                }
            }
            let _ = app.emit(
                &format!("download:error:{}", id),
                ApiResponse::<()>::err(e),
            );
        }
    }

    // Notify queue that this download finished
    let queue = app.state::<QueueManager>();
    queue.notify_finished(id).await;
}
