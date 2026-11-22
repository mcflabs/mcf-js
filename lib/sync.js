"use strict";

// The one background call to the service: it hands over what was counted and brings back the
// decisions. It runs on a timer and never while a request is handled, so no visitor waits for it.

const crypto = require("crypto");
const { sign } = require("./signing");

const TIMEOUT_MS = 4000;
const MAX_TRIES = 3;
// A report older than this is given up, even with a very long sync interval.
const MAX_REPORT_AGE_MS = 30 * 60 * 1000;

// options: { siteKey, secret, reportUrl, siteOrigin, syncEveryMs, policy }
function createSync(options, buffer, cache) {
  // Tells the processes of one website apart.
  const instance = "i_" + crypto.randomBytes(8).toString("hex");

  // The report that is on its way: { batch, activity, ips, setup }. It is sent again unchanged,
  // under the same batch id, until it has been answered, so it is counted once only.
  let report = null;
  let tries = 0;
  let running = false;
  let lastSyncAt = 0;
  let uncertainBatches = 0;
  let policyStatus = "pending";
  let activePolicyVersion = null;
  let warnedPolicy = null;
  let warnedPolicyProtocol = false;

  function nextReport() {
    const lists = buffer.take();
    // The batch id is what keeps counts from being added twice. Page test notes are not
    // counts, so a report that holds nothing else still needs no batch.
    const empty = lists.activity.length === 0 && lists.ips.length === 0;
    return {
      startedAt: Date.now(),
      batch: empty ? null : "b_" + crypto.randomBytes(8).toString("hex"),
      activity: lists.activity,
      ips: lists.ips,
      setup: lists.setup || []
    };
  }

  async function send() {
    const now = Date.now();
    const bodyText = JSON.stringify({
      instance: instance,
      // The address this server was configured with, for the owner's page test.
      origin: options.siteOrigin,
      policy: options.policy,
      setup: report.setup,
      batch: report.batch,
      cursor: cache.cursorForSync(now),
      prefix: cache.prefix(),
      activity: report.activity,
      ips: report.ips,
      dropped: buffer.dropped(),
      uncertainBatches,
      cache: { size: cache.size(), truncated: cache.isTruncated(),
        fresh: cache.isFresh(now), appliedAt: cache.appliedAt() }
    });

    // The signature is over the exact text. That is why it is sent as a text inside the JSON and
    // not as plain JSON.
    const response = await fetch(options.reportUrl + "/v1/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        site: options.siteKey,
        body: bodyText,
        signature: sign("sync." + bodyText, options.secret)
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
    const answer = await response.json();
    if (response.status !== 200 || answer === null || answer.ok !== true) {
      throw new Error("The service refused the sync");
    }
    return answer;
  }

  function retrySetupNotes() {
    for (const note of report.setup) buffer.noteSetup(note.check, note.session, note.stage);
  }

  function abandonReport() {
    // A missing acknowledgement is not proof that all counts were lost.
    if (report.batch !== null) uncertainBatches += 1;
    // Page test notes are facts, not counts: saying one twice changes nothing. So they go into
    // the next report instead of being given up, and an owner's finished test is not lost to
    // one bad sync. The buffer keeps only a few of them.
    retrySetupNotes();
    report = null;
  }

  async function syncOnce() {
    if (running) return;
    running = true;
    if (report !== null && Date.now() - report.startedAt >= MAX_REPORT_AGE_MS) abandonReport();
    if (report === null) {
      report = nextReport();
      tries = 0;
    }
    try {
      const answer = await send();
      // Transport success and valid decision application are different health signals.
      lastSyncAt = Date.now();
      const policy = answer.policy;
      if (!policy || !Number.isSafeInteger(policy.version) || policy.version < 1 ||
          !["applied", "outdated", "conflict"].includes(policy.status)) {
        if (!warnedPolicyProtocol) {
          console.warn("MCF returned an invalid policy acknowledgement. Upgrade the service before deploying this SDK; decisions are not being refreshed.");
          warnedPolicyProtocol = true;
        }
        throw new Error("Missing MCF policy acknowledgement; update the service");
      }
      warnedPolicyProtocol = false;
      policyStatus = policy.status;
      activePolicyVersion = policy.version;
      const warning = policy.status + ":" + policy.version;
      if (policy.status !== "applied" && warnedPolicy !== warning) {
        console.warn("MCF policy is " + policy.status + ". This backend uses version " +
          options.policy.version + "; MCF uses version " + policy.version +
          (policy.status === "conflict" ? ". Increment policy.version when changing settings." : ". Deploy the current policy to this backend.") +
          " Use identical policy values and version on all backends sharing this site key.");
        warnedPolicy = warning;
      }
      if (policy.status === "applied") warnedPolicy = null;
      const batch = answer.batch;
      if (!batch || batch.id !== report.batch ||
          !(report.batch === null ? batch.status === "none" :
            ["processing", "completed", "uncertain"].includes(batch.status))) {
        throw new Error("Missing batch processing status");
      }
      cache.apply(answer, lastSyncAt);
      if (batch.status === "processing") throw new Error("Batch is still processing");
      if (batch.status === "uncertain") abandonReport();
      else {
        if (answer.setupRecorded === false) retrySetupNotes();
        report = null;
      }
    } catch (error) {
      tries += 1;
      if (tries >= MAX_TRIES) abandonReport();
    } finally {
      running = false;
    }
  }

  // unref() lets the server stop even while the timer is waiting.
  setInterval(syncOnce, options.syncEveryMs).unref();
  // Once at start, so a new process does not wait a whole turn for its first decisions.
  syncOnce();

  return {
    lastSyncAt: function () { return lastSyncAt; },
    uncertainBatches: function () { return uncertainBatches; },
    activePolicyVersion: function () { return activePolicyVersion; },
    policyStatus: function () { return policyStatus; }
  };
}

module.exports = { createSync };
