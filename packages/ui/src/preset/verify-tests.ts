/* `vp run verify`'s tests: `vp test`, in the browser unless the app runs without one, read by Vitest's JSON reporter,
 * each failed test a finding at the line its test starts on. */

import { z } from "zod";

import { findingOf } from "./verify-report.ts";
import type { Finding } from "./verify-report.ts";
import {
  firstLine,
  fromRoot,
  jsonIn,
  unread,
  vp,
  withReportFile,
  writtenTo,
} from "./verify-tools.ts";
import type { Ran } from "./verify-tools.ts";

const testSchema = z.object({
  failureMessages: z.array(z.string()).default([]),
  fullName: z.string(),
  location: z.object({ line: z.number() }).nullish(),
  status: z.string(),
});
const testFileSchema = z.object({
  assertionResults: z.array(testSchema).default([]),
  message: z.string().default(""),
  name: z.string(),
  status: z.string(),
});
const testReportSchema = z.object({ testResults: z.array(testFileSchema) });
type TestFile = z.infer<typeof testFileSchema>;

/** The findings of one test file: each failed test, or the file's own failure, as one that fails to load. */
function testFileFindings(root: string, result: TestFile): readonly Finding[] {
  const file = fromRoot(root, result.name);
  const fix = `fix the code, or the test where the test is wrong, then run vp test ${file}.`;
  const failed = result.assertionResults.filter(({ status }) => status === "failed");
  if (failed.length === 0) {
    return result.status === "failed"
      ? [
          findingOf({
            file,
            fix,
            line: null,
            message: `the file fails: ${firstLine(result.message)}`,
            rule: null,
          }),
        ]
      : [];
  }
  return failed.map(({ failureMessages, fullName, location }) =>
    findingOf({
      file,
      fix,
      line: location?.line ?? null,
      message: `the test "${fullName}" fails with ${firstLine(failureMessages[0] ?? "no message")}`,
      rule: null,
    }),
  );
}

const noTests = findingOf({
  file: null,
  fix: "write a test of each page beside it, as src/pages/NAME.test.ts, with renderApp and screen from @basis/ui/testing.",
  line: null,
  message: "vp test found no test file in the app",
  rule: null,
});

type TestReport = z.infer<typeof testReportSchema>;

function reportedTests(root: string, ran: Ran, report: TestReport): readonly Finding[] {
  if (report.testResults.length === 0 && ran.status !== 0) {
    return [noTests];
  }
  const found = report.testResults.flatMap((result) => testFileFindings(root, result));
  return ran.status !== 0 && found.length === 0 ? unread("vp test", ran) : found;
}

/** Each test `vp test` fails, as Vitest's JSON reporter writes them. */
function testFindings(root: string): readonly Finding[] {
  return withReportFile("tests.json", (output) => {
    const reporter = ["--reporter=json", `--outputFile=${output}`, "--includeTaskLocation"];
    const ran = vp(root, ["test", "--run", ...reporter]);
    const report = testReportSchema.safeParse(jsonIn(writtenTo(output)));
    return report.success ? reportedTests(root, ran, report.data) : unread("vp test", ran);
  });
}

export { testFindings };
