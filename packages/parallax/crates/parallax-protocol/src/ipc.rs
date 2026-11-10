//! Arrow IPC streams for frames.

use std::collections::VecDeque;
use std::io::Cursor;
use std::sync::Arc;

use arrow_array::RecordBatch;
use arrow_buffer::{Buffer, MutableBuffer};
use arrow_ipc::reader::{StreamDecoder, StreamReader};
use arrow_ipc::writer::StreamWriter;
use arrow_schema::{ArrowError, Schema, SchemaRef};

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

/// The Arrow IPC continuation marker that starts each message.
const CONTINUATION: u32 = 0xFFFF_FFFF;

/// Bytes an Arrow IPC stream is read from a piece at a time, such as a buffer
/// the browser holds outside WebAssembly's memory, so that a load copies one
/// message at a time rather than the whole stream.
pub trait StreamSource {
    /// The stream's length in bytes.
    fn len(&self) -> usize;

    /// Returns `true` if the stream has no bytes.
    fn is_empty(&self) -> bool {
        self.len() == 0
    }

    /// Copies the bytes from `at` on into `out`, filling it. The caller keeps
    /// `at + out.len()` within [`StreamSource::len`].
    fn read(&self, at: usize, out: &mut [u8]);
}

impl StreamSource for [u8] {
    fn len(&self) -> usize {
        <[u8]>::len(self)
    }

    fn read(&self, at: usize, out: &mut [u8]) {
        out.copy_from_slice(&self[at..at + out.len()]);
    }
}

impl StreamSource for Vec<u8> {
    fn len(&self) -> usize {
        self.as_slice().len()
    }

    fn read(&self, at: usize, out: &mut [u8]) {
        self.as_slice().read(at, out);
    }
}

/// Where one message of a stream lies, from its length prefix to the end of
/// its body, and the rows it holds if it is a record batch.
struct Span {
    start: usize,
    end: usize,
    rows: u64,
}

/// The stream ends inside a message.
fn cut() -> ArrowError {
    ArrowError::IpcError("the stream ends inside a message".to_owned())
}

/// Reads the header of the message at `at`, or `None` at the stream's end:
/// its last byte, or the end-of-stream marker. Only the length prefix and the
/// header are read, never the body.
fn next_message<S: StreamSource + ?Sized>(
    source: &S,
    at: usize,
) -> Result<Option<Span>, ArrowError> {
    let word = |at: usize| -> Result<u32, ArrowError> {
        let end = at.checked_add(4).ok_or_else(cut)?;
        if end > source.len() {
            return Err(cut());
        }
        let mut four = [0; 4];
        source.read(at, &mut four);
        Ok(u32::from_le_bytes(four))
    };
    if at >= source.len() {
        return Ok(None);
    }
    let start = at;
    let mut at = at;
    let mut size = word(at)?;
    at += 4;
    // Streams before Arrow 0.15 have no continuation marker.
    if size == CONTINUATION {
        size = word(at)?;
        at += 4;
    }
    if size == 0 {
        return Ok(None);
    }
    let end = at.checked_add(size as usize).ok_or_else(cut)?;
    if end > source.len() {
        return Err(cut());
    }
    let mut metadata = vec![0; size as usize];
    source.read(at, &mut metadata);
    let message = arrow_ipc::root_as_message(&metadata)
        .map_err(|e| ArrowError::IpcError(format!("a message header is invalid: {e}")))?;
    let rows = match message.header_as_record_batch() {
        Some(batch) => u64::try_from(batch.length())
            .map_err(|_| ArrowError::IpcError("a record batch has a negative length".to_owned()))?,
        None => 0,
    };
    let body = usize::try_from(message.bodyLength())
        .map_err(|_| ArrowError::IpcError("a message has a negative length".to_owned()))?;
    let end = end.checked_add(body).ok_or_else(cut)?;
    if end > source.len() {
        return Err(cut());
    }
    Ok(Some(Span { start, end, rows }))
}

/// Counts the rows of an Arrow IPC stream from its record batches' headers,
/// without decoding any data, so that a stream too large to load can be refused
/// before it costs any memory.
///
/// # Errors
///
/// Returns an error if a message header is invalid or the stream ends inside a
/// message.
pub fn stream_rows(bytes: &[u8]) -> Result<u64, ArrowError> {
    stream_rows_of(bytes)
}

/// Counts the rows of a stream read from `source`, as [`stream_rows`] does,
/// copying only the messages' headers.
///
/// # Errors
///
/// Returns the errors [`stream_rows`] does.
pub fn stream_rows_of<S: StreamSource + ?Sized>(source: &S) -> Result<u64, ArrowError> {
    let mut rows: u64 = 0;
    let mut at = 0;
    // A stream may end with the end-of-stream marker, or simply stop.
    while let Some(span) = next_message(source, at)? {
        rows = rows.saturating_add(span.rows);
        at = span.end;
    }
    Ok(rows)
}

/// The end-of-stream marker: the continuation marker and a length of zero.
const END_OF_STREAM: [u8; 8] = [0xFF, 0xFF, 0xFF, 0xFF, 0, 0, 0, 0];

/// A stream's record batches, decoded one message at a time: each is copied
/// from the source into a buffer of its own and decoded in place there, so a
/// batch costs its own size and is freed once it is dropped, and the stream is
/// never held whole. Dictionaries the stream sends stay with the decoder.
pub struct StreamBatches<'a, S: StreamSource + ?Sized> {
    source: &'a S,
    at: usize,
    decoder: StreamDecoder,
    schema: SchemaRef,
    /// Batches decoded and not yet returned.
    decoded: VecDeque<RecordBatch>,
    done: bool,
}

