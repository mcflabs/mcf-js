"use strict";

const { signToken, readToken } = require("./lib/signing");
const { readIdentity, mintIdentity, readReceipt, accountKey } = require("./lib/identity");
const { cleanIp, ipGroup } = require("./lib/ip");
const { createDecisionCache } = require("./lib/decisions");
const { createActivityBuffer } = require("./lib/activity");
const { createSync } = require("./lib/sync");
const { readOrigin } = require("./lib/origin");
const { readPolicy } = require("./lib/policy");
const { STATUS_PATH, createAnswers } = require("./lib/answers");
const setup = require("./lib/setup");

const REQUIRED_OPTIONS = ["siteKey", "secret", "serviceUrl"];
const TICKET_SECONDS = 600;
const MAX_REQUIREMENTS = 8;

// Reads are what a collector takes. Writes are left alone unless the website asks for them, so
// MCF never gets in the way of an order or a payment by surprise.
function protectReads(req) {
  return req.method === "GET" || req.method === "HEAD";
}

// Judged from the answer this server gave, not from what the visitor asked for: a collector
// chooses its own request headers.
function countPages(req, res) {
  if (req.method === "HEAD" || res.statusCode < 200 || res.statusCode > 299) {
    return false;
  }
  const type = String(res.getHeader("content-type") || "");
  return type.startsWith("text/html") || type.startsWith("application/json");
}

function socketAddress(req) {
  return req.socket ? req.socket.remoteAddress : null;
}

function pickFunction(value, fallback) {
  return typeof value === "function" ? value : fallback;
}

