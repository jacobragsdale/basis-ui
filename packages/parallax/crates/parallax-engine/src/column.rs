//! Typed, slot-addressed column storage.
//!
//! A column holds one value per table slot. Slots are stable: an update overwrites a
//! slot in place and a delete frees it for reuse. Text is stored as dictionary codes.

use std::cmp::Ordering;
use std::sync::Arc;

use arrow_array::cast::AsArray;
use arrow_array::types::{
    Date32Type, Decimal128Type, Float32Type, Float64Type, Int8Type, Int16Type, Int32Type,
    Int64Type, TimestampMicrosecondType, TimestampMillisecondType, TimestampNanosecondType,
    TimestampSecondType, UInt8Type, UInt16Type, UInt32Type,
};
use arrow_array::{
    Array, ArrayRef, BooleanArray, Date32Array, Decimal128Array, Float64Array, Int64Array,
    LargeStringArray, StringArray, StringViewArray, TimestampMicrosecondArray,
};
use arrow_buffer::NullBuffer;
use arrow_schema::{DataType, TimeUnit};

use crate::bitmap::Bitmap;
use crate::dictionary::Dictionary;
use crate::error::LoadError;
use crate::types::{ColumnType, Key, Scalar};

/// The values of a column, one per slot. Invalid (null) slots hold a placeholder.
#[derive(Clone, Debug)]
pub(crate) enum Values {
    Boolean(Vec<bool>),
    Int64(Vec<i64>),
    Float64(Vec<f64>),
    Decimal(Decimals),
    Utf8 {
        codes: Vec<u32>,
        dictionary: Dictionary,
    },
    Date32(Vec<i32>),
    Timestamp(Vec<i64>),
}

/// A decimal column's unscaled values: a word each while every value fits in
/// one, as a price or an amount of money nearly always does whatever its
/// declared precision, else two. A value that does not fit widens the column.
#[derive(Clone, Debug)]
pub(crate) enum Decimals {
    Narrow(Vec<i64>),
    Wide(Vec<i128>),
}

impl Decimals {
    #[inline]
    pub(crate) fn get(&self, slot: usize) -> i128 {
        match self {
            Self::Narrow(v) => i128::from(v[slot]),
            Self::Wide(v) => v[slot],
        }
    }

    /// The values as words, after widening them if `value` does not fit in one.
    fn narrow_for(&mut self, value: i128) -> Result<&mut Vec<i64>, &mut Vec<i128>> {
        if let Self::Narrow(v) = self
            && i64::try_from(value).is_err()
        {
            *self = Self::Wide(v.iter().map(|&x| i128::from(x)).collect());
        }
        match self {
            Self::Narrow(v) => Ok(v),
            Self::Wide(v) => Err(v),
        }
    }

    pub(crate) fn set(&mut self, slot: usize, value: i128) {
        match self.narrow_for(value) {
            Ok(v) => v[slot] = value as i64,
            Err(v) => v[slot] = value,
        }
    }

    pub(crate) fn push(&mut self, value: i128) {
        match self.narrow_for(value) {
            Ok(v) => v.push(value as i64),
            Err(v) => v.push(value),
        }
    }

    /// Appends `values`, those that `nulls` marks null as zero.
    fn extend_valid(&mut self, values: &[i128], nulls: Option<&NullBuffer>) {
        let valid = |i: usize| nulls.is_none_or(|n| n.is_valid(i));
        let fits = values
            .iter()
            .enumerate()
            .all(|(i, &x)| !valid(i) || i64::try_from(x).is_ok());
        if !fits && let Self::Narrow(v) = self {
            *self = Self::Wide(v.iter().map(|&x| i128::from(x)).collect());
        }
        let value = |(i, &x): (usize, &i128)| if valid(i) { x } else { 0 };
        match self {
            Self::Narrow(v) => v.extend(values.iter().enumerate().map(|e| value(e) as i64)),
            Self::Wide(v) => v.extend(values.iter().enumerate().map(value)),
        }
    }

    fn reserve_exact(&mut self, additional: usize) {
        match self {
            Self::Narrow(v) => v.reserve_exact(additional),
            Self::Wide(v) => v.reserve_exact(additional),
        }
    }

    fn heap_bytes(&self) -> usize {
        match self {
            Self::Narrow(v) => v.capacity() * 8,
            Self::Wide(v) => v.capacity() * 16,
        }
    }
}

/// One column of a table, or of a batch being loaded.
#[derive(Clone, Debug)]
pub struct Column {
    pub(crate) ty: ColumnType,
    pub(crate) values: Values,
    pub(crate) valid: Bitmap,
}

