//! Dexter's local model: llama.cpp (`llama-server`) + a small GGUF model.
//!
//! Nothing ships with the installer. The user opts in from Dexter or the AI
//! settings tab; we then download a pinned llama.cpp build and the chosen model
//! into `AppData/local-ai/`. The server only runs while Dexter is used: it
//! listens on 127.0.0.1 behind a random API key and is stopped after a period
//! of inactivity (and always when the app exits), so the model's RAM is given
//! back to the system.

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::hash_map::RandomState;
use std::hash::{BuildHasher, Hasher};
use std::io::Write;
use std::net::TcpListener;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_http::reqwest;

/// Pinned llama.cpp release (https://github.com/ggml-org/llama.cpp/releases).
pub const LLAMA_CPP_BUILD: &str = "b11429";
const PROGRESS_EVENT: &str = "local-ai-progress";
const DEFAULT_IDLE_TIMEOUT_SECS: u64 = 300;
const MIN_IDLE_TIMEOUT_SECS: u64 = 60;
const STARTUP_TIMEOUT: Duration = Duration::from_secs(180);
const USER_AGENT: &str = concat!("Caltemp/", env!("CARGO_PKG_VERSION"));

struct ModelSpec {
    id: &'static str,
    label: &'static str,
    description: &'static str,
    repo: &'static str,
    file: &'static str,
    approx_bytes: u64,
    license: &'static str,
    recommended: bool,
    extra_args: &'static [&'static str],
}

const MODELS: &[ModelSpec] = &[
    ModelSpec {
        id: "qwen2.5-1.5b-instruct",
        label: "Qwen2.5 1.5B Instruct",
        description: "Équilibré : bon français, appels d'outils fiables. Environ 1,5 Go de RAM pendant l'utilisation.",
        repo: "Qwen/Qwen2.5-1.5B-Instruct-GGUF",
        file: "qwen2.5-1.5b-instruct-q4_k_m.gguf",
        approx_bytes: 1_120_000_000,
        license: "Apache-2.0",
        recommended: true,
        extra_args: &[],
    },
    ModelSpec {
        id: "qwen2.5-0.5b-instruct",
        label: "Qwen2.5 0.5B Instruct",
        description: "Très léger pour les petites machines : plus rapide, mais comprend moins bien les demandes complexes.",
        repo: "Qwen/Qwen2.5-0.5B-Instruct-GGUF",
        file: "qwen2.5-0.5b-instruct-q4_k_m.gguf",
        approx_bytes: 491_000_000,
        license: "Apache-2.0",
        recommended: false,
        extra_args: &[],
    },
    ModelSpec {
        id: "qwen3-1.7b",
        label: "Qwen3 1.7B",
        description: "Plus récent, meilleur pour enchaîner plusieurs actions. Mode réflexion désactivé pour rester rapide.",
        repo: "unsloth/Qwen3-1.7B-GGUF",
        file: "Qwen3-1.7B-Q4_K_M.gguf",
        approx_bytes: 1_110_000_000,
        license: "Apache-2.0",
        recommended: false,
        extra_args: &["--reasoning", "off"],
    },
];

fn find_model(id: &str) -> Result<&'static ModelSpec, String> {
    MODELS
        .iter()
        .find(|model| model.id == id)
        .ok_or_else(|| format!("Modèle inconnu : {id}"))
}

/// Release asset for this platform. `gpu` selects the Vulkan build where one
/// exists; the macOS arm64 build always includes Metal.
fn runtime_asset(gpu: bool) -> Option<&'static str> {
    match (std::env::consts::OS, std::env::consts::ARCH, gpu) {
        ("windows", "x86_64", false) => Some("win-cpu-x64.zip"),
        ("windows", "x86_64", true) => Some("win-vulkan-x64.zip"),
        ("windows", "aarch64", false) => Some("win-cpu-arm64.zip"),
        ("windows", "aarch64", true) => Some("win-vulkan-arm64.zip"),
        ("macos", "aarch64", _) => Some("macos-arm64.tar.gz"),
        ("macos", "x86_64", _) => Some("macos-x64.tar.gz"),
        ("linux", "x86_64", false) => Some("ubuntu-x64.tar.gz"),
        ("linux", "x86_64", true) => Some("ubuntu-vulkan-x64.tar.gz"),
        ("linux", "aarch64", false) => Some("ubuntu-arm64.tar.gz"),
        ("linux", "aarch64", true) => Some("ubuntu-vulkan-arm64.tar.gz"),
        _ => None,
    }
}

