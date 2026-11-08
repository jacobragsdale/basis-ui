import { Badge, Bps, Card, CardContent, CardHeader, CardTitle, Money, Pct } from "@basis/ui";

/** A card of a book's figures, each shown by the number components rather than formatted by hand. */
function SummaryPage(): React.JSX.Element {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Book summary</CardTitle>
      </CardHeader>
      <CardContent>
        <dl>
          <dt>Market value</dt>
          <dd>
            <Money currency="USD" value={1_234_567.89} />
          </dd>
          <dt>Yield</dt>
          <dd>
            <Pct value={0.0525} />
          </dd>
          <dt>Spread</dt>
          <dd>
            <Bps value={0.0125} />
          </dd>
        </dl>
        <Badge>Anonymous</Badge>
      </CardContent>
    </Card>
  );
}

export { SummaryPage };
