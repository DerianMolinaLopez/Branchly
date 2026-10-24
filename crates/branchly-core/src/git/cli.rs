//! Adapter around the `git` executable.
//!
//! Used for operations whose behaviour depends on the user's Git setup:
//! transports and credentials (ssh-agent, credential helpers), hooks, commit
//! signing and merge strategies. Branchly never sees or stores credentials;
//! prompts are disabled so a missing credential fails fast instead of hanging.

use std::ffi::OsStr;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, ExitStatus, Stdio};
use std::sync::mpsc;
use std::thread;
use std::time::Duration;

use super::Operation;
use super::progress::parse_progress_line;
use crate::domain::Progress;
use crate::error::{Error, Result};

/// Captured result of a finished git process.
#[derive(Debug)]
pub struct CliOutput {
    pub status: ExitStatus,
    pub stdout: String,
    pub stderr: String,
}

impl CliOutput {
    pub fn success(&self) -> bool {
        self.status.success()
    }
}

/// Handle to the `git` executable found on `PATH`.
#[derive(Debug, Clone)]
pub struct GitCli {
    program: PathBuf,
}

impl Default for GitCli {
    fn default() -> Self {
        Self::new()
    }
}

impl GitCli {
    pub fn new() -> Self {
        Self {
            program: PathBuf::from("git"),
        }
    }

    /// The installed git version, e.g. `git version 2.45.0`.
    pub fn version(&self) -> Result<String> {
        let out = self.output(Path::new("."), ["--version"], None)?;
        Ok(out.stdout.trim().to_owned())
    }

    /// Runs git and returns stdout, failing on a non-zero exit status.
    pub fn run<I, S>(&self, cwd: &Path, args: I) -> Result<String>
    where
        I: IntoIterator<Item = S>,
        S: AsRef<OsStr>,
    {
        let args: Vec<_> = args.into_iter().map(|a| a.as_ref().to_owned()).collect();
        let out = self.output(cwd, &args, None)?;
        check(&args, out).map(|out| out.stdout)
    }

    /// Like [`run`](Self::run) but writes `input` to the process' stdin.
    pub fn run_with_input<I, S>(&self, cwd: &Path, args: I, input: &str) -> Result<String>
    where
        I: IntoIterator<Item = S>,
        S: AsRef<OsStr>,
    {
        let args: Vec<_> = args.into_iter().map(|a| a.as_ref().to_owned()).collect();
        let out = self.output(cwd, &args, Some(input))?;
        check(&args, out).map(|out| out.stdout)
    }

    /// Runs git without interpreting the exit status.
    pub fn output<I, S>(&self, cwd: &Path, args: I, input: Option<&str>) -> Result<CliOutput>
    where
        I: IntoIterator<Item = S>,
        S: AsRef<OsStr>,
    {
        let mut cmd = self.command(cwd, args);
        cmd.stdin(if input.is_some() {
            Stdio::piped()
        } else {
            Stdio::null()
        })
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
        let mut child = spawn(&mut cmd)?;
        if let (Some(input), Some(mut stdin)) = (input, child.stdin.take()) {
            stdin.write_all(input.as_bytes())?;
        }
        let out = child.wait_with_output()?;
        Ok(CliOutput {
            status: out.status,
            stdout: String::from_utf8_lossy(&out.stdout).into_owned(),
            stderr: String::from_utf8_lossy(&out.stderr).into_owned(),
        })
    }

