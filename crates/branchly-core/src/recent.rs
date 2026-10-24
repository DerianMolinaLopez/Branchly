//! Persistent list of recently opened repositories.

use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

use crate::domain::RecentRepo;
use crate::error::Result;

/// Number of entries kept in the list.
pub const MAX_RECENT: usize = 20;

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Entry {
    name: String,
    path: String,
    last_opened: i64,
}

/// A small JSON file with the most recently opened repositories, newest
/// first. Reads tolerate a missing or corrupt file (the list starts empty);
/// writes are atomic (temp file + rename).
pub struct RecentStore {
    file: PathBuf,
    lock: Mutex<()>,
}

impl RecentStore {
    pub fn new(file: PathBuf) -> Self {
        Self {
            file,
            lock: Mutex::new(()),
        }
    }

    pub fn list(&self) -> Vec<RecentRepo> {
        let _guard = self.lock.lock().unwrap_or_else(|e| e.into_inner());
        self.load()
            .into_iter()
            .map(|e| RecentRepo {
                available: Path::new(&e.path).join(".git").exists(),
                name: e.name,
                path: e.path,
                last_opened: e.last_opened,
            })
            .collect()
    }

    /// Moves `path` to the top of the list.
    pub fn touch(&self, name: &str, path: &Path) -> Result<()> {
        let _guard = self.lock.lock().unwrap_or_else(|e| e.into_inner());
        let path = path.to_string_lossy().into_owned();
        let mut entries = self.load();
        entries.retain(|e| e.path != path);
        entries.insert(
            0,
            Entry {
                name: name.to_owned(),
                path,
                last_opened: now(),
            },
        );
        entries.truncate(MAX_RECENT);
        self.save(&entries)
    }

    pub fn remove(&self, path: &str) -> Result<()> {
        let _guard = self.lock.lock().unwrap_or_else(|e| e.into_inner());
        let mut entries = self.load();
        entries.retain(|e| e.path != path);
        self.save(&entries)
    }

    fn load(&self) -> Vec<Entry> {
        std::fs::read(&self.file)
            .ok()
            .and_then(|bytes| serde_json::from_slice(&bytes).ok())
            .unwrap_or_default()
    }

    fn save(&self, entries: &[Entry]) -> Result<()> {
        if let Some(dir) = self.file.parent() {
            std::fs::create_dir_all(dir)?;
        }
        let tmp = self.file.with_extension("json.tmp");
        let json = serde_json::to_vec_pretty(entries).map_err(std::io::Error::other)?;
        std::fs::write(&tmp, json)?;
        std::fs::rename(&tmp, &self.file)?;
        Ok(())
    }
}

fn now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_most_recent_first_without_duplicates() {
        let dir = tempfile::tempdir().unwrap();
        let store = RecentStore::new(dir.path().join("recent.json"));
        store.touch("a", Path::new("/tmp/a")).unwrap();
        store.touch("b", Path::new("/tmp/b")).unwrap();
        store.touch("a", Path::new("/tmp/a")).unwrap();
        let names: Vec<_> = store.list().into_iter().map(|r| r.name).collect();
        assert_eq!(names, ["a", "b"]);

        store.remove("/tmp/a").unwrap();
        let names: Vec<_> = store.list().into_iter().map(|r| r.name).collect();
        assert_eq!(names, ["b"]);
    }

    #[test]
    fn caps_the_list_and_survives_corrupt_files() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("recent.json");
        std::fs::write(&file, b"not json").unwrap();
        let store = RecentStore::new(file);
        assert!(store.list().is_empty());
        for i in 0..(MAX_RECENT + 5) {
            store
                .touch(&i.to_string(), Path::new(&format!("/tmp/{i}")))
                .unwrap();
        }
        assert_eq!(store.list().len(), MAX_RECENT);
    }
}
