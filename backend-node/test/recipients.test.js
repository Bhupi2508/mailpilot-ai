const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeRecipients, parseAddress, splitAddressList, isValidEmail } = require("../src/services/recipients");

const limits = { maxTo: 5, maxCc: 2, maxBcc: 2 };

test("parses plain, named and quoted addresses", () => {
  assert.deepEqual(parseAddress("Jane@Example.com"), { input: "Jane@Example.com", name: "", email: "jane@example.com" });
  assert.equal(parseAddress("Jane Doe <jane@example.com>").name, "Jane Doe");
  assert.equal(parseAddress('"Doe, Jane" <jane@example.com>').name, "Doe, Jane");
  assert.equal(parseAddress("mailto:bob@example.org").email, "bob@example.org");
});

test("rejects invalid addresses", () => {
  for (const bad of ["plainaddress", "a@b", "a..b@example.com", "a@-example.com", "two words@example.com", "a@example.com\nBcc: x@y.com"]) {
    assert.ok(parseAddress(bad).error, `${JSON.stringify(bad)} should be invalid`);
  }
  assert.equal(isValidEmail("x".repeat(250) + "@example.com"), false);
});

test("splits lists on commas, semicolons and newlines but not inside quotes", () => {
  assert.deepEqual(splitAddressList('a@x.com, "Doe, J" <j@x.com>;b@x.com\nc@x.com'), [
    "a@x.com",
    '"Doe, J" <j@x.com>',
    "b@x.com",
    "c@x.com",
  ]);
});

test("deduplicates within and across To/CC/BCC", () => {
  const r = normalizeRecipients(
    { to: ["a@x.com", "A@x.com", "b@x.com"], cc: ["b@x.com", "c@x.com"], bcc: ["c@x.com", "d@x.com"] },
    limits
  );
  assert.deepEqual(r.to.map((x) => x.email), ["a@x.com", "b@x.com"]);
  assert.deepEqual(r.cc.map((x) => x.email), ["c@x.com"]);
  assert.deepEqual(r.bcc.map((x) => x.email), ["d@x.com"]);
  assert.equal(r.errors.length, 0);
  assert.equal(r.warnings.length, 3);
});

test("reports missing To, invalid entries and limits", () => {
  assert.equal(normalizeRecipients({ to: [] }, limits).errors[0].field, "to");
  const invalid = normalizeRecipients({ to: "ok@x.com, nope" }, limits);
  assert.equal(invalid.errors[0].value, "nope");
  const tooMany = normalizeRecipients({ to: ["1@x.com", "2@x.com", "3@x.com", "4@x.com", "5@x.com", "6@x.com"] }, limits);
  assert.match(tooMany.errors[0].message, /maximum is 5/);
});
