//! Arrow IPC streams for frames.

use std::collections::VecDeque;
use std::io::Cursor;

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
    /// The stream's length in bytes: so far, for a stream still arriving.
    fn len(&self) -> usize;

    /// Returns `true` if the stream has no bytes.
    fn is_empty(&self) -> bool {
        self.len() == 0
    }

    /// Copies the bytes from `at` on into `out`, filling it. The caller keeps
    /// `at + out.len()` within [`StreamSource::len`].
    fn read(&self, at: usize, out: &mut [u8]);

    /// Returns `true` once every byte of the stream is here, so that a message
    /// cut short is an error rather than one still arriving. A source that holds
    /// its bytes whole always is; [`Pieces`] is once its last piece has come.
    fn is_whole(&self) -> bool {
        true
    }
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

impl<T: StreamSource + ?Sized> StreamSource for &T {
    fn len(&self) -> usize {
        (**self).len()
    }

    fn read(&self, at: usize, out: &mut [u8]) {
        (**self).read(at, out);
    }

    fn is_whole(&self) -> bool {
        (**self).is_whole()
    }
}

impl<T: StreamSource + ?Sized> StreamSource for Box<T> {
    fn len(&self) -> usize {
        (**self).len()
    }

    fn read(&self, at: usize, out: &mut [u8]) {
        (**self).read(at, out);
    }

    fn is_whole(&self) -> bool {
        (**self).is_whole()
    }
}

/// A stream that arrives in pieces, such as a response's body as the network
/// delivers it, read as one source. Pieces before the point a reader has
/// reached can be released, so the stream is never held whole.
#[derive(Debug)]
pub struct Pieces<P> {
    pieces: VecDeque<P>,
    /// Where the first piece held starts in the stream.
    first: usize,
    len: usize,
    whole: bool,
}

impl<P: StreamSource> Default for Pieces<P> {
    fn default() -> Self {
        Self::new()
    }
}

impl<P: StreamSource> Pieces<P> {
    /// A stream with none of its pieces yet.
    #[must_use]
    pub fn new() -> Self {
        Self {
            pieces: VecDeque::new(),
            first: 0,
            len: 0,
            whole: false,
        }
    }

    /// Adds the next piece to the end of the stream.
    ///
    /// # Panics
    ///
    /// Panics if the stream has already ended.
    pub fn push(&mut self, piece: P) {
        assert!(!self.whole, "a stream that has ended takes no more pieces");
        self.len += piece.len();
        if !piece.is_empty() {
            self.pieces.push_back(piece);
        }
    }

    /// Says that every piece has come.
    pub fn end(&mut self) {
        self.whole = true;
    }

    /// Releases the pieces that end at or before `before`, which a reader has
    /// read past.
    pub fn release(&mut self, before: usize) {
        while let Some(piece) = self.pieces.front() {
            let end = self.first + piece.len();
            if end > before {
                break;
            }
            self.first = end;
            self.pieces.pop_front();
        }
    }

    /// The bytes of the pieces still held.
    #[must_use]
    pub fn held(&self) -> usize {
        self.len - self.first
    }
}

impl<P: StreamSource> StreamSource for Pieces<P> {
    fn len(&self) -> usize {
        self.len
    }

    fn read(&self, at: usize, out: &mut [u8]) {
        assert!(
            at >= self.first,
            "bytes before {} were released",
            self.first
        );
        let mut start = self.first;
        let mut at = at;
        let mut written = 0;
        for piece in &self.pieces {
            if written == out.len() {
                break;
            }
            let end = start + piece.len();
            if at < end {
                let from = at - start;
                let count = (piece.len() - from).min(out.len() - written);
                piece.read(from, &mut out[written..written + count]);
                written += count;
                at += count;
            }
            start = end;
        }
        assert_eq!(written, out.len(), "a read past the stream's end");
    }

    fn is_whole(&self) -> bool {
        self.whole
    }
}

/// Where one message of a stream lies, from its length prefix to the end of
/// its body, and the rows it holds if it is a record batch.
struct Span {
    start: usize,
    end: usize,
    rows: u64,
}

