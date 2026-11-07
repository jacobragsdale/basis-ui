/* The gallery's today, fixed so its screenshots hold from day to day: Thursday 2026-11-12, the day after Veterans Day,
 * which SIFMA closes for and the NYSE does not, so the default as-of date steps back over it to Tuesday. */

const exampleToday = Temporal.PlainDate.from("2026-11-12");

export { exampleToday };
