import test from "node:test";
import assert from "node:assert/strict";
import { addRecipients, parseAddress, splitAddressList, formatAddress } from "./recipients.js";

test("parses named and plain addresses", () => {
  assert.deepEqual(parseAddress("Jane Doe <Jane@Example.com>"), { raw: "Jane Doe <Jane@Example.com>", name: "Jane Doe", email: "jane@example.com" });
  assert.ok(parseAddress("not an email").error);
  assert.ok(parseAddress("a@b").error);
});

test("splits pasted lists, respecting quoted names", () => {
  assert.deepEqual(splitAddressList('a@x.com\n"Doe, J" <j@x.com>; b@x.com,\tc@x.com'), ["a@x.com", '"Doe, J" <j@x.com>', "b@x.com", "c@x.com"]);
});

test("addRecipients skips duplicates and keeps invalid entries for correction", () => {
  const first = addRecipients([], "a@x.com, A@x.com, nope");
  assert.equal(first.added, 2);
  assert.equal(first.duplicates, 1);
  assert.equal(first.list[1].error, "Not a valid email address.");
  const second = addRecipients(first.list, "a@x.com b@x.com");
  assert.equal(second.list.at(-1).error, "Not a valid email address.", "space-separated pairs are one invalid entry");
});

test("formatAddress quotes names with separators", () => {
  assert.equal(formatAddress({ name: "Doe, Jane", email: "j@x.com" }), '"Doe, Jane" <j@x.com>');
  assert.equal(formatAddress({ name: "", email: "j@x.com" }), "j@x.com");
});

test("isSenderAllowed follows the server policy", async () => {
  const { isSenderAllowed } = await import("./recipients.js");
  const policy = { mode: "list", addresses: ["me@corp.example"], domains: ["@ok.example"] };
  assert.equal(isSenderAllowed(policy, "ME@corp.example"), true);
  assert.equal(isSenderAllowed(policy, "x@ok.example"), true);
  assert.equal(isSenderAllowed(policy, "x@sub.ok.example"), false);
  assert.equal(isSenderAllowed(policy, "x@other.example"), false);
  assert.equal(isSenderAllowed({ mode: "any", addresses: [], domains: [] }, "anyone@anywhere.example"), true);
});
