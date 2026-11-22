"use strict";

// The site owner's page test. A signed-in owner starts it in the MCF dashboard and is sent to
// their own website in their own browser. For a few minutes that one browser has a requirement
// of its own, so the owner sees a real refusal, the real captcha and the real return, while
// every other visitor is judged exactly as before (docs/troubleshooting.md).
//
// Nothing here calls the service. What every server process must know travels with the browser
// as signed tokens, so the test works the same behind a load balancer:
//
//   launch  service -> library   "the owner started test C for this origin"
//   bind    library -> service   "session S of this origin wants test C"
//   grant   service -> library   "test C belongs to session S; its requirement is R"
//   setup   library -> library   the cookie that carries the test between requests

const crypto = require("crypto");
const { signToken, readToken } = require("./signing");
const { readCookie } = require("./identity");

const SETUP_PATH = "/_mcf/setup";
const SETUP_COOKIE = "mcf_setup";

const BIND_SECONDS = 60;
// A test names its own end. This only bounds what a wrong clock could do.
const MAX_TEST_SECONDS = 60 * 60;
const MAX_PATH = 512;

const CHECK_ID = /^c_[0-9a-f]{24}$/;
const REQUIREMENT_ID = /^r_[0-9a-f]{24}$/;
const PAGE_DIGEST = /^[0-9a-f]{32}$/;
const PLACEHOLDER_ORIGIN = "http://mcf.invalid";

function matches(pattern, value) {
  return typeof value === "string" && pattern.test(value);
}

// Answers a path on this website, or null. The browser is sent there, so anything that could
// lead to another website ("//host", "/\host") is refused.
function readPath(value) {
  if (typeof value !== "string" || value.length > MAX_PATH || !value.startsWith("/") ||
      /^\/[/\\]/.test(value) || /[\\\u0000- \u007f]/.test(value)) {
    return null;
  }
  try {
    const url = new URL(value, PLACEHOLDER_ORIGIN);
    return url.origin === PLACEHOLDER_ORIGIN && !url.pathname.startsWith("//")
      ? url.pathname + url.search : null;
  } catch (error) {
    return null;
  }
}

// A browser opening a page, as opposed to a background read, an image or a HEAD request.
function isPageRead(req) {
  return req.method === "GET" && String(req.headers.accept || "").includes("text/html");
}

// Says which page was refused without putting its address into a cookie.
function pageDigest(address) {
  return crypto.createHash("sha256").update(address).digest("hex").slice(0, 32);
}

// site: { siteKey, secret, siteOrigin }. Answers { check } or { problem }.
function readLaunch(value, site, nowSeconds) {
  const data = readToken("setup-launch", value, site.siteKey, site.secret);
  if (data === null || !matches(CHECK_ID, data.check)) {
    return { problem: "invalid" };
  }
  if (!Number.isFinite(data.exp) || data.exp <= nowSeconds) {
    return { problem: "expired" };
  }
  if (data.origin !== site.siteOrigin) {
    return { problem: "origin", origin: data.origin };
  }
  return { check: data.check };
}

function bindTicket(site, check, sessionId, nowSeconds) {
  return signToken("setup-bind", site.siteKey, {
    check: check, session: sessionId, origin: site.siteOrigin, exp: nowSeconds + BIND_SECONDS
  }, site.secret);
}

// session: this browser's identity, or null. A grant names one session, so a link that was
// copied to another browser starts nothing there. Answers { check, req, exp, path } or { problem }.
function readGrant(value, site, session, nowSeconds) {
  const data = readToken("setup-grant", value, site.siteKey, site.secret);
  if (data === null || !matches(CHECK_ID, data.check) || !matches(REQUIREMENT_ID, data.req)) {
    return { problem: "invalid" };
  }
  if (!Number.isFinite(data.exp) || data.exp <= nowSeconds) {
    return { problem: "expired" };
  }
  if (data.origin !== site.siteOrigin) {
    return { problem: "origin", origin: data.origin };
  }
  if (session === null || data.session !== session.id) {
    return { problem: "browser" };
  }
  const path = readPath(data.path);
  if (path === null || data.exp > nowSeconds + MAX_TEST_SECONDS) {
    return { problem: "invalid" };
  }
  return { check: data.check, req: data.req, exp: data.exp, path: path };
}

// probe: { check, req, session, exp, page }. page is null until a page was refused for the test,
// then the digest of that page. cookie is the whole Set-Cookie line.
function probeCookie(site, probe, nowSeconds, secure) {
  const token = signToken("setup", site.siteKey, {
    check: probe.check, req: probe.req, session: probe.session, origin: site.siteOrigin,
    target: probe.target, page: probe.page, exp: probe.exp
  }, site.secret);
  // The cookie ends with the test, so nothing of the test stays in the browser afterwards.
  const seconds = Math.max(1, probe.exp - nowSeconds);
  let cookie = SETUP_COOKIE + "=" + token + "; Path=/; Max-Age=" + seconds + "; SameSite=Lax; HttpOnly";
  if (secure) {
    cookie += "; Secure";
  }
  return cookie;
}

// The test this browser is in, or null. It counts only for the session it was granted to and on
// the origin it was started for, so two websites sharing a host name and a site key stay apart.
function readProbe(cookieHeader, site, sessionId, nowSeconds) {
  // Almost no request carries this cookie, so the usual case costs one search in a text.
  if (typeof cookieHeader !== "string" || !cookieHeader.includes(SETUP_COOKIE + "=")) {
    return null;
  }
  const data = readToken("setup", readCookie(cookieHeader, SETUP_COOKIE), site.siteKey, site.secret);
  if (data === null || data.session !== sessionId || data.origin !== site.siteOrigin) {
    return null;
  }
  if (!matches(CHECK_ID, data.check) || !matches(REQUIREMENT_ID, data.req) ||
      !Number.isFinite(data.exp) || data.exp <= nowSeconds) {
    return null;
  }
  if (!matches(PAGE_DIGEST, data.target) || (data.page !== null && data.page !== data.target)) {
    return null;
  }
  return { check: data.check, req: data.req, session: data.session, exp: data.exp, target: data.target, page: data.page };
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function problemText(result, site) {
  if (result.problem === "expired") {
    return "This link has run out of time.";
  }
  if (result.problem === "origin") {
    return "This test was started for " + escapeHtml(result.origin) + ", but this server is configured " +
      "with siteOrigin " + escapeHtml(site.siteOrigin) + ".";
  }
  if (result.problem === "browser") {
    return "This link belongs to another browser. A page test stays with the browser that opened it first.";
  }
  return "This link was not made for this server. Either it was changed on the way, or this server " +
    "is configured with a different site key or secret than the site the test was started for.";
}

// The owner is looking at this tab, so it says what went wrong instead of showing the website.
function sendProblem(res, result, site) {
  res.statusCode = 400;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end("<!doctype html>\n" +
    '<html><head><meta charset="utf-8"><title>Page test</title></head>\n' +
    "<body><h1>The page test could not start</h1>\n" +
    "<p>" + problemText(result, site) + "</p>\n" +
    "<p>Start a new page test from your Make Captcha Fun dashboard.</p>\n" +
    "</body></html>\n");
}

function redirect(res, location) {
  res.statusCode = 302;
  res.setHeader("Location", location);
  res.end();
}

module.exports = {
  SETUP_PATH,
  readPath,
  isPageRead,
  pageDigest,
  readLaunch,
  bindTicket,
  readGrant,
  probeCookie,
  readProbe,
  sendProblem,
  redirect
};