fn gpu_variant_available() -> bool {
    matches!(std::env::consts::OS, "windows" | "linux") && runtime_asset(true).is_some()
}

fn gpu_always_on() -> bool {
    std::env::consts::OS == "macos" && std::env::consts::ARCH == "aarch64"
}

fn runtime_variant(gpu: bool) -> &'static str {
    if gpu && gpu_variant_available() {
        "vulkan"
    } else {
        "cpu"
    }
}

fn server_binary_name() -> &'static str {
    if cfg!(windows) {
        "llama-server.exe"
    } else {
        "llama-server"
    }
}

fn local_ai_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|dir| dir.join("local-ai"))
        .map_err(|error| error.to_string())
}

fn models_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(local_ai_dir(app)?.join("models"))
}

fn runtime_root(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(local_ai_dir(app)?.join("runtime"))
}

fn runtime_dir(app: &AppHandle, gpu: bool) -> Result<PathBuf, String> {
    Ok(runtime_root(app)?.join(format!("{LLAMA_CPP_BUILD}-{}", runtime_variant(gpu))))
}

fn model_path(app: &AppHandle, model: &ModelSpec) -> Result<PathBuf, String> {
    Ok(models_dir(app)?.join(model.file))
}

/// Archives contain a versioned folder; look for the server binary a few levels down.
fn find_server_binary(dir: &Path, depth: usize) -> Option<PathBuf> {
    let entries = std::fs::read_dir(dir).ok()?;
    let mut subdirs = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            subdirs.push(path);
        } else if path.file_name().and_then(|name| name.to_str()) == Some(server_binary_name()) {
            return Some(path);
        }
    }
    if depth == 0 {
        return None;
    }
    subdirs
        .into_iter()
        .find_map(|subdir| find_server_binary(&subdir, depth - 1))
}

fn installed_server(app: &AppHandle, gpu: bool) -> Option<PathBuf> {
    find_server_binary(&runtime_dir(app, gpu).ok()?, 3)
}

fn random_token() -> String {
    // RandomState is seeded from the OS RNG: two of them give 128 random bits,
    // plenty for a token that only guards a loopback port.
    let mut token = String::new();
    for _ in 0..2 {
        let mut hasher = RandomState::new().build_hasher();
        hasher.write_u128(
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|duration| duration.as_nanos())
                .unwrap_or_default(),
        );
        token.push_str(&format!("{:016x}", hasher.finish()));
    }
    token
}

fn free_port() -> Result<u16, String> {
    TcpListener::bind("127.0.0.1:0")
        .and_then(|listener| listener.local_addr())
        .map(|address| address.port())
        .map_err(|error| format!("Aucun port local disponible : {error}"))
}

fn default_threads() -> u32 {
    // Half the cores (capped) keeps the rest of the desktop responsive while
    // Dexter answers; small models gain little beyond 4 threads.
    let cores = std::thread::available_parallelism()
        .map(|count| count.get() as u32)
        .unwrap_or(4);
    (cores / 2).clamp(1, 4)
}

struct RunningServer {
    child: Child,
    port: u16,
    api_key: String,
    model_id: String,
    config_key: String,
    last_used: Instant,
}

