const test = require("node:test");
const assert = require("node:assert/strict");
const { buildMessage, personalize, tokenWarnings, htmlToText } = require("../src/services/messageBuilder");

const content = {
  subject: "Hello {{first_name|there}}",
  body: "<p>Hi {{name}}, your email is {{email}}.</p>",
  bodyType: "html",
  cc: [{ name: "Boss", email: "boss@example.com" }],
  bcc: [{ name: "", email: "archive@example.com" }],
};

test("each message has exactly one To recipient plus the shared CC/BCC", () => {
  const recipients = [
    { name: "Jane Doe", email: "jane@example.com" },
    { name: "", email: "bob@example.com" },
  ];
  const messages = recipients.map((r) => buildMessage(content, r));
  for (const [i, m] of messages.entries()) {
    assert.equal(m.to.length, 1);
    assert.equal(m.to[0].address, recipients[i].email);
    assert.deepEqual(m.cc.map((x) => x.address), ["boss@example.com"]);
    assert.deepEqual(m.bcc.map((x) => x.address), ["archive@example.com"]);
    const other = recipients[1 - i].email;
    assert.ok(!JSON.stringify(m).includes(other), "a message must not mention another To recipient");
  }
  assert.equal(messages[0].subject, "Hello Jane");
  assert.equal(messages[1].subject, "Hello there");
  assert.match(messages[0].html, /Hi Jane Doe, your email is jane@example.com/);
  assert.match(messages[0].text, /Hi Jane Doe/);
});

test("values inserted into HTML are escaped", () => {
  const html = personalize("<b>{{name}}</b>", { name: "<script>x</script>", email: "a@x.com" }, { html: true });
  assert.equal(html, "<b>&lt;script&gt;x&lt;/script&gt;</b>");
});

test("plain-text bodies produce text only, and subjects cannot inject headers", () => {
  const m = buildMessage({ ...content, bodyType: "text", body: "Hi {{first_name}}", subject: "a\r\nBcc: x@y.com" }, { name: "Al B", email: "a@x.com" });
  assert.equal(m.text, "Hi Al");
  assert.equal(m.html, undefined);
  assert.ok(!/[\r\n]/.test(m.subject));
});

test("unknown tokens are left as-is and reported", () => {
  assert.equal(personalize("{{company}}", { email: "a@x.com" }), "{{company}}");
  const w = tokenWarnings(["Hi {{company}} {{first_name}}"], [{ email: "a@x.com", name: "" }]);
  assert.equal(w.length, 2);
});

test("htmlToText keeps links and line structure", () => {
  assert.equal(htmlToText('<p>Hi</p><p>See <a href="https://x.com">site</a></p>'), "Hi\nSee site (https://x.com)");
});