impl<'a, S: StreamSource + ?Sized> StreamBatches<'a, S> {
    /// Reads the stream's schema, its first message.
    ///
    /// # Errors
    ///
    /// Returns an error if the stream does not start with a schema.
    pub fn new(source: &'a S) -> Result<Self, ArrowError> {
        let mut batches = Self {
            source,
            at: 0,
            decoder: StreamDecoder::new(),
            schema: Arc::new(Schema::empty()),
            decoded: VecDeque::new(),
            done: false,
        };
        // The decoder finishes a message with no body, such as the schema, when
        // the next message arrives, so the schema may come with the first batch.
        while batches.decoder.schema().is_none() && !batches.done {
            batches.decode_next()?;
        }
        batches.schema = batches
            .decoder
            .schema()
            .ok_or_else(|| ArrowError::IpcError("the stream has no schema".to_owned()))?;
        Ok(batches)
    }

    /// The stream's schema.
    #[must_use]
    pub fn schema(&self) -> SchemaRef {
        Arc::clone(&self.schema)
    }

    /// Decodes the next message; at the stream's end, an end-of-stream marker,
    /// which finishes a last message with no body, whether the stream has its
    /// own marker or simply stops.
    fn decode_next(&mut self) -> Result<(), ArrowError> {
        let mut buffer = match next_message(self.source, self.at)? {
            Some(span) => {
                self.at = span.end;
                // Arrow's own buffer, aligned for any type the body holds.
                let mut bytes = MutableBuffer::from_len_zeroed(span.end - span.start);
                self.source.read(span.start, bytes.as_slice_mut());
                Buffer::from(bytes)
            }
            None => {
                self.done = true;
                Buffer::from_slice_ref(END_OF_STREAM)
            }
        };
        while !buffer.is_empty() {
            if let Some(batch) = self.decoder.decode(&mut buffer)? {
                self.decoded.push_back(batch);
            }
        }
        if self.done {
            self.decoder.finish()?;
        }
        Ok(())
    }
}

impl<S: StreamSource + ?Sized> Iterator for StreamBatches<'_, S> {
    type Item = Result<RecordBatch, ArrowError>;

    fn next(&mut self) -> Option<Self::Item> {
        loop {
            if let Some(batch) = self.decoded.pop_front() {
                return Some(Ok(batch));
            }
            if self.done {
                return None;
            }
            if let Err(error) = self.decode_next() {
                self.done = true;
                return Some(Err(error));
            }
        }
    }
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

    use arrow_array::{Array, Int64Array, StringArray};

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

    /// Reads `bytes` a message at a time, as the browser's worker does.
    fn batches_of(bytes: &[u8]) -> (arrow_schema::SchemaRef, Vec<RecordBatch>) {
        let batches = StreamBatches::new(bytes).unwrap();
        let schema = batches.schema();
        (schema, batches.collect::<Result<_, _>>().unwrap())
    }

    #[test]
    fn a_message_at_a_time_reads_what_copying_reads() {
        for sizes in [&[][..], &[0], &[0, 10, 0], &[10, 0, 2000, 0], &[1]] {
            let bytes = stream(sizes);
            let (schema, copied) = decode_stream(&bytes).unwrap();
            let (read_schema, read) = batches_of(&bytes);
            assert_eq!(read_schema, schema, "{sizes:?}");
            assert_eq!(read, copied, "{sizes:?}");
            // Without its end-of-stream marker, the stream reads the same.
            let (_, stopped) = batches_of(&bytes[..bytes.len() - 8]);
            assert_eq!(stopped, copied, "{sizes:?} without its marker");
        }
        assert!(StreamBatches::new(&b"not arrow"[..]).is_err());
        assert!(StreamBatches::new(&b""[..]).is_err());
    }

    #[test]
    fn a_dictionary_the_stream_replaces_between_batches_is_read_with_each_batch() {
        use arrow_array::{DictionaryArray, types::Int32Type};
        let field = arrow_schema::Field::new(
            "d",
            arrow_schema::DataType::Dictionary(
                Box::new(arrow_schema::DataType::Int32),
                Box::new(arrow_schema::DataType::Utf8),
            ),
            true,
        );
        let schema = Arc::new(Schema::new(vec![field]));
        let parts: [Vec<Option<&str>>; 3] = [
            vec![Some("a"), Some("b"), None],
            vec![Some("z"), Some("a")],
            vec![Some("z"), Some("y"), Some("x")],
        ];
        let mut out = Vec::new();
        let mut writer = StreamWriter::try_new(&mut out, &schema).unwrap();
        for part in &parts {
            let array: DictionaryArray<Int32Type> = part.iter().copied().collect();
            writer
                .write(&RecordBatch::try_new(Arc::clone(&schema), vec![Arc::new(array)]).unwrap())
                .unwrap();
        }
        writer.finish().unwrap();
        drop(writer);
        let (_, read) = batches_of(&out);
        assert_eq!(read, decode_stream(&out).unwrap().1);
        let texts: Vec<Vec<Option<String>>> = read
            .iter()
            .map(|batch| arrow_cast_text(batch.column(0).as_ref()))
            .collect();
        let expected: Vec<Vec<Option<String>>> = parts
            .iter()
            .map(|part| part.iter().map(|t| t.map(str::to_owned)).collect())
            .collect();
        assert_eq!(texts, expected);
    }

    /// Each row of a dictionary-encoded string column, as text.
    fn arrow_cast_text(array: &dyn Array) -> Vec<Option<String>> {
        use arrow_array::cast::AsArray;
        let dictionary = array.as_any_dictionary();
        let values = dictionary.values().as_string::<i32>();
        let keys = dictionary.normalized_keys();
        (0..array.len())
            .map(|i| {
                (array.is_valid(i) && values.is_valid(keys[i]))
                    .then(|| values.value(keys[i]).to_owned())
            })
            .collect()
    }
}