impl RunningServer {
    fn stop(mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

pub struct LocalAiState {
    server: Mutex<Option<RunningServer>>,
    starting: tokio::sync::Mutex<()>,
    installing: AtomicBool,
    cancel_install: AtomicBool,
    idle_timeout_secs: AtomicU64,
}

impl Default for LocalAiState {
    fn default() -> Self {
        Self {
            server: Mutex::new(None),
            starting: tokio::sync::Mutex::new(()),
            installing: AtomicBool::new(false),
            cancel_install: AtomicBool::new(false),
            idle_timeout_secs: AtomicU64::new(DEFAULT_IDLE_TIMEOUT_SECS),
        }
    }
}

impl LocalAiState {
    fn take_server(&self) -> Option<RunningServer> {
        self.server.lock().ok().and_then(|mut guard| guard.take())
    }

    pub fn shutdown(&self) {
        if let Some(server) = self.take_server() {
            server.stop();
        }
    }

    /// Stops the server once it has been idle for longer than the configured
    /// timeout, or forgets it if it died on its own.
    fn reap_idle(&self) {
        let timeout = Duration::from_secs(self.idle_timeout_secs.load(Ordering::Relaxed));
        let Ok(mut guard) = self.server.lock() else {
            return;
        };
        let should_stop = match guard.as_mut() {
            Some(server) => {
                matches!(server.child.try_wait(), Ok(Some(_)))
                    || server.last_used.elapsed() >= timeout
            }
            None => false,
        };
        if should_stop {
            if let Some(server) = guard.take() {
                server.stop();
            }
        }
    }
}

/// Background watchdog: one cheap check every 20 s.
pub fn spawn_idle_watchdog(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(Duration::from_secs(20)).await;
            app.state::<LocalAiState>().reap_idle();
        }
    });
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelStatus {
    id: &'static str,
    label: &'static str,
    description: &'static str,
    license: &'static str,
    file: &'static str,
    approx_bytes: u64,
    size_bytes: Option<u64>,
    installed: bool,
    recommended: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunningStatus {
    model_id: String,
    port: u16,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalAiStatus {
    supported: bool,
    llama_cpp_build: &'static str,
    runtime_installed: bool,
    gpu_runtime_installed: bool,
    gpu_variant_available: bool,
    gpu_always_on: bool,
    default_threads: u32,
    models: Vec<ModelStatus>,
    running: Option<RunningStatus>,
    installing: bool,
    data_dir: String,
}

#[tauri::command]
pub fn local_ai_status(app: AppHandle, state: State<'_, LocalAiState>) -> Result<LocalAiStatus, String> {
    let models = MODELS
        .iter()
        .map(|model| {
            let size_bytes = model_path(&app, model)
                .ok()
                .and_then(|path| std::fs::metadata(path).ok())
                .map(|meta| meta.len());
            ModelStatus {
                id: model.id,
                label: model.label,
                description: model.description,
                license: model.license,
                file: model.file,
                approx_bytes: model.approx_bytes,
                installed: size_bytes.is_some(),
                size_bytes,
                recommended: model.recommended,
            }
        })
        .collect();

    let running = state.server.lock().ok().and_then(|guard| {
        guard.as_ref().map(|server| RunningStatus {
            model_id: server.model_id.clone(),
            port: server.port,
        })
    });

    Ok(LocalAiStatus {
        supported: runtime_asset(false).is_some(),
        llama_cpp_build: LLAMA_CPP_BUILD,
        runtime_installed: installed_server(&app, false).is_some(),
        gpu_runtime_installed: gpu_variant_available() && installed_server(&app, true).is_some(),
        gpu_variant_available: gpu_variant_available(),
        gpu_always_on: gpu_always_on(),
        default_threads: default_threads(),
        models,
        running,
        installing: state.installing.load(Ordering::SeqCst),
        data_dir: local_ai_dir(&app)?.to_string_lossy().into_owned(),
    })
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Progress<'a> {
    stage: &'a str,
    model_id: &'a str,
    downloaded: u64,
    total: u64,
}

fn emit_progress(app: &AppHandle, stage: &str, model_id: &str, downloaded: u64, total: u64) {
    let _ = app.emit(
        PROGRESS_EVENT,
        Progress {
            stage,
            model_id,
            downloaded,
            total,
        },
    );
}

fn http_client(follow_redirects: bool) -> Result<reqwest::Client, String> {
    let policy = if follow_redirects {
        reqwest::redirect::Policy::limited(10)
    } else {
        reqwest::redirect::Policy::none()
    };
    reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .redirect(policy)
        .connect_timeout(Duration::from_secs(20))
        .build()
        .map_err(|error| error.to_string())
}

fn normalize_sha256(value: &str) -> Option<String> {
    let trimmed = value
        .trim()
        .trim_start_matches("W/")
        .trim_start_matches("sha256:")
        .trim_matches('"')
        .to_ascii_lowercase();
    (trimmed.len() == 64 && trimmed.chars().all(|c| c.is_ascii_hexdigit())).then_some(trimmed)
}

/// GitHub publishes a SHA-256 digest for each release asset.
async fn github_asset_digest(asset_name: &str) -> Option<String> {
    #[derive(Deserialize)]
    struct Asset {
        name: String,
        digest: Option<String>,
    }
    #[derive(Deserialize)]
    struct Release {
        assets: Vec<Asset>,
    }
    let url = format!("https://api.github.com/repos/ggml-org/llama.cpp/releases/tags/{LLAMA_CPP_BUILD}");
    let response = http_client(true)
        .ok()?
        .get(url)
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .ok()?
        .error_for_status()
        .ok()?;
    let body = response.bytes().await.ok()?;
    let release: Release = serde_json::from_slice(&body).ok()?;
    release
        .assets
        .into_iter()
        .find(|asset| asset.name == asset_name)
        .and_then(|asset| asset.digest)
        .and_then(|digest: String| normalize_sha256(&digest))
}

/// Hugging Face answers `resolve` with a redirect to its CDN; the redirect
/// carries the file's SHA-256 (`X-Linked-Etag`) and size.
async fn resolve_hugging_face(url: &str) -> Result<(String, Option<String>), String> {
    let response = http_client(false)?
        .get(url)
        .send()
        .await
        .map_err(|error| format!("Hugging Face est injoignable : {error}"))?;
    let header = |name: &str| {
        response
            .headers()
            .get(name)
            .and_then(|value| value.to_str().ok())
            .map(str::to_string)
    };
    let sha = header("x-linked-etag").and_then(|value| normalize_sha256(&value));
    if response.status().is_redirection() {
        let location = header("location").ok_or("Redirection Hugging Face sans destination.")?;
        let absolute = reqwest::Url::parse(url)
            .and_then(|base| base.join(&location))
            .map_err(|error| error.to_string())?;
        return Ok((absolute.to_string(), sha));
    }
    if response.status().is_success() {
        return Ok((url.to_string(), sha));
    }
    Err(format!(
        "Le modèle n'est pas disponible sur Hugging Face (HTTP {}).",
        response.status().as_u16()
    ))
}

async fn download(
    app: &AppHandle,
    state: &LocalAiState,
    url: &str,
    dest: &Path,
    stage: &str,
    model_id: &str,
    expected_sha: Option<&str>,
) -> Result<(), String> {
    let part = dest.with_extension("part");
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    let result = async {
        let mut response = http_client(true)?
            .get(url)
            .send()
            .await
            .map_err(|error| format!("Téléchargement impossible : {error}"))?
            .error_for_status()
            .map_err(|error| format!("Téléchargement refusé : {error}"))?;
        let total = response.content_length().unwrap_or(0);
        let mut file = std::fs::File::create(&part).map_err(|error| error.to_string())?;
        let mut hasher = Sha256::new();
        let mut downloaded = 0u64;
        let mut last_emit = Instant::now();
        emit_progress(app, stage, model_id, 0, total);

        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|error| format!("Connexion interrompue : {error}"))?
        {
            if state.cancel_install.load(Ordering::SeqCst) {
                return Err("Installation annulée.".to_string());
            }
            file.write_all(&chunk)
                .map_err(|error| format!("Écriture impossible (espace disque ?) : {error}"))?;
            hasher.update(&chunk);
            downloaded += chunk.len() as u64;
            if last_emit.elapsed() >= Duration::from_millis(250) {
                emit_progress(app, stage, model_id, downloaded, total);
                last_emit = Instant::now();
            }
        }
        file.flush().map_err(|error| error.to_string())?;
        drop(file);
        emit_progress(app, stage, model_id, downloaded, total.max(downloaded));

        if total > 0 && downloaded != total {
            return Err("Téléchargement incomplet.".to_string());
        }
        let actual = format!("{:x}", hasher.finalize());
        if let Some(expected) = expected_sha {
            if actual != expected {
                return Err("Le fichier téléchargé est corrompu (empreinte SHA-256 différente).".to_string());
            }
        }
        std::fs::rename(&part, dest).map_err(|error| error.to_string())
    }
    .await;

    if result.is_err() {
        let _ = std::fs::remove_file(&part);
    }
    result
}

fn extract_archive(archive: &Path, dest: &Path) -> Result<(), String> {
    let file = std::fs::File::open(archive).map_err(|error| error.to_string())?;
    #[cfg(windows)]
    {
        let mut zip = zip::ZipArchive::new(file).map_err(|error| error.to_string())?;
        for index in 0..zip.len() {
            let mut entry = zip.by_index(index).map_err(|error| error.to_string())?;
            // enclosed_name() rejects absolute paths and `..` components.
            let Some(relative) = entry.enclosed_name() else {
                continue;
            };
            let out = dest.join(relative);
            if entry.is_dir() {
                std::fs::create_dir_all(&out).map_err(|error| error.to_string())?;
                continue;
            }
            if let Some(parent) = out.parent() {
                std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
            }
            let mut target = std::fs::File::create(&out).map_err(|error| error.to_string())?;
            std::io::copy(&mut entry, &mut target).map_err(|error| error.to_string())?;
        }
    }
    #[cfg(not(windows))]
    {
        // tar's unpack() refuses entries escaping `dest` and keeps the symlinks
        // the shared libraries rely on.
        let decoder = flate2::read::GzDecoder::new(file);
        tar::Archive::new(decoder)
            .unpack(dest)
            .map_err(|error| error.to_string())?;
    }
    Ok(())
}

async fn install_runtime(app: &AppHandle, state: &LocalAiState, gpu: bool, model_id: &str) -> Result<(), String> {
    if installed_server(app, gpu).is_some() {
        return Ok(());
    }
    let asset = runtime_asset(gpu).ok_or("Plateforme non prise en charge par llama.cpp.")?;
    let asset_name = format!("llama-{LLAMA_CPP_BUILD}-bin-{asset}");
    let url = format!("https://github.com/ggml-org/llama.cpp/releases/download/{LLAMA_CPP_BUILD}/{asset_name}");
    let root = runtime_root(app)?;
    let archive = root.join(&asset_name);
    let digest = github_asset_digest(&asset_name).await;
    download(app, state, &url, &archive, "runtime", model_id, digest.as_deref()).await?;

    emit_progress(app, "extract", model_id, 0, 0);
    let final_dir = runtime_dir(app, gpu)?;
    let staging = final_dir.with_extension("extracting");
    let _ = std::fs::remove_dir_all(&staging);
    let staging_clone = staging.clone();
    let archive_clone = archive.clone();
    let extracted = tauri::async_runtime::spawn_blocking(move || {
        std::fs::create_dir_all(&staging_clone).map_err(|error| error.to_string())?;
        extract_archive(&archive_clone, &staging_clone)
    })
    .await
    .map_err(|error| error.to_string())?;
    let _ = std::fs::remove_file(&archive);
    if let Err(error) = extracted {
        let _ = std::fs::remove_dir_all(&staging);
        return Err(format!("Extraction de llama.cpp impossible : {error}"));
    }

    let Some(binary) = find_server_binary(&staging, 3) else {
        let _ = std::fs::remove_dir_all(&staging);
        return Err("llama-server est absent de l'archive llama.cpp.".to_string());
    };
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&binary, std::fs::Permissions::from_mode(0o755));
    }
    #[cfg(not(unix))]
    let _ = binary;

    let _ = std::fs::remove_dir_all(&final_dir);
    std::fs::rename(&staging, &final_dir).map_err(|error| error.to_string())?;

    // Drop runtimes left by older pinned builds.
    if let Ok(entries) = std::fs::read_dir(&root) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().into_owned();
            if entry.path().is_dir() && !name.starts_with(&format!("{LLAMA_CPP_BUILD}-")) {
                let _ = std::fs::remove_dir_all(entry.path());
            }
        }
    }
    Ok(())
}

