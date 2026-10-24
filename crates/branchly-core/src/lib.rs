//! Core of Branchly: Git domain types, the repository abstraction and the
//! use-case services. This crate has no dependency on Tauri so it can be
//! tested (and reused) without a WebView.

pub mod domain;
pub mod error;
pub mod git;
pub mod graph;
pub mod recent;
pub mod services;
pub mod session;
pub mod watch;

pub use error::{Error, ErrorCode, ErrorPayload, Result};
