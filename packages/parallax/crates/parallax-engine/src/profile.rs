//! Phase timings for `examples/measure.rs`, which steer the engine's work on
//! speed: how long a load stages and appends, and a grouped view aggregates,
//! sorts its leaves, builds its tree and merges it.
//!
//! With the `profile` feature each phase adds its time here when its [`Span`]
//! drops, and [`take`] returns the totals. Without it, as every build an app
//! gets is, a span is nothing and costs nothing; WebAssembly has no clock to
//! read, so it never has the feature. This is not for apps.

#[cfg(feature = "profile")]
mod enabled {
    use std::sync::{Mutex, PoisonError};
    use std::time::{Duration, Instant};

    /// The time spent in each phase so far, in the order the phases first ran.
    static PHASES: Mutex<Vec<(&'static str, Duration)>> = Mutex::new(Vec::new());

    /// A phase under way, timed until it drops.
    #[must_use = "a span times the phase until it drops"]
    pub struct Span {
        phase: &'static str,
        started: Instant,
    }

    impl Drop for Span {
        fn drop(&mut self) {
            let spent = self.started.elapsed();
            let mut phases = PHASES.lock().unwrap_or_else(PoisonError::into_inner);
            match phases.iter_mut().find(|(phase, _)| *phase == self.phase) {
                Some((_, total)) => *total += spent,
                None => phases.push((self.phase, spent)),
            }
        }
    }

    /// Starts timing `phase`.
    pub fn span(phase: &'static str) -> Span {
        Span {
            phase,
            started: Instant::now(),
        }
    }

    /// The time spent in each phase since the last call, in seconds, and
    /// starts again from nothing.
    pub fn take() -> Vec<(&'static str, f64)> {
        std::mem::take(&mut *PHASES.lock().unwrap_or_else(PoisonError::into_inner))
            .into_iter()
            .map(|(phase, spent)| (phase, spent.as_secs_f64()))
            .collect()
    }
}

#[cfg(not(feature = "profile"))]
mod enabled {
    /// A phase under way; without the `profile` feature, nothing.
    #[must_use = "a span times the phase until it drops"]
    pub struct Span;

    /// Starts timing `phase`; without the `profile` feature, nothing.
    #[inline(always)]
    pub fn span(_phase: &'static str) -> Span {
        Span
    }

    /// Without the `profile` feature, no phase is timed.
    pub fn take() -> Vec<(&'static str, f64)> {
        Vec::new()
    }
}

pub use enabled::{Span, span, take};
