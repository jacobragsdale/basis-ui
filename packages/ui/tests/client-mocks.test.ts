/* The repairs `vp run client-pull` makes to orval's generated mocks (src/preset/client-mocks.ts): an enum's pick reads
 * the Zod enum's options, and a property the schema leaves out of required is left out of the mock rather than set to
 * `undefined`, which a model's optional property under exactOptionalPropertyTypes refuses. The whole of a generated
 * client is held by scaffold-desk.test.ts, which type-checks it. */

import { describe, expect, test } from "vite-plus/test";

import { repairedMocks } from "#preset/client-mocks.ts";

describe("repairedMocks", () => {
  test("reads an enum's values from the Zod enum's options", () => {
    expect(repairedMocks("({side: faker.helpers.arrayElement(Object.values(Side))})")).toBe(
      "({side: faker.helpers.arrayElement(Side.options)})",
    );
  });

  test("leaves an optional property out rather than set it to undefined, and keeps a nullable one", () => {
    const mock =
      "({desk_id: faker.number.int(), notes: faker.helpers.arrayElement([faker.string.alpha({length: {min: 10, max: 20}}), undefined]), price: faker.helpers.arrayElement([faker.number.float({fractionDigits: 2}),null,]), ...overrideResponse})";
    expect(repairedMocks(mock)).toBe(
      "({desk_id: faker.number.int(), ...faker.helpers.arrayElement([{ notes: faker.string.alpha({length: {min: 10, max: 20}}) }, {}]), price: faker.helpers.arrayElement([faker.number.float({fractionDigits: 2}),null,]), ...overrideResponse})",
    );
  });

  test("repairs a pick inside another's value, a quoted key, and text holding brackets and commas", () => {
    const mock =
      "({\"as-of\": faker.helpers.arrayElement([{when: faker.helpers.arrayElement(['a, ]b', undefined])}, undefined])})";
    expect(repairedMocks(mock)).toBe(
      "({...faker.helpers.arrayElement([{ \"as-of\": {...faker.helpers.arrayElement([{ when: 'a, ]b' }, {}])} }, {}])})",
    );
  });

  test("keeps a nullable optional property's null among its choices", () => {
    expect(
      repairedMocks("({memo: faker.helpers.arrayElement([faker.lorem.word(), null, undefined])})"),
    ).toBe("({...faker.helpers.arrayElement([{ memo: faker.lorem.word() }, { memo: null }, {}])})");
  });

  test("mocks a pattern with text it matches, and leaves one the preset cannot read to orval", () => {
    expect(
      repairedMocks(String.raw`({isin: faker.helpers.fromRegExp("^[A-Z]{2}[A-Z0-9]{9}\\d$")})`),
    ).toBe('({isin: faker.helpers.arrayElement(["AAAAAAAAAAA0","ZZ9999999999"])})');
    const unread = 'faker.helpers.fromRegExp("^(?!N)[A-Z]{3}$")';
    expect(repairedMocks(unread)).toBe(unread);
  });

  test("writes a format's mock as code, where orval quoted the option's text", () => {
    expect(repairedMocks("({time: 'faker.date.anytime().toISOString().slice(11, 19)'})")).toBe(
      "({time: faker.date.anytime().toISOString().slice(11, 19)})",
    );
  });
});