impl Column {
    /// Returns an empty column of type `ty`.
    #[must_use]
    pub fn new(ty: ColumnType) -> Self {
        let values = match ty {
            ColumnType::Boolean => Values::Boolean(Vec::new()),
            ColumnType::Int64 => Values::Int64(Vec::new()),
            ColumnType::Float64 => Values::Float64(Vec::new()),
            ColumnType::Decimal { .. } => Values::Decimal(Decimals::Narrow(Vec::new())),
            ColumnType::Utf8 => Values::Utf8 {
                codes: Vec::new(),
                dictionary: Dictionary::new(),
            },
            ColumnType::Date32 => Values::Date32(Vec::new()),
            ColumnType::Timestamp { .. } => Values::Timestamp(Vec::new()),
        };
        Self {
            ty,
            values,
            valid: Bitmap::new(),
        }
    }

    /// The column's type.
    #[must_use]
    pub fn column_type(&self) -> &ColumnType {
        &self.ty
    }

    /// The number of slots.
    #[must_use]
    pub fn len(&self) -> usize {
        self.valid.len()
    }

    /// Returns `true` if the column has no slots.
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.valid.is_empty()
    }

    /// Returns `true` if `slot` holds a value rather than null.
    #[must_use]
    pub fn is_valid(&self, slot: usize) -> bool {
        self.valid.get(slot)
    }

    pub(crate) fn dictionary(&self) -> Option<&Dictionary> {
        match &self.values {
            Values::Utf8 { dictionary, .. } => Some(dictionary),
            _ => None,
        }
    }

    pub(crate) fn refresh_ranks(&mut self) {
        if let Values::Utf8 { dictionary, .. } = &mut self.values {
            dictionary.refresh_ranks();
        }
    }

    /// Returns the key of `slot`, for grouping and change detection.
    pub(crate) fn key(&self, slot: usize) -> Key {
        if !self.valid.get(slot) {
            return Key::Null;
        }
        match &self.values {
            Values::Boolean(v) => Key::Bool(v[slot]),
            Values::Int64(v) => Key::Int(v[slot]),
            Values::Float64(v) => Key::float(v[slot]),
            Values::Decimal(v) => Key::Decimal(v.get(slot)),
            Values::Utf8 { codes, .. } => Key::Str(codes[slot]),
            Values::Date32(v) => Key::Date(v[slot]),
            Values::Timestamp(v) => Key::Ts(v[slot]),
        }
    }

    /// Returns the value of `slot`.
    #[must_use]
    pub fn scalar(&self, slot: usize) -> Scalar {
        self.key_to_scalar(self.key(slot))
    }

    pub(crate) fn key_to_scalar(&self, key: Key) -> Scalar {
        match key {
            Key::Null => Scalar::Null,
            Key::Bool(b) => Scalar::Boolean(b),
            Key::Int(i) => Scalar::Int64(i),
            Key::Float(bits) => Scalar::Float64(f64::from_bits(bits)),
            Key::Decimal(d) => Scalar::Decimal(d),
            Key::Str(code) => Scalar::Utf8(
                self.dictionary()
                    .expect("string keys come from text columns")
                    .get(code)
                    .to_owned(),
            ),
            Key::Date(d) => Scalar::Date32(d),
            Key::Ts(t) => Scalar::Timestamp(t),
        }
    }

    /// About how many bytes of the heap the column holds: its values, its
    /// validity and its dictionary's text.
    pub(crate) fn heap_bytes(&self) -> usize {
        use std::mem::size_of_val;
        let values = match &self.values {
            Values::Boolean(v) => v.capacity(),
            Values::Int64(v) | Values::Timestamp(v) => v.capacity() * 8,
            Values::Float64(v) => v.capacity() * 8,
            Values::Decimal(v) => v.heap_bytes(),
            Values::Date32(v) => v.capacity() * 4,
            Values::Utf8 { codes, dictionary } => codes.capacity() * 4 + dictionary.heap_bytes(),
        };
        values + size_of_val(self.valid.words())
    }

    /// The key that [`Self::key_to_scalar`] turns into `scalar`, if this column
    /// can hold it: `None` for text it has never held, or a value of another
    /// type.
    pub(crate) fn scalar_to_key(&self, scalar: &Scalar) -> Option<Key> {
        Some(match (scalar, &self.values) {
            (Scalar::Null, _) => Key::Null,
            (Scalar::Boolean(b), Values::Boolean(_)) => Key::Bool(*b),
            (Scalar::Int64(i), Values::Int64(_)) => Key::Int(*i),
            (Scalar::Float64(f), Values::Float64(_)) => Key::float(*f),
            (Scalar::Decimal(d), Values::Decimal(_)) => Key::Decimal(*d),
            (Scalar::Utf8(text), Values::Utf8 { dictionary, .. }) => {
                Key::Str(dictionary.code(text)?)
            }
            (Scalar::Date32(d), Values::Date32(_)) => Key::Date(*d),
            (Scalar::Timestamp(t), Values::Timestamp(_)) => Key::Ts(*t),
            _ => return None,
        })
    }

    /// Returns the string of a text key in this column.
    pub(crate) fn text(&self, key: Key) -> Option<&str> {
        match key {
            Key::Str(code) => self.dictionary().map(|d| d.get(code)),
            _ => None,
        }
    }

    /// Compares two keys of this column in display order. Nulls sort last.
    pub(crate) fn cmp_keys(&self, a: Key, b: Key) -> Ordering {
        match (a, b) {
            (Key::Null, Key::Null) => Ordering::Equal,
            (Key::Null, _) => Ordering::Greater,
            (_, Key::Null) => Ordering::Less,
            (Key::Bool(x), Key::Bool(y)) => x.cmp(&y),
            (Key::Int(x), Key::Int(y)) => x.cmp(&y),
            (Key::Float(x), Key::Float(y)) => f64::from_bits(x).total_cmp(&f64::from_bits(y)),
            (Key::Decimal(x), Key::Decimal(y)) => x.cmp(&y),
            (Key::Str(x), Key::Str(y)) => {
                let d = self.dictionary().expect("text column");
                d.rank(x).cmp(&d.rank(y))
            }
            (Key::Date(x), Key::Date(y)) => x.cmp(&y),
            (Key::Ts(x), Key::Ts(y)) => x.cmp(&y),
            _ => unreachable!("keys of one column share a type"),
        }
    }

    /// Returns `slot` as a double, for floating-point aggregates.
    pub(crate) fn f64(&self, slot: usize) -> Option<f64> {
        if !self.valid.get(slot) {
            return None;
        }
        match &self.values {
            Values::Float64(v) => Some(v[slot]),
            Values::Int64(v) => Some(v[slot] as f64),
            _ => None,
        }
    }

    /// Returns `slot` as an unscaled integer: the value of an integer column, or the
    /// unscaled value of a decimal column.
    pub(crate) fn exact(&self, slot: usize) -> Option<i128> {
        if !self.valid.get(slot) {
            return None;
        }
        match &self.values {
            Values::Int64(v) => Some(i128::from(v[slot])),
            Values::Decimal(v) => Some(v.get(slot)),
            _ => None,
        }
    }

    /// Appends a null.
    pub(crate) fn push_null(&mut self) {
        match &mut self.values {
            Values::Boolean(v) => v.push(false),
            Values::Int64(v) => v.push(0),
            Values::Float64(v) => v.push(0.0),
            Values::Decimal(v) => v.push(0),
            Values::Utf8 { codes, .. } => codes.push(0),
            Values::Date32(v) => v.push(0),
            Values::Timestamp(v) => v.push(0),
        }
        self.valid.push(false);
    }

    /// Copies `source[source_slot]` into `self[slot]`, re-interning text.
    pub(crate) fn set_from(&mut self, slot: usize, source: &Self, source_slot: usize) {
        let valid = source.valid.get(source_slot);
        self.valid.set(slot, valid);
        if !valid {
            return;
        }
        match (&mut self.values, &source.values) {
            (Values::Boolean(d), Values::Boolean(s)) => d[slot] = s[source_slot],
            (Values::Int64(d), Values::Int64(s)) => d[slot] = s[source_slot],
            (Values::Float64(d), Values::Float64(s)) => d[slot] = s[source_slot],
            (Values::Decimal(d), Values::Decimal(s)) => d.set(slot, s.get(source_slot)),
            (Values::Date32(d), Values::Date32(s)) => d[slot] = s[source_slot],
            (Values::Timestamp(d), Values::Timestamp(s)) => d[slot] = s[source_slot],
            (
                Values::Utf8 { codes, dictionary },
                Values::Utf8 {
                    codes: source_codes,
                    dictionary: source_dictionary,
                },
            ) => {
                codes[slot] = dictionary.intern(source_dictionary.get(source_codes[source_slot]));
            }
            _ => unreachable!("columns share a type"),
        }
    }

    /// Appends `source[source_slot]`.
    pub(crate) fn push_from(&mut self, source: &Self, source_slot: usize) {
        self.push_null();
        let slot = self.len() - 1;
        self.set_from(slot, source, source_slot);
    }

    /// Returns `true` if `self[slot]` and `other[other_slot]` hold the same value.
    /// Text is compared by content, so the two columns may have different
    /// dictionaries. Floats compare by bits, so a change in the sign of zero counts.
    pub(crate) fn same_value(&self, slot: usize, other: &Self, other_slot: usize) -> bool {
        let (a, b) = (self.valid.get(slot), other.valid.get(other_slot));
        if !a || !b {
            return a == b;
        }
        match (&self.values, &other.values) {
            (Values::Boolean(x), Values::Boolean(y)) => x[slot] == y[other_slot],
            (Values::Int64(x), Values::Int64(y)) => x[slot] == y[other_slot],
            (Values::Float64(x), Values::Float64(y)) => {
                x[slot].to_bits() == y[other_slot].to_bits()
            }
            (Values::Decimal(x), Values::Decimal(y)) => x.get(slot) == y.get(other_slot),
            (Values::Date32(x), Values::Date32(y)) => x[slot] == y[other_slot],
            (Values::Timestamp(x), Values::Timestamp(y)) => x[slot] == y[other_slot],
            (
                Values::Utf8 {
                    codes: x,
                    dictionary: dx,
                },
                Values::Utf8 {
                    codes: y,
                    dictionary: dy,
                },
            ) => dx.get(x[slot]) == dy.get(y[other_slot]),
            _ => false,
        }
    }

    /// Builds an Arrow array of the values at `slots`, in order.
    #[must_use]
    pub fn to_arrow(&self, slots: &[usize]) -> ArrayRef {
        self.arrow_of(slots.len(), |i| Some(slots[i]))
    }

    /// Builds an Arrow array with the value at each of `slots`, in order, and a null
    /// where there is no slot.
    #[must_use]
    pub fn to_arrow_or_null(&self, slots: &[Option<usize>]) -> ArrayRef {
        self.arrow_of(slots.len(), |i| slots[i])
    }

    /// Builds an Arrow array of `len` values, the `i`th from slot `at(i)`, if any.
    fn arrow_of(&self, len: usize, at: impl Fn(usize) -> Option<usize>) -> ArrayRef {
        let value = |i: usize| at(i).filter(|&s| self.valid.get(s));
        match &self.values {
            Values::Boolean(v) => Arc::new(
                (0..len)
                    .map(|i| value(i).map(|s| v[s]))
                    .collect::<BooleanArray>(),
            ),
            Values::Int64(v) => Arc::new(
                (0..len)
                    .map(|i| value(i).map(|s| v[s]))
                    .collect::<Int64Array>(),
            ),
            Values::Float64(v) => Arc::new(
                (0..len)
                    .map(|i| value(i).map(|s| v[s]))
                    .collect::<Float64Array>(),
            ),
            Values::Decimal(v) => {
                let ColumnType::Decimal { precision, scale } = self.ty else {
                    unreachable!("decimal values have a decimal type")
                };
                Arc::new(
                    (0..len)
                        .map(|i| value(i).map(|s| v.get(s)))
                        .collect::<Decimal128Array>()
                        .with_precision_and_scale(precision, scale)
                        .expect("valid decimal type"),
                )
            }
            Values::Utf8 { codes, dictionary } => Arc::new(
                (0..len)
                    .map(|i| value(i).map(|s| dictionary.get(codes[s])))
                    .collect::<StringArray>(),
            ),
            Values::Date32(v) => Arc::new(
                (0..len)
                    .map(|i| value(i).map(|s| v[s]))
                    .collect::<Date32Array>(),
            ),
            Values::Timestamp(v) => {
                let array: TimestampMicrosecondArray =
                    (0..len).map(|i| value(i).map(|s| v[s])).collect();
                let ColumnType::Timestamp { timezone } = &self.ty else {
                    unreachable!("timestamp values have a timestamp type")
                };
                Arc::new(array.with_timezone_opt(timezone.clone()))
            }
        }
    }

    /// Makes room for `additional` more slots without reallocating, so that a
    /// load of a known size grows each vector once rather than by doubling.
    pub(crate) fn reserve(&mut self, additional: usize) {
        match &mut self.values {
            Values::Boolean(v) => v.reserve_exact(additional),
            Values::Int64(v) | Values::Timestamp(v) => v.reserve_exact(additional),
            Values::Float64(v) => v.reserve_exact(additional),
            Values::Decimal(v) => v.reserve_exact(additional),
            Values::Utf8 { codes, .. } => codes.reserve_exact(additional),
            Values::Date32(v) => v.reserve_exact(additional),
        }
        self.valid.reserve(additional);
    }

    /// Appends every value of an Arrow array, converting it to this column's type.
    /// Returns how many NaNs became nulls.
    ///
    /// Values arrive as typed slices, appended whole where the types match; text
    /// is interned from the array's own strings, and a dictionary-encoded array's
    /// values once each, the first time a row uses them. A null slot holds the
    /// placeholder [`Column::push_null`] gives it.
    ///
    /// # Errors
    ///
    /// Returns an error if the array's type does not map to this column's type, or a
    /// value cannot be represented without loss. The row an error names counts from
    /// the array's start. On an error the column may hold part of the array, so a
    /// load stages into columns of its own.
    pub(crate) fn extend_from_arrow(
        &mut self,
        name: &str,
        array: &dyn Array,
    ) -> Result<usize, LoadError> {
        let found = ColumnType::from_arrow(array.data_type());
        if found.as_ref() != Some(&self.ty) {
            return Err(LoadError::TypeChanged {
                column: name.to_owned(),
                expected: self.ty.to_arrow(),
                found: array.data_type().clone(),
            });
        }
        let start = self.len();
        let nulls = array.nulls();
        let mut nans = 0;
        macro_rules! ints {
            ($t:ty) => {{
                let Values::Int64(v) = &mut self.values else {
                    unreachable!()
                };
                v.extend(
                    array
                        .as_primitive::<$t>()
                        .values()
                        .iter()
                        .map(|&x| i64::from(x)),
                );
                zero_nulls(v, start, nulls);
            }};
        }
        match array.data_type() {
            DataType::Boolean => {
                let a = array.as_boolean();
                let Values::Boolean(v) = &mut self.values else {
                    unreachable!()
                };
                v.extend(a.values().iter());
                zero_nulls(v, start, nulls);
            }
            DataType::Int8 => ints!(Int8Type),
            DataType::Int16 => ints!(Int16Type),
            DataType::Int32 => ints!(Int32Type),
            DataType::Int64 => {
                let Values::Int64(v) = &mut self.values else {
                    unreachable!()
                };
                v.extend_from_slice(array.as_primitive::<Int64Type>().values());
                zero_nulls(v, start, nulls);
            }
            DataType::UInt8 => ints!(UInt8Type),
            DataType::UInt16 => ints!(UInt16Type),
            DataType::UInt32 => ints!(UInt32Type),
            DataType::Float32 | DataType::Float64 => {
                let Values::Float64(v) = &mut self.values else {
                    unreachable!()
                };
                if array.data_type() == &DataType::Float32 {
                    let values = array.as_primitive::<Float32Type>().values();
                    v.extend(values.iter().map(|&x| f64::from(x)));
                } else {
                    v.extend_from_slice(array.as_primitive::<Float64Type>().values());
                }
                zero_nulls(v, start, nulls);
                self.valid.extend_from_validity(array.len(), nulls);
                // A NaN becomes a null, counted; a null's placeholder is already 0.
                for (i, value) in v[start..].iter_mut().enumerate() {
                    if value.is_nan() {
                        *value = 0.0;
                        self.valid.set(start + i, false);
                        nans += 1;
                    }
                }
                return Ok(nans);
            }
            DataType::Decimal128(_, source_scale) => {
                let a = array.as_primitive::<Decimal128Type>();
                let Values::Decimal(v) = &mut self.values else {
                    unreachable!()
                };
                if *source_scale >= 0 {
                    v.extend_valid(a.values(), nulls);
                } else {
                    let factor = 10i128.pow(u32::from(source_scale.unsigned_abs()));
                    v.reserve_exact(a.len());
                    for (i, &value) in a.values().iter().enumerate() {
                        if a.is_null(i) {
                            v.push(0);
                            continue;
                        }
                        let Some(scaled) = value.checked_mul(factor) else {
                            return Err(LoadError::DecimalOverflow {
                                column: name.to_owned(),
                                row: i,
                                scale: *source_scale,
                            });
                        };
                        v.push(scaled);
                    }
                }
            }
            DataType::Utf8
            | DataType::LargeUtf8
            | DataType::Utf8View
            | DataType::Dictionary(_, _) => {
                let Values::Utf8 { codes, dictionary } = &mut self.values else {
                    unreachable!()
                };
                extend_text(codes, dictionary, &mut self.valid, array);
                return Ok(0);
            }
            DataType::Date32 => {
                let Values::Date32(v) = &mut self.values else {
                    unreachable!()
                };
                v.extend_from_slice(array.as_primitive::<Date32Type>().values());
                zero_nulls(v, start, nulls);
            }
            DataType::Timestamp(unit, _) => {
                let Values::Timestamp(v) = &mut self.values else {
                    unreachable!()
                };
                // Seconds and milliseconds can overflow on the way to
                // microseconds; nanoseconds can only lose precision.
                let overflow = |row| LoadError::TimestampOverflow {
                    column: name.to_owned(),
                    row,
                };
                match unit {
                    TimeUnit::Microsecond => {
                        v.extend_from_slice(
                            array.as_primitive::<TimestampMicrosecondType>().values(),
                        );
                        zero_nulls(v, start, nulls);
                    }
                    TimeUnit::Second | TimeUnit::Millisecond => {
                        let (values, factor) = match unit {
                            TimeUnit::Second => (
                                array.as_primitive::<TimestampSecondType>().values(),
                                1_000_000,
                            ),
                            _ => (
                                array.as_primitive::<TimestampMillisecondType>().values(),
                                1_000,
                            ),
                        };
                        v.reserve(values.len());
                        for (i, &value) in values.iter().enumerate() {
                            if array.is_null(i) {
                                v.push(0);
                                continue;
                            }
                            v.push(value.checked_mul(factor).ok_or_else(|| overflow(i))?);
                        }
                    }
                    TimeUnit::Nanosecond => {
                        let values = array.as_primitive::<TimestampNanosecondType>().values();
                        v.reserve(values.len());
                        for (i, &nanos) in values.iter().enumerate() {
                            if array.is_null(i) {
                                v.push(0);
                                continue;
                            }
                            if nanos % 1_000 != 0 {
                                return Err(LoadError::LossyTimestamp {
                                    column: name.to_owned(),
                                    row: i,
                                });
                            }
                            v.push(nanos / 1_000);
                        }
                    }
                }
            }
            _ => unreachable!("from_arrow accepted the type"),
        }
        self.valid.extend_from_validity(array.len(), nulls);
        Ok(nans)
    }
}