fn is_gguf(path: &Path) -> bool {
    use std::io::Read;
    let mut magic = [0u8; 4];
    std::fs::File::open(path)
        .and_then(|mut file| file.read_exact(&mut magic))
        .map(|_| &magic == b"GGUF")
        .unwrap_or(false)
}

async fn install_model(app: &AppHandle, state: &LocalAiState, model: &ModelSpec) -> Result<(), String> {
    let dest = model_path(app, model)?;
    if dest.exists() {
        return Ok(());
    }
    let url = format!(
        "https://huggingface.co/{}/resolve/main/{}?download=true",
        model.repo, model.file
    );
    let (download_url, sha) = resolve_hugging_face(&url).await?;
    download(app, state, &download_url, &dest, "model", model.id, sha.as_deref()).await?;
    if !is_gguf(&dest) {
        let _ = std::fs::remove_file(&dest);
        return Err("Le fichier téléchargé n'est pas un modèle GGUF valide.".to_string());
    }
    Ok(())
}

#[tauri::command]
pub async fn local_ai_install(
    app: AppHandle,
    state: State<'_, LocalAiState>,
    model_id: String,
    gpu: Option<bool>,
) -> Result<(), String> {
    let model = find_model(&model_id)?;
    if state.installing.swap(true, Ordering::SeqCst) {
        return Err("Une installation est déjà en cours.".to_string());
    }
    state.cancel_install.store(false, Ordering::SeqCst);
    let gpu = gpu.unwrap_or(false);

    let result = async {
        install_runtime(&app, &state, gpu, model.id).await?;
        install_model(&app, &state, model).await
    }
    .await;

    state.installing.store(false, Ordering::SeqCst);
    let stage = if result.is_ok() { "done" } else { "error" };
    emit_progress(&app, stage, model.id, 0, 0);
    result
}

