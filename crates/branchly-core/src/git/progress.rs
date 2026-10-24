use crate::domain::Progress;

/// Parses one line of `git --progress` output.
///
/// Git writes progress to stderr as `Phase:  42% (420/1000), 1.2 MiB | …`,
/// redrawing the line with `\r`. Lines from the server are prefixed with
/// `remote: `. Returns `None` for lines that do not look like progress.
pub fn parse_progress_line(line: &str) -> Option<Progress> {
    let message = line.trim();
    let body = message
        .strip_prefix("remote:")
        .map_or(message, str::trim_start);
    let (phase, rest) = body.split_once(':')?;
    let phase = phase.trim();
    if phase.is_empty() || !phase.chars().all(|c| c.is_ascii_alphabetic() || c == ' ') {
        return None;
    }
    let rest = rest.trim_start();
    let digits: String = rest.chars().take_while(char::is_ascii_digit).collect();
    if digits.is_empty() || !rest[digits.len()..].starts_with('%') {
        return None;
    }
    let percent = digits.parse::<u16>().ok()?.min(100) as u8;
    Some(Progress {
        phase: phase.to_owned(),
        percent: Some(percent),
        message: message.to_owned(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_receiving_objects() {
        let p = parse_progress_line("Receiving objects:  45% (450/1000), 1.20 MiB | 2.00 MiB/s")
            .unwrap();
        assert_eq!(p.phase, "Receiving objects");
        assert_eq!(p.percent, Some(45));
    }

    #[test]
    fn parses_remote_prefixed_lines() {
        let p = parse_progress_line("remote: Counting objects: 100% (5/5), done.").unwrap();
        assert_eq!(p.phase, "Counting objects");
        assert_eq!(p.percent, Some(100));
    }

    #[test]
    fn ignores_regular_output() {
        assert!(parse_progress_line("Cloning into 'repo'...").is_none());
        assert!(parse_progress_line("fatal: repository not found").is_none());
        assert!(parse_progress_line(" * [new branch]      main -> origin/main").is_none());
        assert!(parse_progress_line("To https://example.com/repo.git").is_none());
    }
}