/// Sets the placeholder, the type's default, in each null slot from `start` on.
fn zero_nulls<T: Default>(values: &mut [T], start: usize, nulls: Option<&NullBuffer>) {
    let Some(nulls) = nulls.filter(|n| n.null_count() > 0) else {
        return;
    };
    for (value, valid) in values[start..].iter_mut().zip(nulls.iter()) {
        if !valid {
            *value = T::default();
        }
    }
}

/// The strings of an Arrow string array of any of its three layouts.
#[derive(Clone, Copy)]
enum Strings<'a> {
    Utf8(&'a StringArray),
    Large(&'a LargeStringArray),
    View(&'a StringViewArray),
}

impl<'a> Strings<'a> {
    fn of(array: &'a dyn Array) -> Self {
        match array.data_type() {
            DataType::Utf8 => Self::Utf8(array.as_string::<i32>()),
            DataType::LargeUtf8 => Self::Large(array.as_string::<i64>()),
            DataType::Utf8View => Self::View(array.as_string_view()),
            _ => unreachable!("only string types reach here"),
        }
    }

    fn is_valid(self, i: usize) -> bool {
        match self {
            Self::Utf8(a) => a.is_valid(i),
            Self::Large(a) => a.is_valid(i),
            Self::View(a) => a.is_valid(i),
        }
    }

    fn value(self, i: usize) -> &'a str {
        match self {
            Self::Utf8(a) => a.value(i),
            Self::Large(a) => a.value(i),
            Self::View(a) => a.value(i),
        }
    }
}

/// A dictionary-encoded array's value that no row has used yet.
const UNMAPPED: u32 = u32::MAX;

/// Appends the codes and validity of a string or dictionary-encoded string
/// array, interning each string from the array's own bytes. A dictionary's
/// values are interned once each, the first time a row uses one, so codes follow
/// the order rows first use their text, as they do for a plain string array,
/// and a value no row uses is never interned. A row of a dictionary is null
/// where its key is, or the value its key names; a null's code is 0.
fn extend_text(
    codes: &mut Vec<u32>,
    dictionary: &mut Dictionary,
    valid: &mut Bitmap,
    array: &dyn Array,
) {
    if !matches!(array.data_type(), DataType::Dictionary(_, _)) {
        let strings = Strings::of(array);
        codes.extend((0..array.len()).map(|i| {
            if strings.is_valid(i) {
                dictionary.intern(strings.value(i))
            } else {
                0
            }
        }));
        valid.extend_from_validity(array.len(), array.nulls());
        return;
    }
    let encoded = array.as_any_dictionary();
    let values = Strings::of(encoded.values().as_ref());
    let keys = encoded.normalized_keys();
    let mut mapped = vec![UNMAPPED; encoded.values().len()];
    let start = valid.len();
    valid.extend_ones(array.len());
    for (i, &key) in keys.iter().enumerate() {
        if !array.is_valid(i) || !values.is_valid(key) {
            codes.push(0);
            valid.set(start + i, false);
            continue;
        }
        if mapped[key] == UNMAPPED {
            mapped[key] = dictionary.intern(values.value(key));
        }
        codes.push(mapped[key]);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use arrow_array::{Float32Array, Int32Array, TimestampNanosecondArray};

    #[test]
    fn nan_becomes_null_and_is_counted() {
        let mut c = Column::new(ColumnType::Float64);
        let a = Float64Array::from(vec![Some(1.0), Some(f64::NAN), None, Some(-0.0)]);
        assert_eq!(c.extend_from_arrow("x", &a).unwrap(), 1);
        assert_eq!(c.f64(0), Some(1.0));
        assert_eq!(c.f64(1), None);
        assert_eq!(c.f64(2), None);
        assert_eq!(c.f64(3).map(f64::to_bits), Some((-0.0f64).to_bits()));
    }

    #[test]
    fn narrow_types_widen() {
        let mut ints = Column::new(ColumnType::Int64);
        ints.extend_from_arrow("i", &Int32Array::from(vec![Some(-5), None]))
            .unwrap();
        assert_eq!(ints.exact(0), Some(-5));
        assert_eq!(ints.exact(1), None);
        let mut floats = Column::new(ColumnType::Float64);
        floats
            .extend_from_arrow("f", &Float32Array::from(vec![1.5f32]))
            .unwrap();
        assert_eq!(floats.f64(0), Some(1.5));
    }

    #[test]
    fn type_changes_are_errors() {
        let mut c = Column::new(ColumnType::Int64);
        let err = c
            .extend_from_arrow("qty", &Float64Array::from(vec![1.0]))
            .unwrap_err();
        assert!(matches!(err, LoadError::TypeChanged { ref column, .. } if column == "qty"));
    }

    #[test]
    fn sub_microsecond_timestamps_are_rejected() {
        let ty = ColumnType::Timestamp { timezone: None };
        let mut c = Column::new(ty);
        // The column type comes from the array's own type, so build a matching column.
        let exact = TimestampNanosecondArray::from(vec![1_000, 2_000]);
        let mut ok = Column::new(ColumnType::from_arrow(exact.data_type()).unwrap());
        ok.extend_from_arrow("t", &exact).unwrap();
        assert_eq!(ok.key(1), Key::Ts(2));
        let lossy = TimestampNanosecondArray::from(vec![1_001]);
        assert!(matches!(
            ok.extend_from_arrow("t", &lossy),
            Err(LoadError::LossyTimestamp { row: 0, .. })
        ));
        assert!(c.extend_from_arrow("t", &exact).is_ok());
    }

    #[test]
    fn negative_scale_values_are_scaled_up() {
        let a = Decimal128Array::from(vec![Some(123), None])
            .with_precision_and_scale(10, -2)
            .unwrap();
        let ty = ColumnType::from_arrow(a.data_type()).unwrap();
        let mut c = Column::new(ty);
        c.extend_from_arrow("n", &a).unwrap();
        assert_eq!(c.exact(0), Some(12_300));
        assert_eq!(c.exact(1), None);
    }

    #[test]
    fn a_negative_scale_value_too_large_to_scale_up_is_refused() {
        // Arrow does not hold values to their precision, so a stream can carry one
        // that overflows 128 bits once it is multiplied by 10.
        let a = Decimal128Array::from(vec![Some(1), None, Some(i128::MAX / 5)])
            .with_precision_and_scale(10, -1)
            .unwrap();
        let mut c = Column::new(ColumnType::from_arrow(a.data_type()).unwrap());
        let err = c.extend_from_arrow("n", &a).unwrap_err();
        assert_eq!(
            err,
            LoadError::DecimalOverflow {
                column: "n".into(),
                row: 2,
                scale: -1,
            }
        );
        assert_eq!(
            err.to_string(),
            "column n row 2: the value overflows 38 digits once its scale of -1 is applied; have the source send it with fewer digits"
        );
    }

    #[test]
    fn a_timestamp_too_far_from_1970_for_microseconds_is_an_overflow() {
        use arrow_array::{TimestampMillisecondArray, TimestampSecondArray};
        let seconds = TimestampSecondArray::from(vec![Some(0), None, Some(i64::MAX / 10)]);
        let mut c = Column::new(ColumnType::from_arrow(seconds.data_type()).unwrap());
        let err = c.extend_from_arrow("t", &seconds).unwrap_err();
        assert_eq!(
            err,
            LoadError::TimestampOverflow {
                column: "t".into(),
                row: 2,
            }
        );
        assert_eq!(
            err.to_string(),
            "column t row 2: the timestamp overflows the microseconds a 64-bit integer holds, about 292,000 years either side of 1970; check the source's unit"
        );
        let millis = TimestampMillisecondArray::from(vec![Some(i64::MIN / 10)]);
        let mut c = Column::new(ColumnType::from_arrow(millis.data_type()).unwrap());
        assert!(matches!(
            c.extend_from_arrow("t", &millis),
            Err(LoadError::TimestampOverflow { row: 0, .. })
        ));
        // A null's stored value is never read, however large.
        let null = TimestampSecondArray::new(
            vec![i64::MAX, 1].into(),
            Some(arrow_buffer::NullBuffer::from(vec![false, true])),
        );
        let mut c = Column::new(ColumnType::from_arrow(null.data_type()).unwrap());
        c.extend_from_arrow("t", &null).unwrap();
        assert_eq!(c.key(0), Key::Null);
    }

    #[test]
    fn round_trips_to_arrow_in_slot_order() {
        let mut c = Column::new(ColumnType::Utf8);
        c.extend_from_arrow("s", &StringArray::from(vec![Some("b"), None, Some("a")]))
            .unwrap();
        let out = c.to_arrow(&[2, 1, 0]);
        let strings: Vec<Option<&str>> = out.as_string::<i32>().iter().collect();
        assert_eq!(strings, vec![Some("a"), None, Some("b")]);
    }

    /// The text of each slot, or `None` for a null.
    fn texts(c: &Column) -> Vec<Option<String>> {
        (0..c.len())
            .map(|slot| match c.scalar(slot) {
                Scalar::Utf8(text) => Some(text),
                _ => None,
            })
            .collect()
    }

    #[test]
    fn a_dictionary_interns_the_values_rows_use_once_in_the_order_rows_use_them() {
        use arrow_array::DictionaryArray;
        use arrow_array::types::Int8Type;
        let mut c = Column::new(ColumnType::Utf8);
        // "unused" is in the dictionary but no row names it, and "gone" only a
        // null row does.
        let values = StringArray::from(vec![
            Some("b"),
            Some("unused"),
            None,
            Some("a"),
            Some("gone"),
        ]);
        let keys =
            arrow_array::Int8Array::from(vec![Some(3), Some(0), Some(3), Some(2), None, Some(0)]);
        let first = DictionaryArray::<Int8Type>::try_new(keys, Arc::new(values)).unwrap();
        c.extend_from_arrow("s", &first).unwrap();
        // The next batch's dictionary is another, as a stream may replace it.
        let second: DictionaryArray<Int8Type> = vec!["c", "a", "c"].into_iter().collect();
        c.extend_from_arrow("s", &second).unwrap();
        let expected = [
            Some("a"),
            Some("b"),
            Some("a"),
            None,
            None,
            Some("b"),
            Some("c"),
            Some("a"),
            Some("c"),
        ];
        assert_eq!(texts(&c), expected.map(|t| t.map(str::to_owned)));
        let dictionary = c.dictionary().unwrap();
        assert_eq!(dictionary.len(), 3);
        assert_eq!(
            (0..3).map(|code| dictionary.get(code)).collect::<Vec<_>>(),
            ["a", "b", "c"]
        );
        // A plain string array interns in the same order.
        let mut plain = Column::new(ColumnType::Utf8);
        plain
            .extend_from_arrow("s", &StringArray::from(expected.to_vec()))
            .unwrap();
        let Values::Utf8 { codes, .. } = &c.values else {
            unreachable!()
        };
        let Values::Utf8 {
            codes: plain_codes, ..
        } = &plain.values
        else {
            unreachable!()
        };
        assert_eq!(codes, plain_codes);
        assert_eq!(c.valid, plain.valid);
    }

    #[test]
    fn every_string_layout_reads_the_same() {
        let rows = vec![Some("x"), None, Some(""), Some("\u{e9}t\u{e9}"), Some("x")];
        let mut expected = Column::new(ColumnType::Utf8);
        expected
            .extend_from_arrow("s", &StringArray::from(rows.clone()))
            .unwrap();
        let large = arrow_array::LargeStringArray::from(rows.clone());
        let view = arrow_array::StringViewArray::from(rows);
        for array in [&large as &dyn Array, &view] {
            let mut c = Column::new(ColumnType::Utf8);
            c.extend_from_arrow("s", array).unwrap();
            assert_eq!(texts(&c), texts(&expected), "{:?}", array.data_type());
        }
    }

    #[test]
    fn a_null_slot_holds_the_placeholder_whatever_the_array_held() {
        use arrow_buffer::NullBuffer;
        let nulls = Some(NullBuffer::from(vec![true, false, true]));
        let ints = Int64Array::new(vec![1, 99, 3].into(), nulls.clone());
        let mut c = Column::new(ColumnType::Int64);
        c.extend_from_arrow("i", &ints).unwrap();
        let Values::Int64(v) = &c.values else {
            unreachable!()
        };
        assert_eq!(v, &[1, 0, 3]);
        let floats = Float64Array::new(vec![1.0, 9.5, f64::NAN].into(), nulls);
        let mut c = Column::new(ColumnType::Float64);
        assert_eq!(c.extend_from_arrow("f", &floats).unwrap(), 1);
        let Values::Float64(v) = &c.values else {
            unreachable!()
        };
        assert_eq!(v, &[1.0, 0.0, 0.0]);
        assert_eq!(
            (c.is_valid(0), c.is_valid(1), c.is_valid(2)),
            (true, false, false)
        );
    }
}