#[tauri::command]
pub fn local_ai_cancel_install(state: State<'_, LocalAiState>) {
    state.cancel_install.store(true, Ordering::SeqCst);
}

#[tauri::command]
pub fn local_ai_remove_model(app: AppHandle, state: State<'_, LocalAiState>, model_id: String) -> Result<(), String> {
    let model = find_model(&model_id)?;
    let running_this_model = state
        .server
        .lock()
        .map(|guard| guard.as_ref().is_some_and(|server| server.model_id == model.id))
        .unwrap_or(false);
    if running_this_model {
        state.shutdown();
    }
    let path = model_path(&app, model)?;
    if path.exists() {
        std::fs::remove_file(path).map_err(|error| error.to_string())?;
    }
    Ok(())
}

/// Removes everything Dexter downloaded (runtimes and models).
#[tauri::command]
pub fn local_ai_uninstall(app: AppHandle, state: State<'_, LocalAiState>) -> Result<(), String> {
    if state.installing.load(Ordering::SeqCst) {
        return Err("Une installation est en cours.".to_string());
    }
    state.shutdown();
    let dir = local_ai_dir(&app)?;
    if dir.exists() {
        std::fs::remove_dir_all(dir).map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerOptions {
    gpu: Option<bool>,
    threads: Option<u32>,
    ctx_size: Option<u32>,
    idle_timeout_secs: Option<u64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerHandle {
    base_url: String,
    api_key: String,
    model_id: String,
}

fn log_tail(path: &Path) -> String {
    let content = std::fs::read_to_string(path).unwrap_or_default();
    let lines: Vec<&str> = content.lines().filter(|line| !line.trim().is_empty()).collect();
    lines[lines.len().saturating_sub(6)..].join("\n")
}

fn spawn_server(app: &AppHandle, model: &ModelSpec, gpu: bool, threads: u32, ctx_size: u32) -> Result<(Child, u16, String, PathBuf), String> {
    let binary = installed_server(app, gpu).ok_or("Le moteur llama.cpp n'est pas installé.")?;
    let model_file = model_path(app, model)?;
    if !model_file.exists() {
        return Err("Le modèle n'est pas installé.".to_string());
    }
    let bin_dir = binary.parent().map(Path::to_path_buf).unwrap_or_default();
    let port = free_port()?;
    let api_key = random_token();
    let log_path = local_ai_dir(app)?.join("llama-server.log");
    let log = std::fs::File::create(&log_path).map_err(|error| error.to_string())?;
    let gpu_layers = if gpu || gpu_always_on() { "99" } else { "0" };

    let mut command = Command::new(&binary);
    command
        .current_dir(&bin_dir)
        .arg("-m")
        .arg(&model_file)
        .args(["--host", "127.0.0.1", "--port", &port.to_string()])
        .args(["--api-key", &api_key])
        .args(["-c", &ctx_size.to_string()])
        .args(["-t", &threads.to_string()])
        .args(["-ngl", gpu_layers])
        // One conversation at a time, a bounded prompt cache (default: 8 GiB),
        // few HTTP threads, no web UI and no network access.
        .args(["-np", "1", "--cache-ram", "256", "--threads-http", "2"])
        .args(["--no-webui", "--offline"])
        .args(model.extra_args)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::from(log));

    #[cfg(target_os = "linux")]
    {
        let existing = std::env::var("LD_LIBRARY_PATH").unwrap_or_default();
        let joined = if existing.is_empty() {
            bin_dir.to_string_lossy().into_owned()
        } else {
            format!("{}:{existing}", bin_dir.to_string_lossy())
        };
        command.env("LD_LIBRARY_PATH", joined);
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        const BELOW_NORMAL_PRIORITY_CLASS: u32 = 0x0000_4000;
        command.creation_flags(CREATE_NO_WINDOW | BELOW_NORMAL_PRIORITY_CLASS);
    }

    let child = command
        .spawn()
        .map_err(|error| format!("Impossible de lancer llama-server : {error}"))?;
    Ok((child, port, api_key, log_path))
}

async fn wait_until_ready(child: &mut Child, port: u16, log_path: &Path) -> Result<(), String> {
    let client = http_client(false)?;
    let url = format!("http://127.0.0.1:{port}/health");
    let started = Instant::now();
    loop {
        if let Ok(Some(status)) = child.try_wait() {
            let tail = log_tail(log_path);
            return Err(format!("llama-server s'est arrêté ({status}).\n{tail}"));
        }
        if let Ok(response) = client.get(&url).send().await {
            if response.status().is_success() {
                return Ok(());
            }
        }
        if started.elapsed() > STARTUP_TIMEOUT {
            return Err("Le modèle met trop de temps à se charger.".to_string());
        }
        tokio::time::sleep(Duration::from_millis(250)).await;
    }
}

/// Returns a ready server for `model_id`, starting (or restarting) it if needed.
/// Each call also counts as activity for the idle timeout.
#[tauri::command]
pub async fn local_ai_ensure_server(
    app: AppHandle,
    state: State<'_, LocalAiState>,
    model_id: String,
    options: Option<ServerOptions>,
) -> Result<ServerHandle, String> {
    let model = find_model(&model_id)?;
    let options = options.unwrap_or_default();
    let gpu = options.gpu.unwrap_or(false) && gpu_variant_available();
    let threads = options.threads.filter(|value| *value > 0).unwrap_or_else(default_threads).min(64);
    let ctx_size = options.ctx_size.unwrap_or(4096).clamp(1024, 32768);
    let idle = options
        .idle_timeout_secs
        .unwrap_or(DEFAULT_IDLE_TIMEOUT_SECS)
        .max(MIN_IDLE_TIMEOUT_SECS);
    state.idle_timeout_secs.store(idle, Ordering::Relaxed);
    let config_key = format!("{}|{gpu}|{threads}|{ctx_size}", model.id);

    let _starting = state.starting.lock().await;
    {
        let mut guard = state.server.lock().map_err(|_| "État IA local indisponible.")?;
        if let Some(server) = guard.as_mut() {
            let alive = matches!(server.child.try_wait(), Ok(None));
            if alive && server.config_key == config_key {
                server.last_used = Instant::now();
                return Ok(ServerHandle {
                    base_url: format!("http://127.0.0.1:{}", server.port),
                    api_key: server.api_key.clone(),
                    model_id: server.model_id.clone(),
                });
            }
        }
        if let Some(previous) = guard.take() {
            previous.stop();
        }
    }

    let (mut child, port, api_key, log_path) = spawn_server(&app, model, gpu, threads, ctx_size)?;
    if let Err(error) = wait_until_ready(&mut child, port, &log_path).await {
        let _ = child.kill();
        let _ = child.wait();
        return Err(error);
    }

    let handle = ServerHandle {
        base_url: format!("http://127.0.0.1:{port}"),
        api_key: api_key.clone(),
        model_id: model.id.to_string(),
    };
    let mut guard = state.server.lock().map_err(|_| "État IA local indisponible.")?;
    *guard = Some(RunningServer {
        child,
        port,
        api_key,
        model_id: model.id.to_string(),
        config_key,
        last_used: Instant::now(),
    });
    Ok(handle)
}

/// Keeps the server alive during a long generation.
#[tauri::command]
pub fn local_ai_touch(state: State<'_, LocalAiState>) {
    if let Ok(mut guard) = state.server.lock() {
        if let Some(server) = guard.as_mut() {
            server.last_used = Instant::now();
        }
    }
}

#[tauri::command]
pub fn local_ai_stop(state: State<'_, LocalAiState>) {
    state.shutdown();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_hugging_face_etags() {
        let hex = "a".repeat(64);
        assert_eq!(normalize_sha256(&format!("\"{hex}\"")), Some(hex.clone()));
        assert_eq!(normalize_sha256(&format!("W/\"{hex}\"")), Some(hex.clone()));
        assert_eq!(normalize_sha256(&format!("sha256:{}", hex.to_uppercase())), Some(hex));
        assert_eq!(normalize_sha256("\"1234-abc\""), None);
    }

    #[test]
    fn catalog_has_one_recommended_model() {
        assert_eq!(MODELS.iter().filter(|model| model.recommended).count(), 1);
        assert!(MODELS.iter().all(|model| model.file.ends_with(".gguf")));
    }

    #[test]
    fn tokens_are_random() {
        let a = random_token();
        assert_eq!(a.len(), 32);
        assert_ne!(a, random_token());
    }

    #[cfg(unix)]
    #[test]
    fn extracts_tarballs_with_library_symlinks() {
        let root = std::env::temp_dir().join(format!("caltemp-local-ai-{}", random_token()));
        std::fs::create_dir_all(&root).unwrap();
        let archive = root.join("llama.tar.gz");
        {
            let file = std::fs::File::create(&archive).unwrap();
            let encoder = flate2::write::GzEncoder::new(file, flate2::Compression::fast());
            let mut builder = tar::Builder::new(encoder);
            let mut header = tar::Header::new_gnu();
            header.set_size(4);
            header.set_mode(0o755);
            builder.append_data(&mut header.clone(), "llama-b1/llama-server", &b"\x7fELF"[..]).unwrap();
            builder.append_data(&mut header, "llama-b1/libllama.so.0.6.0", &b"libs"[..]).unwrap();
            let mut link = tar::Header::new_gnu();
            link.set_entry_type(tar::EntryType::Symlink);
            link.set_size(0);
            builder.append_link(&mut link, "llama-b1/libllama.so", "libllama.so.0.6.0").unwrap();
            builder.into_inner().unwrap().finish().unwrap();
        }
        let dest = root.join("out");
        std::fs::create_dir_all(&dest).unwrap();
        extract_archive(&archive, &dest).unwrap();
        assert_eq!(find_server_binary(&dest, 3), Some(dest.join("llama-b1").join("llama-server")));
        assert_eq!(std::fs::read(dest.join("llama-b1").join("libllama.so")).unwrap(), b"libs");
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn finds_nested_server_binary() {
        let root = std::env::temp_dir().join(format!("caltemp-local-ai-{}", random_token()));
        let nested = root.join("llama-build").join("bin");
        std::fs::create_dir_all(&nested).unwrap();
        std::fs::write(nested.join(server_binary_name()), b"").unwrap();
        assert_eq!(find_server_binary(&root, 3), Some(nested.join(server_binary_name())));
        std::fs::remove_dir_all(root).unwrap();
    }
}
