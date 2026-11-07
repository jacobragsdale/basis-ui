//! Arrow IPC streams for frames.

use std::io::Cursor;

use arrow_array::RecordBatch;
use arrow_buffer::Buffer;
use arrow_ipc::reader::{StreamDecoder, StreamReader};
use arrow_ipc::writer::StreamWriter;
use arrow_schema::{ArrowError, Schema};

/// Encodes one batch as an Arrow IPC stream.
///
/// # Errors
///
/// Returns an error if Arrow cannot encode the batch.
pub fn encode_batch(batch: &RecordBatch) -> Result<Vec<u8>, ArrowError> {
    let mut out = Vec::new();
    let mut writer = StreamWriter::try_new(&mut out, &batch.schema())?;
    writer.write(batch)?;
    writer.finish()?;
    drop(writer);
    Ok(out)
}

/// Encodes a schema alone as an Arrow IPC stream with no batches.
///
/// # Errors
///
/// Returns an error if Arrow cannot encode the schema.
pub fn encode_schema(schema: &Schema) -> Result<Vec<u8>, ArrowError> {
    let mut out = Vec::new();
    let mut writer = StreamWriter::try_new(&mut out, schema)?;
    writer.finish()?;
    drop(writer);
    Ok(out)
}

/// Decodes an Arrow IPC stream into its schema and batches. A stream with a schema
/// and no batches is an empty result, not an error.
///
/// # Errors
///
/// Returns an error if the bytes are not a valid stream.
pub fn decode_stream(
    bytes: &[u8],
) -> Result<(arrow_schema::SchemaRef, Vec<RecordBatch>), ArrowError> {
    let reader = StreamReader::try_new(Cursor::new(bytes), None)?;
    let schema = reader.schema();
    let batches = reader.collect::<Result<Vec<_>, _>>()?;
    Ok((schema, batches))
}

/// Decodes an Arrow IPC stream in place: the arrays point into `bytes` rather than
/// copying them, so the stream costs its own size once, not twice. Buffers the
/// stream leaves misaligned are copied.
///
/// # Errors
///
/// Returns an error if the bytes are not a valid stream.
pub fn decode_stream_in_place(
    bytes: Vec<u8>,
) -> Result<(arrow_schema::SchemaRef, Vec<RecordBatch>), ArrowError> {
    let mut buffer = Buffer::from_vec(bytes);
    let mut decoder = StreamDecoder::new();
    let mut batches = Vec::new();
    while !buffer.is_empty() {
        if let Some(batch) = decoder.decode(&mut buffer)? {
            batches.push(batch);
        }
    }
    decoder.finish()?;
    let schema = decoder
        .schema()
        .ok_or_else(|| ArrowError::IpcError("the stream has no schema".to_owned()))?;
    Ok((schema, batches))
}

/// The Arrow IPC continuation marker that starts each message.
const CONTINUATION: u32 = 0xFFFF_FFFF;

/// Counts the rows of an Arrow IPC stream from its record batches' headers,
/// without decoding any data, so that a stream too large to load can be refused
/// before it costs any memory.
///
/// # Errors
///
/// Returns an error if a message header is invalid or the stream ends inside a
/// message.
pub fn stream_rows(bytes: &[u8]) -> Result<u64, ArrowError> {
    let cut = || ArrowError::IpcError("the stream ends inside a message".to_owned());
    let word = |at: usize| -> Result<u32, ArrowError> {
        let end = at.checked_add(4).ok_or_else(cut)?;
        let four: [u8; 4] = bytes
            .get(at..end)
            .and_then(|b| b.try_into().ok())
            .ok_or_else(cut)?;
        Ok(u32::from_le_bytes(four))
    };
    let mut rows: u64 = 0;
    let mut at = 0;
    // A stream may end with the end-of-stream marker, or simply stop.
    while at < bytes.len() {
        let mut size = word(at)?;
        at += 4;
        // Streams before Arrow 0.15 have no continuation marker.
        if size == CONTINUATION {
            size = word(at)?;
            at += 4;
        }
        if size == 0 {
            break;
        }
        let end = at.checked_add(size as usize).ok_or_else(cut)?;
        let metadata = bytes.get(at..end).ok_or_else(cut)?;
        let message = arrow_ipc::root_as_message(metadata)
            .map_err(|e| ArrowError::IpcError(format!("a message header is invalid: {e}")))?;
        if let Some(batch) = message.header_as_record_batch() {
            let length = u64::try_from(batch.length()).map_err(|_| {
                ArrowError::IpcError("a record batch has a negative length".to_owned())
            })?;
            rows = rows.saturating_add(length);
        }
        let body = usize::try_from(message.bodyLength())
            .map_err(|_| ArrowError::IpcError("a message has a negative length".to_owned()))?;
        at = end.checked_add(body).ok_or_else(cut)?;
        if at > bytes.len() {
            return Err(cut());
        }
    }
    Ok(rows)
}

