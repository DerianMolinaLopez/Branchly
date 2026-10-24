//! Conversions from `git2` types into domain types.

use git2::{Delta, Diff, DiffLineType, Patch};

use crate::domain::{
    ChangeKind, CommitSummary, DiffLine, FileChange, FileDiff, Hunk, LineKind, Signature, short_sha,
};
use crate::error::Result;

/// Maximum number of diff lines returned for a single file.
pub const MAX_DIFF_LINES: usize = 20_000;

pub fn signature(sig: &git2::Signature<'_>) -> Signature {
    let when = sig.when();
    Signature {
        name: String::from_utf8_lossy(sig.name_bytes()).into_owned(),
        email: String::from_utf8_lossy(sig.email_bytes()).into_owned(),
        timestamp: when.seconds(),
        offset_minutes: when.offset_minutes(),
    }
}

pub fn commit_summary(commit: &git2::Commit<'_>) -> CommitSummary {
    let id = commit.id().to_string();
    CommitSummary {
        short_id: short_sha(&id),
        summary: summary_of(commit),
        author: signature(&commit.author()),
        parents: commit.parent_ids().map(|p| p.to_string()).collect(),
        id,
    }
}

/// The first line of the commit message.
pub fn summary_of(commit: &git2::Commit<'_>) -> String {
    let message = String::from_utf8_lossy(commit.message_bytes());
    message.lines().next().unwrap_or_default().trim().to_owned()
}

pub fn change_kind(delta: Delta) -> ChangeKind {
    match delta {
        Delta::Added => ChangeKind::Added,
        Delta::Deleted => ChangeKind::Deleted,
        Delta::Renamed => ChangeKind::Renamed,
        Delta::Copied => ChangeKind::Copied,
        Delta::Typechange => ChangeKind::TypeChange,
        Delta::Untracked => ChangeKind::Untracked,
        Delta::Conflicted => ChangeKind::Conflicted,
        Delta::Modified | Delta::Unmodified | Delta::Ignored | Delta::Unreadable => {
            ChangeKind::Modified
        }
    }
}

pub fn path_string(path: Option<&std::path::Path>) -> String {
    path.map(|p| p.to_string_lossy().replace('\\', "/"))
        .unwrap_or_default()
}

/// Paths of a delta: `(new_path, old_path_if_different)`.
pub fn delta_paths(delta: &git2::DiffDelta<'_>) -> (String, Option<String>) {
    let new_path = path_string(delta.new_file().path());
    let old_path = path_string(delta.old_file().path());
    let path = if new_path.is_empty() {
        old_path.clone()
    } else {
        new_path
    };
    let old = (old_path != path && !old_path.is_empty()).then_some(old_path);
    (path, old)
}

/// Builds the file list of a diff, with per-file line counts.
pub fn file_changes(diff: &Diff<'_>, limit: usize) -> Result<(Vec<FileChange>, bool)> {
    let total = diff.deltas().len();
    let mut files = Vec::with_capacity(total.min(limit));
    for (idx, delta) in diff.deltas().enumerate().take(limit) {
        let (path, old_path) = delta_paths(&delta);
        let mut binary = delta.flags().is_binary();
        let (mut additions, mut deletions) = (0, 0);
        match Patch::from_diff(diff, idx)? {
            Some(patch) => {
                let (_, adds, dels) = patch.line_stats()?;
                additions = adds as u32;
                deletions = dels as u32;
                binary |= patch.delta().flags().is_binary();
            }
            None => binary = true,
        }
        files.push(FileChange {
            path,
            old_path,
            kind: change_kind(delta.status()),
            additions,
            deletions,
            binary,
        });
    }
    Ok((files, total > limit))
}

/// Converts the delta at `idx` of `diff` into a [`FileDiff`] with its hunks.
pub fn file_diff(diff: &Diff<'_>, idx: usize) -> Result<FileDiff> {
    let delta = diff
        .get_delta(idx)
        .expect("delta index comes from the same diff");
    let (path, old_path) = delta_paths(&delta);
    let kind = change_kind(delta.status());
    let mut result = FileDiff {
        path,
        old_path,
        kind,
        binary: delta.flags().is_binary(),
        hunks: Vec::new(),
        truncated: false,
    };
    let Some(patch) = Patch::from_diff(diff, idx)? else {
        result.binary = true;
        return Ok(result);
    };
    if patch.delta().flags().is_binary() {
        result.binary = true;
        return Ok(result);
    }

    let mut budget = MAX_DIFF_LINES;
    for hunk_idx in 0..patch.num_hunks() {
        let (hunk, line_count) = patch.hunk(hunk_idx)?;
        let mut lines = Vec::with_capacity(line_count.min(budget));
        for line_idx in 0..line_count {
            let line = patch.line_in_hunk(hunk_idx, line_idx)?;
            let kind = match line.origin_value() {
                DiffLineType::Addition => LineKind::Added,
                DiffLineType::Deletion => LineKind::Deleted,
                DiffLineType::Context => LineKind::Context,
                DiffLineType::ContextEOFNL | DiffLineType::AddEOFNL | DiffLineType::DeleteEOFNL => {
                    if let Some(last) = lines.last_mut() {
                        let last: &mut DiffLine = last;
                        last.no_newline = true;
                    }
                    continue;
                }
                _ => continue,
            };
            if budget == 0 {
                result.truncated = true;
                break;
            }
            budget -= 1;
            let content = String::from_utf8_lossy(line.content());
            let content = content.strip_suffix('\n').unwrap_or(&content);
            let content = content.strip_suffix('\r').unwrap_or(content);
            lines.push(DiffLine {
                kind,
                old_line: line.old_lineno(),
                new_line: line.new_lineno(),
                content: content.to_owned(),
                no_newline: false,
            });
        }
        let header = String::from_utf8_lossy(hunk.header()).trim_end().to_owned();
        result.hunks.push(Hunk {
            header,
            old_start: hunk.old_start(),
            old_lines: hunk.old_lines(),
            new_start: hunk.new_start(),
            new_lines: hunk.new_lines(),
            lines,
        });
        if result.truncated {
            break;
        }
    }
    Ok(result)
}
