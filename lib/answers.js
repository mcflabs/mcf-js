"use strict";

// What the library itself sends to a browser: the refusal, and the status the page script asks
// for.

const STATUS_PATH = "/_mcf/status";

// how is "reload" or "back": what the page script does once the visitor has verified.
function buildVerificationPage(serviceUrl, siteKey, how) {
  // Shown when the page script cannot be loaded (our service is down, or the browser blocks it),
  // so the visitor is not left on a page that does nothing. Within the freshness time of the
  // decisions, trying again gets the real page.
  const wayOut = how === "reload"
    ? '<a href="">Try again</a>'
    : '<a href="javascript:history.back()">Go back</a>';
  return "<!doctype html>\n" +
    '<html><head><meta charset="utf-8"><title>Quick check</title></head>\n' +
    "<body><p>One quick check before you continue…</p>\n" +
    "<noscript><p>Please turn on JavaScript to continue.</p></noscript>\n" +
    '<p id="mcf-failed" hidden>The check could not be loaded. ' + wayOut + "</p>\n" +
    '<script src="' + serviceUrl + '/mcf.js" data-site="' + siteKey + '" data-verify="' + how + '"' +
    " onerror=\"document.getElementById('mcf-failed').hidden=false\"></script>\n" +
    "</body></html>\n";
}

function createAnswers(serviceUrl, siteKey) {
  const reloadPage = buildVerificationPage(serviceUrl, siteKey, "reload");
  const backPage = buildVerificationPage(serviceUrl, siteKey, "back");

  function refuse(req, res) {
    res.statusCode = 403;
    // A stored copy of a refusal would be shown again after the visitor has verified.
    res.setHeader("Cache-Control", "no-store");
    // Background reads can ask for HTML too. Every refusal must be recognisable by mcf.fetch.
    res.setHeader("MCF-Verification", "required");

    // A browser opening a page can show the captcha there. Anything else (a fetch, an image) gets
    // a structured refusal. Accept chooses only the format, never the enforcement decision.
    const accept = req.headers.accept || "";
    if (accept.includes("text/html")) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      // Only a read is safe to send again. After a refused form post the visitor goes back to
      // the form instead.
      const isRead = req.method === "GET" || req.method === "HEAD";
      res.end(isRead ? reloadPage : backPage);
      return;
    }
    res.setHeader("Content-Type", "application/json");
    res.end('{"error":"mcf_verification_required"}');
  }

  function sendStatus(res, status) {
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store");
    res.end(JSON.stringify(status));
  }

  return { refuse: refuse, sendStatus: sendStatus };
}

module.exports = { STATUS_PATH, createAnswers };
