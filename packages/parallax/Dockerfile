# The demo in one image: the reference server serves the demo app, the protocol
# on /ws and generated datasets from one process on port 8080
# (examples/container.toml).
#
#   docker build -t parallax .
#   docker run --rm -p 8080:8080 parallax    # then open http://localhost:8080
#
# Base images and the wasm-bindgen download are pinned by digest. Cargo runs four
# jobs, which keeps the build under about 4 GB of memory.

FROM rust:1.99-slim-trixie@sha256:7eab7ce19273ce785e0ca7578bdf7bc1fcbae621775a8197379a04c9f6e03cd5 AS rust
# The wasm-bindgen command-line tool must match the wasm-bindgen crate in Cargo.lock.
ADD --checksum=sha256:9687f3bb551b9f66f37ed32a40d7913a00f7962db653054e56857bc306c3227f \
    https://github.com/wasm-bindgen/wasm-bindgen/releases/download/0.2.130/wasm-bindgen-0.2.130-x86_64-unknown-linux-musl.tar.gz \
    /tmp/wasm-bindgen.tar.gz
RUN tar -xzf /tmp/wasm-bindgen.tar.gz -C /usr/local/bin --strip-components=1 \
        wasm-bindgen-0.2.130-x86_64-unknown-linux-musl/wasm-bindgen \
    && rm /tmp/wasm-bindgen.tar.gz
WORKDIR /src
# The toolchain, components and wasm32 target that rust-toolchain.toml names.
COPY rust-toolchain.toml ./
RUN rustup toolchain install
COPY . .
ENV CARGO_BUILD_JOBS=4
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/src/target \
    cargo build --release --locked -p parallax-server \
    && cargo build --release --locked -p parallax-wasm --target wasm32-unknown-unknown \
    && wasm-bindgen --target web --remove-name-section --out-dir web/projects/parallax/wasm --out-name parallax_wasm \
        target/wasm32-unknown-unknown/release/parallax_wasm.wasm \
    && cp target/release/parallax-server /usr/local/bin/

FROM node:24-trixie-slim@sha256:0820eaa85e07d0490446dd01d14707e17e6108a36988cf374899cd057eb3812d AS web
RUN npm install --global --no-fund --no-audit pnpm@12.11.2
WORKDIR /src/web
COPY web/package.json web/pnpm-lock.yaml web/pnpm-workspace.yaml ./
RUN --mount=type=cache,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile
COPY web/ ./
COPY --from=rust /src/web/projects/parallax/wasm projects/parallax/wasm
# The rest of `pnpm build:wasm`: the worker, compiled next to the wasm-bindgen output.
RUN pnpm exec tsc -p projects/parallax/worker/tsconfig.json && pnpm build:demo

FROM debian:trixie-slim@sha256:a72b4433de1cf7d6bae0c4cee74d0547f58601a643b3375f070c51600d63b6b2
COPY --from=rust /usr/local/bin/parallax-server /usr/local/bin/
COPY --from=web /src/web/dist/demo/browser /srv/demo
COPY examples/container.toml /etc/parallax/parallax.toml
USER 10001
EXPOSE 8080
# The server shuts down gracefully on SIGINT, and as process 1 it would ignore SIGTERM.
STOPSIGNAL SIGINT
CMD ["parallax-server", "--config", "/etc/parallax/parallax.toml"]
