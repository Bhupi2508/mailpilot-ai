const test = require("node:test");
const assert = require("node:assert/strict");
const { validateUploads, safeFilename } = require("../src/services/attachments");

const limits = { maxFiles: 2, maxFileMb: 1, maxTotalMb: 1 };
const file = (originalname, buffer) => ({ originalname, buffer: Buffer.from(buffer), size: Buffer.from(buffer).length });
const PDF = "%PDF-1.4 test";

test("accepts allowed files whose content matches the extension", () => {
  const out = validateUploads([file("report.pdf", PDF), file("notes.txt", "hello")], limits);
  assert.deepEqual(out.map((a) => a.contentType), ["application/pdf", "text/plain"]);
});

test("rejects disallowed types and spoofed content", () => {
  for (const f of [file("run.exe", "MZ"), file("page.html", "<script>"), file("x.js", "alert(1)"), file("fake.pdf", "MZ not a pdf")]) {
    assert.throws(() => validateUploads([f], limits), (e) => e.status === 422, f.originalname);
  }
  assert.throws(() => validateUploads([file("bin.txt", Buffer.from([0x41, 0x00, 0x42]))], limits), /does not look like/);
});

test("enforces count, size and duplicate limits", () => {
  assert.throws(() => validateUploads([file("a.txt", "a"), file("b.txt", "b"), file("c.txt", "c")], limits), /at most 2/);
  const big = { originalname: "big.txt", buffer: Buffer.alloc(1024 * 1024 + 1, 65), size: 1024 * 1024 + 1 };
  assert.throws(() => validateUploads([big], limits), /larger than 1 MB/);
  assert.throws(() => validateUploads([file("a.txt", "a"), file("A.TXT", "b")], limits), /attached twice/);
  assert.throws(() => validateUploads([file("empty.txt", "")], limits), /empty/);
});

test("sanitizes file names", () => {
  assert.equal(safeFilename("../../etc/passwd.txt"), "passwd.txt");
  assert.equal(safeFilename("..\\..\\evil.pdf"), "evil.pdf");
  assert.equal(safeFilename('a"b<c>.pdf'), "a_b_c_.pdf");
});
