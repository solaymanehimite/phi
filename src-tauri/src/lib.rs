use tauri::Manager;
use tauri_plugin_shell::ShellExt;

struct AppState {
    sidecar_port: u16,
}

#[tauri::command]
fn get_sidecar_port(state: tauri::State<AppState>) -> u16 {
    state.sidecar_port
}

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // Sidecar: prod = binary in src-tauri/binaries/server-<triple>, dev = not bundled -> fallback to 3001
            let port: u16 = match app.shell().sidecar("server") {
                Ok(sidecar) => {
                    let p = portpicker::pick_unused_port().expect("no free port");
                    match sidecar.args([p.to_string()]).spawn() {
                        Ok((mut rx, _child)) => {
                            println!("[phi] sidecar spawned on port {}", p);
                            // pipe sidecar stdout/stderr to app log
                            tauri::async_runtime::spawn(async move {
                                use tauri_plugin_shell::process::CommandEvent;
                                while let Some(event) = rx.recv().await {
                                    match event {
                                        CommandEvent::Stdout(line) => {
                                            println!("[sidecar] {}", String::from_utf8_lossy(&line));
                                        }
                                        CommandEvent::Stderr(line) => {
                                            eprintln!("[sidecar] {}", String::from_utf8_lossy(&line));
                                        }
                                        _ => {}
                                    }
                                }
                            });
                            p
                        }
                        Err(e) => {
                            eprintln!("[phi] sidecar spawn failed: {} — falling back to 3001", e);
                            3001
                        }
                    }
                }
                Err(e) => {
                    println!("[phi] sidecar not bundled (dev mode): {} — using 3001", e);
                    3001
                }
            };
            app.manage(AppState { sidecar_port: port });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![greet, get_sidecar_port])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
