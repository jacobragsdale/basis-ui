/* The searches the data page's pickers call, standing in for a generated client's functions: each waits as a request
 * would, ends early when its signal aborts, and answers from the page's fixtures. */

import type { SecurityIdentifier } from "@basis/ui";
import { sleep } from "@basis/ui/utils";

import { issuers, securities } from "./fixtures.ts";
import type { Issuer, Security } from "./fixtures.ts";

/** How long a search takes, as a request to an API on the same cluster might. */
const latencyMs = 300;

/** The issuers whose name holds the text, ignoring case. */
async function searchIssuers(text: string, signal: AbortSignal): Promise<readonly Issuer[]> {
  await sleep(latencyMs, signal);
  const wanted = text.toLocaleLowerCase("en-US");
  return issuers.filter((issuer) => issuer.name.toLocaleLowerCase("en-US").includes(wanted));
}

/** Whether a security goes by the identifier. The fixtures hold no SEDOLs, so a SEDOL finds nothing. */
function isNamedBy(security: Security, identifier: SecurityIdentifier): boolean {
  if (identifier.kind === "cusip") {
    return security.cusip === identifier.value;
  }
  return identifier.kind === "isin" && security.isin === identifier.value;
}

/** The securities an identifier names. */
async function findSecurities(
  identifier: SecurityIdentifier,
  signal: AbortSignal,
): Promise<readonly Security[]> {
  await sleep(latencyMs, signal);
  return securities.filter((security) => isNamedBy(security, identifier));
}

export { findSecurities, searchIssuers };
