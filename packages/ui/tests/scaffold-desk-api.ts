/* A second OpenAPI document for the scaffolder's tests, unlike the example's in each way the review of 2026-11-13
 * found the scaffolder to fail: integer and enum path parameters, optional and nullable fields, a description with
 * quotes and braces, a summary with an apostrophe, a body with its own example, `format: time`, a list whose rows
 * have no unique column, a component whose name orval rewrites, and response properties left out of required. Its problem schemas are basis's, from the
 * example's document. */

import { readFileSync } from "node:fs";

import { z } from "zod";

const exampleText = readFileSync(new URL("../../example/openapi.json", import.meta.url), "utf8");
const schemasSchema = z.record(z.string(), z.unknown());
const exampleDocument = z
  .object({ components: z.object({ schemas: schemasSchema }) })
  .parse(JSON.parse(exampleText));
const { schemas } = exampleDocument.components;

const problem = (description: string): unknown => ({
  content: {
    "application/problem+json": { schema: { $ref: "#/components/schemas/Problem" } },
  },
  description,
});
const json = (reference: string, description = "Successful Response"): unknown => ({
  content: { "application/json": { schema: { $ref: `#/components/schemas/${reference}` } } },
  description,
});

const side = { $ref: "#/components/schemas/Side" };

const deskDocument = {
  components: {
    schemas: {
      DeskNote: {
        properties: {
          // A pattern no example can be made from, so a fixture for it is written by hand.
          code: { pattern: "^(?!N)[A-Z]{3}$", title: "Code", type: "string" },
          text: { title: "Text", type: "string" },
        },
        required: ["code", "text"],
        title: "DeskNote",
        type: "object",
      },
      Order: {
        properties: {
          book: { title: "Book", type: "string" },
          quantity: { title: "Quantity", type: "integer" },
          side,
        },
        required: ["side", "book", "quantity"],
        title: "Order",
        type: "object",
      },
      Page_Trade_: {
        properties: {
          cursor: { anyOf: [{ type: "string" }, { type: "null" }], title: "Cursor" },
          total: { title: "Total", type: "integer" },
        },
        required: ["total", "cursor"],
        title: "Page[Trade]",
        type: "object",
      },
      Problem: schemas["Problem"],
      Side: { enum: ["BUY", "SELL"], title: "Side", type: "string" },
      Trade: {
        properties: {
          booked: { format: "date-time", title: "Booked", type: "string" },
          cutoff: { format: "time", title: "Cutoff", type: "string" },
          desk_id: { title: "Desk Id", type: "integer" },
          // Left out of required, as an API outside basis may leave a property; its mocks must still pass tsc.
          memo: { anyOf: [{ type: "string" }, { type: "null" }], title: "Memo" },
          notes: { title: "Notes", type: "string" },
          price: { anyOf: [{ type: "number" }, { type: "null" }], title: "Price" },
          quantity: { title: "Quantity", type: "integer" },
          side,
          trade_id: { title: "Trade Id", type: "integer" },
        },
        required: ["trade_id", "desk_id", "side", "quantity", "price", "cutoff", "booked"],
        title: "Trade",
        type: "object",
      },
      TradeRequest: {
        examples: [
          {
            confirm: true,
            cutoff: "16:00:00",
            notes: "The desk's own",
            quantity: 5000,
            settle: "2026-11-16",
            side: "SELL",
          },
        ],
        properties: {
          confirm: { title: "Confirm", type: "boolean" },
          cutoff: { format: "time", title: "Cutoff", type: "string" },
          limit_price: {
            anyOf: [{ type: "number" }, { type: "null" }],
            title: "Limit Price",
          },
          notes: { title: "P&L Note", type: "string" },
          quantity: { minimum: 1, title: "Quantity", type: "integer" },
          settle: { format: "date", title: "Settle", type: "string" },
          side: {
            $ref: "#/components/schemas/Side",
            description: 'The side of the trade, "BUY" or "SELL", as {side} reads it <here>.',
          },
        },
        required: ["side", "quantity", "settle", "cutoff", "confirm", "limit_price"],
        title: "TradeRequest",
        type: "object",
      },
      ValidationProblem: schemas["ValidationProblem"],
      ...Object.fromEntries(
        Object.entries(schemas).filter(([name]) => name.endsWith("Error") || name === "JsonValue"),
      ),
    },
  },
  info: { title: "desk", version: "0.1.0" },
  openapi: "3.1.0",
  paths: {
    "/books/{side}/orders": {
      get: {
        operationId: "list_orders",
        parameters: [{ in: "path", name: "side", required: true, schema: side }],
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: { items: { $ref: "#/components/schemas/Order" }, type: "array" },
              },
            },
            description: "Successful Response",
          },
        },
        summary: "List Orders",
      },
    },
    "/desk-notes/latest": {
      get: {
        operationId: "latest_desk_note",
        responses: { "200": json("DeskNote") },
        summary: "Latest Desk Note",
      },
    },
    "/desks/{desk_id}/trades": {
      post: {
        operationId: "book_trade",
        parameters: [
          {
            in: "path",
            name: "desk_id",
            required: true,
            schema: { title: "Desk Id", type: "integer" },
          },
        ],
        requestBody: {
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/TradeRequest" } },
          },
          required: true,
        },
        responses: {
          "201": json("Trade"),
          "404": problem("unknown-desk: No desk has that id"),
          "422": {
            content: {
              "application/problem+json": {
                schema: { $ref: "#/components/schemas/ValidationProblem" },
              },
            },
            description: "invalid-request: The request is not valid",
          },
        },
        summary: "Book the desk's FX trade",
      },
    },
    "/trade-pages/latest": {
      get: {
        operationId: "latest_trade_page",
        responses: { "200": json("Page_Trade_") },
        summary: "Latest Trade Page",
      },
    },
    "/trades/{trade_id}": {
      get: {
        operationId: "get_trade",
        parameters: [
          {
            in: "path",
            name: "trade_id",
            required: true,
            schema: { title: "Trade Id", type: "integer" },
          },
        ],
        responses: { "200": json("Trade"), "404": problem("unknown-trade: No trade has that id") },
        summary: "Get Trade",
      },
    },
  },
};

export { deskDocument };