    /// Runs a long operation, streaming `--progress` output and honouring
    /// cancellation. Returns the non-progress stderr lines on success.
    pub fn run_streaming<I, S>(&self, cwd: &Path, args: I, op: &mut Operation<'_>) -> Result<String>
    where
        I: IntoIterator<Item = S>,
        S: AsRef<OsStr>,
    {
        let args: Vec<_> = args.into_iter().map(|a| a.as_ref().to_owned()).collect();
        let mut cmd = self.command(cwd, &args);
        cmd.stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        let mut child = spawn(&mut cmd)?;

        let mut stdout = child.stdout.take().expect("stdout is piped");
        let stderr = child.stderr.take().expect("stderr is piped");
        let stdout_reader = thread::spawn(move || {
            let mut buf = Vec::new();
            let _ = stdout.read_to_end(&mut buf);
            String::from_utf8_lossy(&buf).into_owned()
        });
        let (tx, rx) = mpsc::channel::<String>();
        let stderr_reader = thread::spawn(move || split_lines(stderr, &tx));

        let mut messages = Vec::new();
        let status = loop {
            if op.cancel.is_cancelled() {
                kill(&mut child);
                return Err(Error::Cancelled);
            }
            match rx.recv_timeout(Duration::from_millis(50)) {
                Ok(line) => match parse_progress_line(&line) {
                    Some(progress) => (op.on_progress)(progress),
                    None => {
                        (op.on_progress)(Progress {
                            phase: String::new(),
                            percent: None,
                            message: line.clone(),
                        });
                        messages.push(line);
                    }
                },
                Err(mpsc::RecvTimeoutError::Timeout) => {}
                Err(mpsc::RecvTimeoutError::Disconnected) => {
                    // stderr closed: the process is exiting.
                    if let Some(status) = child.try_wait()? {
                        break status;
                    }
                    thread::sleep(Duration::from_millis(20));
                }
            }
        };
        let _ = stderr_reader.join();
        let stdout = stdout_reader.join().unwrap_or_default();

        let stderr = messages.join("\n");
        if status.success() {
            let mut text = stdout.trim().to_owned();
            if !stderr.is_empty() {
                if !text.is_empty() {
                    text.push('\n');
                }
                text.push_str(&stderr);
            }
            Ok(text)
        } else {
            Err(Error::GitCommand {
                command: describe(&args),
                stderr: clean_stderr(&stderr),
                code: status.code(),
            })
        }
    }

    /// Clones `url` into `dest`, which must not exist or be an empty folder.
    pub fn clone_repo(&self, url: &str, dest: &Path, op: &mut Operation<'_>) -> Result<()> {
        let parent = dest
            .parent()
            .filter(|p| !p.as_os_str().is_empty())
            .unwrap_or(Path::new("."));
        let dest = dest.as_os_str();
        self.run_streaming(
            parent,
            [
                OsStr::new("clone"),
                OsStr::new("--progress"),
                OsStr::new("--"),
                OsStr::new(url),
                dest,
            ],
            op,
        )
        .map(|_| ())
    }

    fn command<I, S>(&self, cwd: &Path, args: I) -> Command
    where
        I: IntoIterator<Item = S>,
        S: AsRef<OsStr>,
    {
        let mut cmd = Command::new(&self.program);
        cmd.current_dir(cwd)
            .args(args)
            // Never block on an interactive prompt: there is no terminal.
            .env("GIT_TERMINAL_PROMPT", "0")
            // Accept default messages instead of opening an editor.
            .env("GIT_EDITOR", "true")
            // Stable, parseable English output.
            .env("LC_ALL", "C")
            .env("LANGUAGE", "C");
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }
        cmd
    }
}

fn spawn(cmd: &mut Command) -> Result<Child> {
    cmd.spawn().map_err(|err| match err.kind() {
        std::io::ErrorKind::NotFound => Error::GitNotFound,
        _ => Error::Io(err),
    })
}

fn kill(child: &mut Child) {
    let _ = child.kill();
    let _ = child.wait();
}

fn check(args: &[std::ffi::OsString], out: CliOutput) -> Result<CliOutput> {
    if out.success() {
        Ok(out)
    } else {
        Err(Error::GitCommand {
            command: describe(args),
            stderr: clean_stderr(&out.stderr),
            code: out.status.code(),
        })
    }
}

/// Splits a stream on `\r` and `\n`, sending each non-empty segment.
fn split_lines(mut reader: impl Read, tx: &mpsc::Sender<String>) {
    let mut buf = [0u8; 4096];
    let mut line = Vec::new();
    loop {
        let n = match reader.read(&mut buf) {
            Ok(0) | Err(_) => break,
            Ok(n) => n,
        };
        for &byte in &buf[..n] {
            if byte == b'\r' || byte == b'\n' {
                flush(&mut line, tx);
            } else {
                line.push(byte);
            }
        }
    }
    flush(&mut line, tx);
}

fn flush(line: &mut Vec<u8>, tx: &mpsc::Sender<String>) {
    let text = String::from_utf8_lossy(line);
    let text = text.trim_end();
    if !text.trim().is_empty() {
        let _ = tx.send(text.to_owned());
    }
    line.clear();
}

fn describe(args: &[std::ffi::OsString]) -> String {
    args.iter()
        .map(|a| a.to_string_lossy())
        .take(3)
        .collect::<Vec<_>>()
        .join(" ")
}

/// Drops hint lines and the `error:`/`fatal:` prefixes for display.
pub(crate) fn clean_stderr(stderr: &str) -> String {
    let lines: Vec<&str> = stderr
        .lines()
        .map(str::trim)
        .filter(|l| !l.is_empty() && !l.starts_with("hint:"))
        .map(|l| {
            l.strip_prefix("fatal: ")
                .or_else(|| l.strip_prefix("error: "))
                .unwrap_or(l)
        })
        .collect();
    if lines.is_empty() {
        "git terminó con un error".to_owned()
    } else {
        lines.join("\n")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn split_lines_handles_carriage_returns() {
        let (tx, rx) = mpsc::channel();
        split_lines(
            &b"Receiving:  1%\rReceiving: 50%\rReceiving: 100%, done.\nok\n"[..],
            &tx,
        );
        drop(tx);
        let lines: Vec<String> = rx.iter().collect();
        assert_eq!(
            lines,
            [
                "Receiving:  1%",
                "Receiving: 50%",
                "Receiving: 100%, done.",
                "ok"
            ]
        );
    }

    #[test]
    fn clean_stderr_strips_prefixes_and_hints() {
        let cleaned = clean_stderr("hint: do this\nfatal: something broke\n");
        assert_eq!(cleaned, "something broke");
    }
}