/// Decodes every batch of an Arrow IPC stream.
///
/// # Errors
///
/// Returns an error if the bytes are not a valid stream.
pub fn decode_batches(bytes: &[u8]) -> Result<Vec<RecordBatch>, ArrowError> {
    StreamReader::try_new(Cursor::new(bytes), None)?.collect()
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use arrow_array::{Int64Array, StringArray};

    use super::*;

    #[test]
    fn round_trips() {
        let batch = RecordBatch::try_from_iter([
            ("a", Arc::new(Int64Array::from(vec![1, 2])) as _),
            ("b", Arc::new(StringArray::from(vec![Some("x"), None])) as _),
        ])
        .unwrap();
        let decoded = decode_batches(&encode_batch(&batch).unwrap()).unwrap();
        assert_eq!(decoded, vec![batch]);
    }

    /// A stream of batches of these sizes, with a text column so that bodies vary.
    fn stream(sizes: &[i64]) -> Vec<u8> {
        let schema = Arc::new(Schema::new(vec![
            arrow_schema::Field::new("a", arrow_schema::DataType::Int64, false),
            arrow_schema::Field::new("b", arrow_schema::DataType::Utf8, true),
        ]));
        let mut out = Vec::new();
        let mut writer = StreamWriter::try_new(&mut out, &schema).unwrap();
        for &size in sizes {
            let a = Int64Array::from_iter_values(0..size);
            let b = StringArray::from_iter((0..size).map(|i| (i % 3 != 0).then(|| format!("{i}"))));
            writer
                .write(
                    &RecordBatch::try_new(Arc::clone(&schema), vec![Arc::new(a), Arc::new(b)])
                        .unwrap(),
                )
                .unwrap();
        }
        writer.finish().unwrap();
        drop(writer);
        out
    }

    #[test]
    fn rows_are_counted_from_the_batch_headers() {
        assert_eq!(stream_rows(&stream(&[])).unwrap(), 0);
        assert_eq!(stream_rows(&stream(&[3, 0, 1000, 65_536])).unwrap(), 66_539);
        // A stream may stop without its end-of-stream marker.
        let whole = stream(&[5, 7]);
        assert_eq!(stream_rows(&whole[..whole.len() - 8]).unwrap(), 12);
    }

    #[test]
    fn a_cut_or_foreign_stream_is_refused() {
        let whole = stream(&[100, 100]);
        for cut in [3, 10, whole.len() - 9] {
            let error = stream_rows(&whole[..cut]).unwrap_err().to_string();
            assert!(error.contains("ends inside a message"), "{cut}: {error}");
        }
        assert!(stream_rows(b"not an arrow stream at all").is_err());
    }

    #[test]
    fn decoding_in_place_reads_what_copying_reads() {
        let bytes = stream(&[10, 0, 2000]);
        let (schema, copied) = decode_stream(&bytes).unwrap();
        let (in_place_schema, in_place) = decode_stream_in_place(bytes).unwrap();
        assert_eq!(in_place_schema, schema);
        assert_eq!(in_place, copied);
        assert!(decode_stream_in_place(b"not arrow".to_vec()).is_err());
        assert!(decode_stream_in_place(Vec::new()).is_err());
    }
}
