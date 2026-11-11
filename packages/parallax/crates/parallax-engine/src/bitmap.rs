//! A growable, mutable bit set, used for validity and liveness.

/// A bit per row, packed into 64-bit words.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Bitmap {
    words: Vec<u64>,
    len: usize,
}

impl Bitmap {
    /// Returns an empty bitmap.
    #[must_use]
    pub const fn new() -> Self {
        Self {
            words: Vec::new(),
            len: 0,
        }
    }

    /// A bitmap of `len` bits held in `words`, bit `i` of word `w` being bit
    /// `64 * w + i`, with no bit set past `len`.
    pub(crate) fn from_words(words: Vec<u64>, len: usize) -> Self {
        debug_assert_eq!(words.len(), len.div_ceil(64));
        Self { words, len }
    }

    /// The bits, 64 to a word, the first in each word's lowest bit, and none
    /// set past the last.
    pub(crate) fn words(&self) -> &[u64] {
        &self.words
    }

    /// Returns the number of bits.
    #[must_use]
    pub const fn len(&self) -> usize {
        self.len
    }

    /// Returns `true` if there are no bits.
    #[must_use]
    pub const fn is_empty(&self) -> bool {
        self.len == 0
    }

    /// Appends one bit.
    pub fn push(&mut self, value: bool) {
        if self.len.is_multiple_of(64) {
            self.words.push(0);
        }
        self.len += 1;
        self.set(self.len - 1, value);
    }

    /// Makes room for `additional` more bits without reallocating.
    pub fn reserve(&mut self, additional: usize) {
        let words = (self.len + additional).div_ceil(64);
        self.words.reserve(words.saturating_sub(self.words.len()));
    }

    /// Appends `count` set bits, a word at a time.
    pub fn extend_ones(&mut self, count: usize) {
        let end = self.len + count;
        self.words.resize(end.div_ceil(64), 0);
        let mut at = self.len;
        while at < end && !at.is_multiple_of(64) {
            self.words[at / 64] |= 1 << (at % 64);
            at += 1;
        }
        while at + 64 <= end {
            self.words[at / 64] = u64::MAX;
            at += 64;
        }
        if at < end {
            self.words[at / 64] |= (1 << (end - at)) - 1;
        }
        self.len = end;
    }

    /// Appends `count` bits, set where `bits` is, or every one of them set
    /// where there is no `bits`: an Arrow array's validity.
    pub fn extend_from_validity(&mut self, count: usize, bits: Option<&arrow_buffer::NullBuffer>) {
        let Some(bits) = bits.filter(|b| b.null_count() > 0) else {
            self.extend_ones(count);
            return;
        };
        let start = self.len;
        self.extend_ones(count);
        for (i, valid) in bits.inner().iter().take(count).enumerate() {
            if !valid {
                let at = start + i;
                self.words[at / 64] &= !(1 << (at % 64));
            }
        }
    }

    /// Returns bit `index`.
    ///
    /// # Panics
    ///
    /// Panics if `index` is out of bounds.
    #[must_use]
    pub fn get(&self, index: usize) -> bool {
        assert!(index < self.len, "bit {index} of {}", self.len);
        self.words[index / 64] >> (index % 64) & 1 == 1
    }

    /// Sets bit `index`.
    ///
    /// # Panics
    ///
    /// Panics if `index` is out of bounds.
    pub fn set(&mut self, index: usize, value: bool) {
        assert!(index < self.len, "bit {index} of {}", self.len);
        let mask = 1u64 << (index % 64);
        if value {
            self.words[index / 64] |= mask;
        } else {
            self.words[index / 64] &= !mask;
        }
    }

    /// Returns the number of set bits.
    #[must_use]
    pub fn count_ones(&self) -> usize {
        self.words.iter().map(|w| w.count_ones() as usize).sum()
    }

    /// Iterates over the indices of set bits within `range`, in order, skipping
    /// empty words whole.
    pub fn ones_in(&self, range: std::ops::Range<usize>) -> impl Iterator<Item = usize> + '_ {
        let end = range.end.min(self.len);
        let first = range.start / 64;
        let last = end.div_ceil(64).min(self.words.len());
        let start = range.start;
        self.words[first.min(last)..last]
            .iter()
            .enumerate()
            .flat_map(move |(i, &word)| {
                let w = first + i;
                let mut bits = word;
                if w == range.start / 64 {
                    bits &= u64::MAX.checked_shl((start % 64) as u32).unwrap_or(0);
                }
                if w + 1 == end.div_ceil(64) && !end.is_multiple_of(64) {
                    bits &= (1u64 << (end % 64)) - 1;
                }
                std::iter::from_fn(move || {
                    if bits == 0 {
                        return None;
                    }
                    let bit = bits.trailing_zeros() as usize;
                    bits &= bits - 1;
                    Some(w * 64 + bit)
                })
            })
    }

    /// Iterates over the indices of set bits, in order.
    pub fn ones(&self) -> impl Iterator<Item = usize> + '_ {
        self.words.iter().enumerate().flat_map(|(w, &word)| {
            let mut bits = word;
            std::iter::from_fn(move || {
                if bits == 0 {
                    return None;
                }
                let bit = bits.trailing_zeros() as usize;
                bits &= bits - 1;
                Some(w * 64 + bit)
            })
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn push_get_set_and_count() {
        let mut b = Bitmap::new();
        for i in 0..200 {
            b.push(i % 3 == 0);
        }
        assert_eq!(b.len(), 200);
        assert!(b.get(0) && !b.get(1) && b.get(198));
        b.set(1, true);
        b.set(198, false);
        assert_eq!(b.count_ones(), 67);
        let ones: Vec<usize> = b.ones().collect();
        assert_eq!(ones.len(), 67);
        assert_eq!(&ones[..3], &[0, 1, 3]);
        for (start, end) in [
            (0, 200),
            (1, 64),
            (63, 129),
            (64, 128),
            (130, 131),
            (150, 999),
            (5, 5),
        ] {
            let expected: Vec<usize> = ones
                .iter()
                .copied()
                .filter(|&i| i >= start && i < end)
                .collect();
            assert_eq!(
                b.ones_in(start..end).collect::<Vec<_>>(),
                expected,
                "{start}..{end}"
            );
        }
    }

    #[test]
    fn extending_sets_the_same_bits_as_pushing() {
        for (start, count) in [(0, 0), (0, 64), (3, 61), (3, 200), (64, 1), (63, 130)] {
            let mut pushed = Bitmap::new();
            let mut extended = Bitmap::new();
            for i in 0..start {
                pushed.push(i % 2 == 0);
                extended.push(i % 2 == 0);
            }
            let validity: Vec<bool> = (0..count).map(|i| i % 5 != 1).collect();
            for &bit in &validity {
                pushed.push(bit);
            }
            let nulls = arrow_buffer::NullBuffer::from(validity);
            extended.reserve(count);
            extended.extend_from_validity(count, Some(&nulls));
            assert_eq!(extended, pushed, "{start} + {count}");
            let mut ones = pushed.clone();
            for _ in 0..count {
                ones.push(true);
            }
            extended.extend_from_validity(count, None);
            assert_eq!(extended, ones, "{start} + {count} set");
        }
    }
}
