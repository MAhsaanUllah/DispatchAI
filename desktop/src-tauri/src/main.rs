// Release builds must not open a console window.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::net::{SocketAddr, TcpListener, TcpStream};
use std::os::windows::process::CommandExt;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{Manager, RunEvent};

const CREATE_NO_WINDOW: u32 = 0x0800_0000;

// The one local server process (ADR-3: a single writer owns the database). Killed when the app exits.
struct Server(Mutex<Option<Child>>);

fn plain(path: std::path::PathBuf) -> String {
    // Windows resource paths can come back as \\?\C:\...; Node does not like that prefix.
    path.to_string_lossy().trim_start_matches(r"\\?\").to_string()
}

fn main() {
    let app = tauri::Builder::default()
        // A second copy would start a second server on the same database; bring the first window forward instead.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .setup(|app| {
            let res = app.path().resource_dir()?;
            let data = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data)?;

            let port = TcpListener::bind("127.0.0.1:0")?.local_addr()?.port();
            // One-time first-run code. It is passed to the window in the URL hash, so the owner never types it.
            let mut bytes = [0u8; 6];
            getrandom::fill(&mut bytes).map_err(|e| e.to_string())?;
            let code: String = bytes.iter().map(|b| format!("{b:02x}")).collect();

            let child = Command::new(plain(res.join("node.exe")))
                .arg(plain(res.join("agent-server.js")))
                .env("HOST", "127.0.0.1")
                .env("AGENT_PORT", port.to_string())
                .env("DATABASE_URL", plain(data.join("dispatchai.sqlite")))
                .env("WEB_DIST", plain(res.join("web")))
                .env("WEB_ORIGIN", format!("http://127.0.0.1:{port}"))
                .env("SETUP_TOKEN", &code)
                // The server exits by itself if this app dies without a clean shutdown (crash, Task Manager).
                .env("PARENT_PID", std::process::id().to_string())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .creation_flags(CREATE_NO_WINDOW)
                .spawn()?;
            app.manage(Server(Mutex::new(Some(child))));

            // Show the dashboard as soon as the server answers.
            let window = app.get_webview_window("main").expect("main window");
            std::thread::spawn(move || {
                let addr: SocketAddr = ([127, 0, 0, 1], port).into();
                let started = Instant::now();
                while TcpStream::connect_timeout(&addr, Duration::from_millis(200)).is_err() {
                    if started.elapsed() > Duration::from_secs(30) {
                        let _ = window.eval("document.body.innerText = 'DispatchAI could not start its server.'");
                        return;
                    }
                    std::thread::sleep(Duration::from_millis(250));
                }
                let _ = window.eval(format!("location.replace('http://127.0.0.1:{port}/app#setup={code}')"));
            });
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building DispatchAI desktop");

    app.run(|handle, event| {
        if let RunEvent::Exit = event {
            if let Some(mut child) = handle.state::<Server>().0.lock().unwrap().take() {
                let _ = child.kill();
            }
        }
    });
}