function pickNumber(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function mcf(options) {
  for (const name of REQUIRED_OPTIONS) {
    if (!options || typeof options[name] !== "string" || options[name] === "") {
      throw new Error('make-captcha-fun-js: the option "' + name + '" is required');
    }
  }
  const { siteKey, secret, serviceUrl } = options;

  // serviceUrl is the address the visitor's browser uses. This server may reach the service at
  // another address (inside Docker, for example), which reportUrl then names.
  let reportUrl = serviceUrl;
  if (typeof options.reportUrl === "string" && options.reportUrl !== "") {
    reportUrl = options.reportUrl;
  }

  const protect = pickFunction(options.protect, protectReads);
  const countResponse = pickFunction(options.countResponse, countPages);
  const accountId = pickFunction(options.accountId, null);
  const clientIp = pickFunction(options.clientIp, socketAddress);

  const siteOrigin = readOrigin(options.siteOrigin);
  if (siteOrigin === null) throw new Error("MCF siteOrigin must be an HTTP(S) origin, such as https://www.example.com, without a path");
  const policy = readPolicy(options.policy);
  const site = { siteKey: siteKey, secret: secret, siteOrigin: siteOrigin };
  const answers = createAnswers(serviceUrl, siteKey);
  const cache = createDecisionCache(pickNumber(options.freshForMs, 30000));
  const buffer = createActivityBuffer();
  const sync = createSync({
    siteKey: siteKey,
    secret: secret,
    reportUrl: reportUrl,
    siteOrigin: siteOrigin,
    policy,
    syncEveryMs: pickNumber(options.syncEveryMs, 5000)
  }, buffer, cache);

  function secureFor(req) {
    return options.secureCookies === true || Boolean(req.socket && req.socket.encrypted);
  }

  // Everything known about who sent a request. session is null when it has no valid identity.
  // probe is the owner's page test this browser is in (lib/setup.js), for almost everyone null.
  function identify(req, nowSeconds) {
    const session = readIdentity(req.headers.cookie, siteKey, secret, nowSeconds);

    let account = null;
    if (accountId) {
      const id = accountId(req);
      if (typeof id === "string" && id !== "") {
        account = accountKey(id, secret);
      }
    }

    return {
      session: session,
      account: account,
      ip: cleanIp(clientIp(req)),
      solved: session ? readReceipt(req.headers.cookie, siteKey, secret, session.id, nowSeconds) : [],
      probe: session ? setup.readProbe(req.headers.cookie, site, session.id, nowSeconds) : null
    };
  }

  // The page test's own requirement while this browser has not verified for it, or null. It is
  // never put into the decision cache: it lives in this one browser's cookie, so no other
  // visitor can meet it and it can never stand in for a real requirement.
  function pendingProbe(visitor) {
    const probe = visitor.probe;
    return probe !== null && !visitor.solved.includes(probe.req) ? probe : null;
  }

  // The requirements that apply to this visitor. Empty while the service has not been heard
  // from, which is how every outage ends in "let everyone through".
  function requirementsFor(visitor, now) {
    const found = [];
    if (!cache.isFresh(now)) {
      return found;
    }
    const forSession = cache.find("s:" + visitor.session.id);
    if (forSession) {
      found.push(forSession);
    }
    if (visitor.account) {
      const forAccount = cache.find(visitor.account);
      if (forAccount) {
        found.push(forAccount);
      }
    } else if (visitor.ip) {
      // The rule about new sessions is for visitors nothing else is known about. Sessions made
      // before the trouble started are left alone, which is what "from" says.
      const episode = cache.find("ip:" + ipGroup(visitor.ip, cache.prefix()));
      if (episode && now < episode.until && (visitor.session.iat + 1) * 1000 > episode.from) {
        found.push(episode);
      }
    }
    return found;
  }

  function notSolved(requirements, solved) {
    return requirements.filter(function (requirement) {
      return !solved.includes(requirement.id);
    });
  }

  function answerStatus(req, res) {
    const now = Date.now();
    const nowSeconds = Math.floor(now / 1000);
    const visitor = identify(req, nowSeconds);
    // No session is made here: it would be one that was never counted as new.
    if (visitor.session === null) {
      answers.sendStatus(res, { required: false, ticket: null, collect: false });
      return;
    }

    const requirements = requirementsFor(visitor, now);
    const open = notSolved(requirements, visitor.solved);

    // The page test gets a captcha of its own, and only in this order: a page was really
    // refused for it (probe.page), and no real requirement is still open. So one captcha never
    // answers for both, and the test can never clear what a real requirement asks.
    const probe = pendingProbe(visitor);
    const setupPage = req.headers["mcf-setup-page"];
    const matchesPage = visitor.probe !== null && typeof setupPage === "string" &&
      setup.pageDigest(setupPage) === visitor.probe.page && req.headers["mcf-setup-site"] === siteKey;
    const rehearsal = open.length === 0 && probe !== null && matchesPage &&
      req.headers["mcf-setup-view"] === "refusal" && cache.isFresh(now);
    const confirmPage = visitor.probe !== null && visitor.probe.page !== null &&
      visitor.solved.includes(visitor.probe.req);
    if (confirmPage && matchesPage && req.headers["mcf-setup-view"] === "layout") {
      buffer.noteSetup(visitor.probe.check, visitor.probe.session, "script");
    }

    // Preserve this session's verified IDs even while login or a network change makes them
    // temporarily inapplicable. Current requirements take priority within the wire-format cap.
    // Only exact IDs are carried: an old receipt never exempts a new threshold crossing.
    const ids = [...new Set([
      ...(rehearsal ? [probe.req] : []),
      ...requirements.map(requirement => requirement.id), ...visitor.solved
    ])].slice(0, MAX_REQUIREMENTS);
    const data = {
      session: visitor.session.id,
      origin: siteOrigin,
      reqs: ids,
      exp: nowSeconds + TICKET_SECONDS
    };
    if (rehearsal) {
      // Marks this captcha as the page test's own.
      data.setup = probe.check;
    }
    answers.sendStatus(res, {
      required: open.length > 0 || rehearsal,
      ...(confirmPage ? { confirmSetup: true } : {}),
      ticket: signToken("ticket", siteKey, data, secret),
      collect: policy.behaviourCollection && cache.collectsBehaviour()
    });
  }

  // GET /_mcf/setup: the two steps that put the owner's browser into a page test. Each step
  // only checks a signature and sends the browser on, so any server process can answer either.
  function answerSetup(req, res) {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const address = String(req.originalUrl || req.url || "");
    const mark = address.indexOf("?");
    const query = new URLSearchParams(mark === -1 ? "" : address.slice(mark + 1));
    // The links hold short-lived tokens. They stay out of stored copies and Referer headers.
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    let session = readIdentity(req.headers.cookie, siteKey, secret, nowSeconds);

    if (query.has("grant")) {
      const grant = setup.readGrant(query.get("grant"), site, session, nowSeconds);
      if (grant.problem) {
        setup.sendProblem(res, grant, site);
        return;
      }
      res.appendHeader("Set-Cookie", setup.probeCookie(site, {
        check: grant.check, req: grant.req, session: session.id, exp: grant.exp, target: setup.pageDigest(grant.path), page: null
      }, nowSeconds, secureFor(req)));
      setup.redirect(res, grant.path);
      return;
    }

    const launch = setup.readLaunch(query.get("launch"), site, nowSeconds);
    if (launch.problem) {
      setup.sendProblem(res, launch, site);
      return;
    }
    if (session === null) {
      const minted = mintIdentity(siteKey, secret, nowSeconds, secureFor(req));
      res.appendHeader("Set-Cookie", minted.cookie);
      session = { id: minted.id, iat: minted.iat };
      buffer.countMint(cleanIp(clientIp(req)));
    }
    // This process does not decide which browser owns the test. The browser carries the
    // question to the service and the answer back.
    const ticket = setup.bindTicket(site, launch.check, session.id, nowSeconds);
    setup.redirect(res, serviceUrl + "/v1/setup/bind?site=" + encodeURIComponent(siteKey) +
      "&ticket=" + encodeURIComponent(ticket));
  }

  function handle(req, res, next) {
    const path = String(req.originalUrl || req.url || "").split("?")[0];
    if (path === STATUS_PATH && req.method === "GET") {
      answerStatus(req, res);
      return;
    }
    if (path === setup.SETUP_PATH && req.method === "GET") {
      answerSetup(req, res);
      return;
    }
    if (protect(req) !== true) {
      next();
      return;
    }

    const now = Date.now();
    const nowSeconds = Math.floor(now / 1000);
    const visitor = identify(req, nowSeconds);

    if (visitor.session === null) {
      const minted = mintIdentity(siteKey, secret, nowSeconds, secureFor(req));
      res.appendHeader("Set-Cookie", minted.cookie);
      visitor.session = { id: minted.id, iat: minted.iat };
      buffer.countMint(visitor.ip);
    }

    const open = notSolved(requirementsFor(visitor, now), visitor.solved);

    // The owner's page test. Its requirement is enforced under the same rule as a real one:
    // only while the decisions are fresh. A test that passed on stale decisions would say
    // "it works" about a server that is letting everyone through.
    const probe = pendingProbe(visitor);
    const pageRead = visitor.probe !== null && setup.isPageRead(req) &&
      setup.pageDigest(String(req.originalUrl || req.url || "")) === visitor.probe.target;
    let rehearsal = false;
    if (probe !== null) {
      if (!cache.isFresh(now)) {
        if (pageRead) {
          buffer.noteSetup(probe.check, probe.session, "unenforced");
        }
      } else {
        // It starts with a page: until one was refused, background reads pass, so the page
        // script is never asked for a captcha the status address does not know of yet.
        rehearsal = pageRead;
      }
    }

    if (open.length > 0 || rehearsal) {
      for (const requirement of open) {
        // Refusals are reported with the counts. Those under the address rule are not listed:
        // there is one per new session.
        if (!requirement.key.startsWith("ip:")) {
          buffer.countRefused(requirement.key, visitor.ip);
        }
      }
      if (rehearsal && pageRead && probe.page === null) {
        // The first refused page is the one the test must come back to. It is written into
        // the cookie, so every server process knows it at once.
        res.appendHeader("Set-Cookie", setup.probeCookie(site, {
          check: probe.check, req: probe.req, session: probe.session, exp: probe.exp,
          target: probe.target, page: probe.target
        }, nowSeconds, secureFor(req)));
        buffer.noteSetup(probe.check, probe.session, "refused");
      }
      answers.refuse(req, res);
      return;
    }

    // The return: the same page as the one that was refused, now with a receipt for the test's
    // own requirement. The receipt proves the captcha came in between.
    const returned = visitor.probe !== null && visitor.probe.page !== null && pageRead &&
      visitor.solved.includes(visitor.probe.req);

    const subject = visitor.account || "s:" + visitor.session.id;
    res.on("finish", function () {
      if (countResponse(req, res) === true) {
        buffer.countContent(subject, visitor.solved, visitor.ip);
      }
      // "Came back" means the website answered the page, not only that MCF let it through.
      if (returned && res.statusCode >= 200 && res.statusCode < 300 &&
          res.statusCode !== 204 && res.statusCode !== 205 &&
          /^text\/html(?:\s*;|$)/i.test(String(res.getHeader("Content-Type") || ""))) {
        buffer.noteSetup(visitor.probe.check, visitor.probe.session, "resumed");
      }
    });
    next();
  }

  // For the website's own monitoring. While "fresh" is false, nobody is refused.
  handle.health = function () {
    return {
      lastSyncAt: sync.lastSyncAt(),
      fresh: cache.isFresh(Date.now()),
      decisions: cache.size(),
      truncated: cache.isTruncated(),
      dropped: buffer.dropped(),
      uncertainBatches: sync.uncertainBatches(),
      lastAppliedAt: cache.appliedAt(),
      policyVersion: policy.version,
      activePolicyVersion: sync.activePolicyVersion(),
      policyStatus: sync.policyStatus()
    };
  };

  return handle;
}

mcf.readToken = readToken;

module.exports = mcf;