/// What lies at a point of a stream.
enum Next {
    /// A message, all of it here.
    Message(Span),
    /// The stream's end: its last byte, or the end-of-stream marker.
    End,
    /// A message that has not all arrived, in a stream still arriving.
    Waiting,
}

/// The stream ends inside a message.
fn cut() -> ArrowError {
    ArrowError::IpcError("the stream ends inside a message".to_owned())
}

/// Reads the header of the message at `at`. Only the length prefix and the
/// header are read, never the body. A stream still arriving that stops inside
/// the message is waited for; a whole one is cut.
fn next_message<S: StreamSource + ?Sized>(source: &S, at: usize) -> Result<Next, ArrowError> {
    let whole = source.is_whole();
    let short = || if whole { Err(cut()) } else { Ok(Next::Waiting) };
    let word = |at: usize| -> Option<u32> {
        let end = at.checked_add(4)?;
        if end > source.len() {
            return None;
        }
        let mut four = [0; 4];
        source.read(at, &mut four);
        Some(u32::from_le_bytes(four))
    };
    if at >= source.len() {
        return Ok(if whole { Next::End } else { Next::Waiting });
    }
    let start = at;
    let mut at = at;
    let Some(mut size) = word(at) else {
        return short();
    };
    at += 4;
    // Streams before Arrow 0.15 have no continuation marker.
    if size == CONTINUATION {
        let Some(next) = word(at) else {
            return short();
        };
        size = next;
        at += 4;
    }
    if size == 0 {
        return Ok(Next::End);
    }
    let end = at.checked_add(size as usize).ok_or_else(cut)?;
    if end > source.len() {
        return short();
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
        return short();
    }
    Ok(Next::Message(Span { start, end, rows }))
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
/// copying only the messages' headers. Of a stream still arriving, it counts
/// the messages all here so far.
///
/// # Errors
///
/// Returns the errors [`stream_rows`] does.
pub fn stream_rows_of<S: StreamSource + ?Sized>(source: &S) -> Result<u64, ArrowError> {
    let mut rows: u64 = 0;
    let mut at = 0;
    // A stream may end with the end-of-stream marker, or simply stop.
    while let Next::Message(span) = next_message(source, at)? {
        rows = rows.saturating_add(span.rows);
        at = span.end;
    }
    Ok(rows)
}

/// The end-of-stream marker: the continuation marker and a length of zero.
const END_OF_STREAM: [u8; 8] = [0xFF, 0xFF, 0xFF, 0xFF, 0, 0, 0, 0];

/// What reading a stream came to next.
#[derive(Debug)]
pub enum Step {
    /// The next record batch.
    Batch(RecordBatch),
    /// The next message has not all arrived: read again once more of the
    /// stream has.
    Waiting,
    /// The stream has ended, and every batch has been read.
    End,
}

/// A stream's record batches, decoded one message at a time: each is copied
/// from the source into a buffer of its own and decoded in place there, so a
/// batch costs its own size and is freed once it is dropped, and the stream is
/// never held whole. Dictionaries the stream sends stay with the decoder. The
/// source may still be arriving, as [`Pieces`] are: [`StreamBatches::step`]
/// then waits at a message that has not all come.
pub struct StreamBatches<S: StreamSource> {
    source: S,
    at: usize,
    decoder: StreamDecoder,
    schema: Option<SchemaRef>,
    /// Batches decoded and not yet returned.
    decoded: VecDeque<RecordBatch>,
    done: bool,
    /// The rows of the record batches whose headers have been read.
    rows: u64,
    most_rows: Option<u64>,
    past_limit: bool,
}

impl<S: StreamSource> StreamBatches<S> {
    /// Reads a whole stream, starting with its schema, its first message.
    ///
    /// # Errors
    ///
    /// Returns an error if the stream does not start with a schema.
    pub fn new(source: S) -> Result<Self, ArrowError> {
        let mut batches = Self::open(source);
        // The decoder finishes a message with no body, such as the schema, when
        // the next message arrives, so the schema may come with the first batch.
        while batches.schema.is_none() && !batches.done && batches.decode_next()? {}
        if batches.schema.is_none() {
            return Err(ArrowError::IpcError("the stream has no schema".to_owned()));
        }
        Ok(batches)
    }

    /// Starts reading a stream, which may still be arriving, without reading any
    /// of it yet.
    #[must_use]
    pub fn open(source: S) -> Self {
        Self {
            source,
            at: 0,
            decoder: StreamDecoder::new(),
            schema: None,
            decoded: VecDeque::new(),
            done: false,
            rows: 0,
            most_rows: None,
            past_limit: false,
        }
    }

    /// Refuses a record batch that would take the stream past `most` rows,
    /// before its body is copied: [`StreamBatches::past_limit`] then says so.
    #[must_use]
    pub fn with_row_limit(mut self, most: u64) -> Self {
        self.most_rows = Some(most);
        self
    }

    /// The stream's schema, once it has been read: the schema decodes with the
    /// message after it, or at the stream's end.
    #[must_use]
    pub fn schema(&self) -> Option<SchemaRef> {
        self.schema.clone()
    }

    /// The rows of the record batches read so far, counted from their headers.
    #[must_use]
    pub fn rows(&self) -> u64 {
        self.rows
    }

    /// How far into the stream the messages read so far reach, in bytes.
    #[must_use]
    pub fn position(&self) -> usize {
        self.at
    }

    /// Whether the stream was refused for holding more rows than the limit.
    #[must_use]
    pub fn past_limit(&self) -> bool {
        self.past_limit
    }

    /// The source, read so far.
    #[must_use]
    pub fn source(&self) -> &S {
        &self.source
    }

    /// The source, to add to while it arrives.
    pub fn source_mut(&mut self) -> &mut S {
        &mut self.source
    }

    /// Reads the next record batch, if it is all here.
    ///
    /// # Errors
    ///
    /// Returns an error if the stream is invalid or past the row limit; the
    /// stream then reads no further.
    pub fn step(&mut self) -> Result<Step, ArrowError> {
        loop {
            if let Some(batch) = self.decoded.pop_front() {
                return Ok(Step::Batch(batch));
            }
            if self.done {
                return Ok(Step::End);
            }
            match self.decode_next() {
                Ok(true) => {}
                Ok(false) => return Ok(Step::Waiting),
                Err(error) => {
                    self.done = true;
                    return Err(error);
                }
            }
        }
    }

    /// Decodes the next message; at the stream's end, an end-of-stream marker,
    /// which finishes a last message with no body, whether the stream has its
    /// own marker or simply stops. Returns `false` when the next message has not
    /// all arrived.
    fn decode_next(&mut self) -> Result<bool, ArrowError> {
        let mut buffer = match next_message(&self.source, self.at)? {
            Next::Message(span) => {
                let rows = self.rows.saturating_add(span.rows);
                if let Some(most) = self.most_rows
                    && rows > most
                {
                    self.past_limit = true;
                    return Err(ArrowError::IpcError(format!(
                        "the stream has more than {most} rows"
                    )));
                }
                self.rows = rows;
                self.at = span.end;
                // Arrow's own buffer, aligned for any type the body holds.
                let mut bytes = MutableBuffer::from_len_zeroed(span.end - span.start);
                self.source.read(span.start, bytes.as_slice_mut());
                Buffer::from(bytes)
            }
            Next::End => {
                self.done = true;
                Buffer::from_slice_ref(END_OF_STREAM)
            }
            Next::Waiting => return Ok(false),
        };
        while !buffer.is_empty() {
            if let Some(batch) = self.decoder.decode(&mut buffer)? {
                self.decoded.push_back(batch);
            }
        }
        if self.done {
            self.decoder.finish()?;
        }
        if self.schema.is_none() {
            self.schema = self.decoder.schema();
        }
        Ok(true)
    }
}

impl<S: StreamSource> Iterator for StreamBatches<S> {
    type Item = Result<RecordBatch, ArrowError>;

    /// The next record batch; for a stream still arriving, `None` also when the
    /// next has not all come, which [`StreamBatches::step`] tells apart.
    fn next(&mut self) -> Option<Self::Item> {
        match self.step() {
            Ok(Step::Batch(batch)) => Some(Ok(batch)),
            Ok(Step::Waiting | Step::End) => None,
            Err(error) => Some(Err(error)),
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
        let schema = batches.schema().unwrap();
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

    /// Reads `bytes` as a stream arriving in pieces of `size` bytes, stepping
    /// after each piece, as the browser's worker does with a response's body.
    /// Returns the batches, and how many were read before the last piece came.
    fn batches_in_pieces(bytes: &[u8], size: usize) -> (Vec<RecordBatch>, usize) {
        let mut batches = StreamBatches::open(Pieces::<Vec<u8>>::new());
        let mut read = Vec::new();
        let mut early = 0;
        let mut pushed = 0;
        for piece in bytes.chunks(size) {
            batches.source_mut().push(piece.to_vec());
            pushed += piece.len();
            // Until the next has not all come, or the end-of-stream marker, which
            // ends the stream before its last piece is said to have come.
            while let Step::Batch(batch) = batches.step().unwrap() {
                read.push(batch);
            }
            early = read.len();
            let reached = batches.position();
            batches.source_mut().release(reached);
            // What has come past the messages read is held, and at most one piece before it.
            assert!(batches.source().held() < pushed - reached + size, "{size}");
        }
        batches.source_mut().end();
        while let Step::Batch(batch) = batches.step().unwrap() {
            read.push(batch);
        }
        assert!(matches!(batches.step().unwrap(), Step::End));
        assert!(batches.schema().is_some());
        (read, early)
    }

    #[test]
    fn a_stream_arriving_in_pieces_reads_what_a_whole_one_does() {
        let bytes = stream(&[10, 0, 2000, 5, 300]);
        let (_, whole) = decode_stream(&bytes).unwrap();
        for size in [1, 7, 64, 1000, bytes.len() / 2, bytes.len()] {
            let (read, early) = batches_in_pieces(&bytes, size);
            assert_eq!(read, whole, "pieces of {size}");
            // Every batch but the last few is read before the stream ends.
            if size < bytes.len() / 2 {
                assert!(early >= 3, "pieces of {size}: {early}");
            }
        }
        // A stream with no batches, and no end-of-stream marker, reads its schema
        // once it has ended.
        let empty = stream(&[]);
        let mut batches = StreamBatches::open(Pieces::<Vec<u8>>::new());
        batches.source_mut().push(empty[..empty.len() - 8].to_vec());
        assert!(matches!(batches.step().unwrap(), Step::Waiting));
        assert!(batches.schema().is_none());
        batches.source_mut().end();
        assert!(matches!(batches.step().unwrap(), Step::End));
        assert_eq!(batches.schema(), decode_stream(&empty).ok().map(|(s, _)| s));
    }

    #[test]
    fn a_stream_cut_short_fails_once_it_has_ended_and_not_before() {
        let whole = stream(&[100, 100]);
        let mut batches = StreamBatches::open(Pieces::<Vec<u8>>::new());
        batches
            .source_mut()
            .push(whole[..whole.len() - 20].to_vec());
        assert!(matches!(batches.step().unwrap(), Step::Batch(_)));
        assert!(matches!(batches.step().unwrap(), Step::Waiting));
        batches.source_mut().end();
        let error = batches.step().unwrap_err().to_string();
        assert!(error.contains("ends inside a message"), "{error}");
        // A whole stream counts what has come, and is cut the same way.
        let mut pieces = Pieces::<Vec<u8>>::new();
        pieces.push(whole[..whole.len() - 20].to_vec());
        assert_eq!(stream_rows_of(&pieces).unwrap(), 100);
        pieces.end();
        assert!(stream_rows_of(&pieces).is_err());
    }

    #[test]
    fn a_batch_past_the_row_limit_is_refused_before_it_is_read() {
        let bytes = stream(&[40, 40, 40]);
        let mut batches = StreamBatches::new(bytes.as_slice())
            .unwrap()
            .with_row_limit(100);
        assert!(matches!(batches.step().unwrap(), Step::Batch(_)));
        assert!(matches!(batches.step().unwrap(), Step::Batch(_)));
        assert_eq!(batches.rows(), 80);
        assert!(!batches.past_limit());
        let error = batches.step().unwrap_err().to_string();
        assert!(error.contains("more than 100 rows"), "{error}");
        assert!(batches.past_limit());
        assert_eq!(batches.rows(), 80);
        assert!(matches!(batches.step().unwrap(), Step::End));
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
