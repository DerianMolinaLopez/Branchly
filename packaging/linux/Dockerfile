# Build image for portable Linux executables (AppImage, .deb, .rpm).
#
# Ubuntu 22.04 (glibc 2.35) is the compatibility baseline: binaries built here
# run on this release and on every newer distribution. See docs/CONSTRUCCION.md.
FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      build-essential ca-certificates curl wget file git pkg-config patchelf xdg-utils \
      libwebkit2gtk-4.1-dev libgtk-3-dev libsoup-3.0-dev libjavascriptcoregtk-4.1-dev \
      librsvg2-dev libssl-dev \
 && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
 && apt-get install -y --no-install-recommends nodejs \
 && rm -rf /var/lib/apt/lists/*

RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \
      | sh -s -- -y --profile minimal --default-toolchain stable
ENV PATH="/root/.cargo/bin:${PATH}"

# linuxdeploy (which assembles the AppImage) is itself an AppImage: without
# FUSE in the container it must extract itself. NO_STRIP avoids failures of
# its bundled, older `strip` on binaries built by a recent toolchain.
ENV APPIMAGE_EXTRACT_AND_RUN=1 \
    NO_STRIP=1 \
    CARGO_TARGET_DIR=/build/target

WORKDIR /src
CMD ["/src/packaging/linux/build-in-container.sh"]
