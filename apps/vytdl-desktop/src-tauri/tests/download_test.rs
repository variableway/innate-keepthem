use std::time::Duration;
use tokio::time::timeout;

#[tokio::test]
async fn test_yt_dlp_video_info() {
    // Verify yt-dlp (the same binary used by both CLI and Desktop app)
    // can successfully fetch video info for the test URL.
    let url = "https://www.youtube.com/watch?v=oOCN30ulVyo";
    let yt_dlp = std::env::var("YT_DLP_BIN")
        .unwrap_or_else(|_| "/Users/patrick/.local/bin/yt-dlp".to_string());

    println!("\n[Test] yt-dlp path: {}", yt_dlp);
    println!("[Test] URL: {}", url);

    let cmd_future = tokio::process::Command::new(&yt_dlp)
        .args(&["--dump-json", "--no-download", url])
        .output();

    match timeout(Duration::from_secs(60), cmd_future).await {
        Ok(Ok(output)) if output.status.success() => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            println!("[Test] ✅ SUCCESS — fetched video info ({} bytes)", stdout.len());

            // Verify key fields exist
            assert!(stdout.contains("\"title\""), "Response should contain title");
            assert!(stdout.contains("\"id\""), "Response should contain id");
            println!("[Test] ✅ Response contains 'title' and 'id' fields");
        }
        Ok(Ok(output)) => {
            let stderr = String::from_utf8_lossy(&output.stderr);
            panic!("[Test] ❌ yt-dlp failed: {}", stderr);
        }
        Ok(Err(e)) => {
            panic!("[Test] ❌ Failed to spawn yt-dlp: {}", e);
        }
        Err(_) => {
            panic!("[Test] ❌ Timed out after 60s — YouTube may be blocking the request");
        }
    }
}
