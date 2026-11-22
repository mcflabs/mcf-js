"use strict";

// The local copy of the service's decisions: who must verify. A request is judged from this copy
// alone, so it never waits for the service.

const { cleanIp, ipGroup } = require("./ip");
const MAX_ENTRIES = 5000;
// A change that was missed would stay missed for ever. A whole new copy now and then heals it.
const SNAPSHOT_EVERY_MS = 5 * 60 * 1000;

function isSessionKey(key) {
  return key.startsWith("s:");
}

function isValidDecision(decision, prefix) {
  if (!decision || typeof decision !== "object" || !/^r_[0-9a-f]{24}$/.test(decision.id) ||
      typeof decision.key !== "string" || typeof decision.active !== "boolean") return false;
  if (/^(s:s_[0-9a-f]{24}|a:[0-9a-f]{32})$/.test(decision.key)) {
    return decision.from === null && decision.until === null;
  }
  if (!decision.key.startsWith("ip:")) return false;
  const group = decision.key.slice(3);
  const address = cleanIp(group.split("/")[0]);
  return address !== null && ipGroup(address, prefix) === group &&
    Number.isSafeInteger(decision.from) && decision.from >= 0 &&
    Number.isSafeInteger(decision.until) && decision.until > decision.from;
}

function isValidAnswer(answer) {
  if (!answer || typeof answer !== "object" || answer.ok !== true ||
      !Number.isSafeInteger(answer.cursor) || answer.cursor < 0 ||
      typeof answer.snapshot !== "boolean" || typeof answer.truncated !== "boolean" ||
      !Array.isArray(answer.decisions) || answer.decisions.length > MAX_ENTRIES ||
      !answer.config || typeof answer.config.behaviourCollection !== "boolean" ||
      !Number.isInteger(answer.config.ipv6Prefix) || answer.config.ipv6Prefix < 1 ||
      answer.config.ipv6Prefix > 128) return false;
  const keys = new Set();
  for (const decision of answer.decisions) {
    if (!isValidDecision(decision, answer.config.ipv6Prefix)) return false;
    if (answer.snapshot && (!decision.active || keys.has(decision.key))) return false;
    keys.add(decision.key);
  }
  return answer.snapshot || !answer.truncated;
}

// Answers false when something had to be left out. Account and address entries stand for many
// requests, so when the cache is full it is a session entry that makes room.
function store(byKey, decision) {
  const entry = { id: decision.id, key: decision.key, from: decision.from, until: decision.until };
  if (byKey.has(decision.key) || byKey.size < MAX_ENTRIES) {
    byKey.set(decision.key, entry);
    return true;
  }

  // A Map lists its keys in the order they were added, so the first session key is the oldest.
  let oldestSession = null;
  for (const key of byKey.keys()) {
    if (isSessionKey(key)) {
      oldestSession = key;
      break;
    }
  }
  if (oldestSession !== null) {
    byKey.delete(oldestSession);
    byKey.set(decision.key, entry);
  } else if (!isSessionKey(decision.key)) {
    byKey.delete(byKey.keys().next().value);
    byKey.set(decision.key, entry);
  }
  return false;
}

function createDecisionCache(freshForMs) {
  let byKey = new Map();
  let appliedAt = 0;
  let snapshotAt = 0;
  let cursor = null;
  let prefix = null;
  let truncated = false;
  let collectBehaviour = false;
  let needsSnapshot = false;

  // Not fresh means the service has not been heard from: after a start, or during an outage.
  // Then nobody is refused, so a problem on our side never locks a website's visitors out.
  function isFresh(now) {
    return appliedAt > 0 && now - appliedAt < freshForMs;
  }

  function find(key) {
    return byKey.get(key) || null;
  }

  // Answers false, and changes nothing, when the answer cannot be used. Only a whole, valid
  // answer may keep the cache fresh.
  function apply(answer, now) {
    if (!isValidAnswer(answer) || (!answer.snapshot && cursor !== null && answer.cursor < cursor)) {
      needsSnapshot = true;
      return false;
    }

    if (answer.snapshot === true) {
      const next = new Map();
      let cut = answer.truncated === true;
      for (const decision of answer.decisions) {
        if (!store(next, decision)) {
          cut = true;
        }
      }
      // The keys of address groups depend on the prefix, so the two change together.
      byKey = next;
      prefix = answer.config.ipv6Prefix;
      truncated = cut;
      snapshotAt = now;
    } else {
      if (answer.config.ipv6Prefix !== prefix) {
        // Changes made for another prefix do not fit this cache. A snapshot is asked for instead.
        needsSnapshot = true;
        return false;
      }
      for (const decision of answer.decisions) {
        if (decision.active === true) {
          if (!store(byKey, decision)) {
            truncated = true;
          }
        } else {
          // Only the same requirement is taken away. A late message about an older one must not
          // remove the newer one that now stands for this key.
          const entry = byKey.get(decision.key);
          if (entry && entry.id === decision.id) {
            byKey.delete(decision.key);
          }
        }
      }
    }

    needsSnapshot = false;
    collectBehaviour = answer.config.behaviourCollection === true;
    cursor = answer.cursor;
    appliedAt = now;
    return true;
  }

  // After a gap the list of changes may have holes, so a snapshot is asked for (cursor null).
  function cursorForSync(now) {
    return !needsSnapshot && isFresh(now) && now - snapshotAt < SNAPSHOT_EVERY_MS ? cursor : null;
  }

  return {
    isFresh: isFresh,
    find: find,
    apply: apply,
    cursorForSync: cursorForSync,
    prefix: function () { return prefix; },
    size: function () { return byKey.size; },
    isTruncated: function () { return truncated; },
    collectsBehaviour: function () { return collectBehaviour; },
    appliedAt: function () { return appliedAt; }
  };
}

module.exports = { createDecisionCache };
