"use strict";

const DEFAULTS = Object.freeze({
  version: 1, requestsPerHour: 300, requestsPerDay: 2000,
  newSessionsAllowed: 15, suspiciousAllowed: 0, behaviourCollection: true
});

function readPolicy(value) {
  if (value !== undefined && (!value || typeof value !== "object" || Array.isArray(value))) {
    throw new Error("MCF policy must be an object");
  }
  for (const name of Object.keys(value || {})) {
    if (!Object.hasOwn(DEFAULTS, name)) throw new Error("Unknown MCF policy option: " + name);
  }
  const policy = { ...DEFAULTS, ...value };
  for (const name of ["version", "requestsPerHour", "requestsPerDay", "newSessionsAllowed", "suspiciousAllowed"]) {
    const minimum = name === "suspiciousAllowed" ? 0 : 1;
    if (!Number.isSafeInteger(policy[name]) || policy[name] < minimum) {
      throw new Error("Invalid MCF policy option: " + name);
    }
  }
  if (typeof policy.behaviourCollection !== "boolean") throw new Error("MCF behaviourCollection must be boolean");
  return Object.freeze(policy);
}

module.exports = { readPolicy };
