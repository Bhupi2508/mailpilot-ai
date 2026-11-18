/**
 * Which "From" addresses a provider will accept.
 *
 *   { mode: "any" }                          demo only (nothing is delivered)
 *   { mode: "list", addresses, domains }     everything else
 *
 * A mail server only lets an authenticated account send as addresses it
 * controls (the login itself, "send as" aliases, verified domains). We can't
 * ask the server, so SMTP uses an explicit allowlist from the environment:
 * SMTP_FROM_EMAIL, SMTP_USER (if it is an address) and SMTP_ALLOWED_FROM.
 */
const ADDRESS_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

function listPolicy(entries) {
  const addresses = new Set();
  const domains = new Set();
  for (const raw of entries) {
    const v = String(raw || "").trim().toLowerCase();
    if (!v) continue;
    if (v.startsWith("@")) domains.add(v);
    else if (ADDRESS_RE.test(v)) addresses.add(v);
  }
  return { mode: "list", addresses: [...addresses], domains: [...domains] };
}

function smtpPolicy(smtp) {
  return listPolicy([smtp.fromEmail, smtp.user, ...(smtp.allowedFrom || [])]);
}

const anyPolicy = () => ({ mode: "any", addresses: [], domains: [] });

function isSenderAllowed(policy, email) {
  if (!policy || policy.mode === "any") return true;
  const e = String(email || "").trim().toLowerCase();
  const at = e.lastIndexOf("@");
  if (at < 1) return false;
  return policy.addresses.includes(e) || policy.domains.includes(e.slice(at));
}

function describePolicy(policy) {
  const parts = [...policy.addresses, ...policy.domains.map((d) => `any address ${d}`)];
  return parts.length ? parts.join(", ") : "none configured";
}

module.exports = { smtpPolicy, listPolicy, anyPolicy, isSenderAllowed, describePolicy };
