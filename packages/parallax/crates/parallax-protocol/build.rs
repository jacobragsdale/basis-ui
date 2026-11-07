//! Compiles `proto/parallax.proto` with protox, a pure-Rust protobuf compiler, so
//! no `protoc` binary is needed. The file lives in this crate, so the published
//! crate builds on its own; the TypeScript client is generated from it too.

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let proto = "proto/parallax.proto";
    println!("cargo:rerun-if-changed={proto}");
    let descriptors = protox::compile([proto], ["proto"])?;
    prost_build::Config::new().compile_fds(descriptors)?;
    Ok(())
}
