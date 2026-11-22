"use strict";

// Signatures and signed tokens. The format is fixed: a change here breaks every cookie and
// receipt already handed out.

const crypto = require("crypto");

function sign(text, secret) {
  return crypto.createHmac("sha256", secret).update(text).digest("base64url");
}

function signatureMatches(text, signature, secret) {
  const given = Buffer.from(signature);
  const wanted = Buffer.from(sign(text, secret));
  // timingSafeEqual throws when the lengths differ, so the lengths are compared first.
  return given.length === wanted.length && crypto.timingSafeEqual(given, wanted);
}

// kind is "id", "ticket" or "receipt". It is part of what is signed, so a token of one kind can
// never be handed in as another.
function signToken(kind, siteKey, data, secret) {
  const json = JSON.stringify({ t: kind, site: siteKey, ...data });
  const payload = Buffer.from(json).toString("base64url");
  return payload + "." + sign(payload, secret);
}

// Answers the token's data, or null. Times (iat, exp) are checked by the caller, because each
// kind has its own rule.
function readToken(kind, value, siteKey, secret) {
  if (typeof value !== "string") {
    return null;
  }
  const parts = value.split(".");
  if (parts.length !== 2) {
    return null;
  }
  const [payload, signature] = parts;

  // The signature is checked before the payload is read, so nothing a visitor made up is parsed.
  if (!signatureMatches(payload, signature, secret)) {
    return null;
  }

  let data;
  try {
    data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch (error) {
    return null;
  }
  if (data === null || typeof data !== "object") {
    return null;
  }
  if (data.t !== kind || data.site !== siteKey) {
    return null;
  }
  return data;
}

module.exports = { sign, signatureMatches, signToken, readToken };
