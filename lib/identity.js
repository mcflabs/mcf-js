"use strict";

// Who a request comes from: the session in the identity cookie, the account the website names,
// and the receipt of a solved captcha.

const crypto = require("crypto");
const { signToken, readToken } = require("./signing");

const ID_COOKIE = "mcf_id";
const RECEIPT_COOKIE = "mcf_receipt";

const ID_SECONDS = 30 * 24 * 60 * 60;
// The servers of one website do not agree on the time to the second.
const CLOCK_SLACK_SECONDS = 300;

function readCookie(header, name) {
  if (typeof header !== "string") {
    return null;
  }
  for (const part of header.split(";")) {
    const text = part.trim();
    if (text.startsWith(name + "=")) {
      return text.slice(name.length + 1);
    }
  }
  return null;
}

// Answers { id, iat } or null. Only a cookie this website signed counts: an id a visitor made up
// must not look like a session that exists.
function readIdentity(cookieHeader, siteKey, secret, nowSeconds) {
  const data = readToken("id", readCookie(cookieHeader, ID_COOKIE), siteKey, secret);
  if (data === null || typeof data.id !== "string" || typeof data.iat !== "number") {
    return null;
  }
  // An old cookie ends here, so cookies cannot be collected and kept forever.
  if (data.iat > nowSeconds + CLOCK_SLACK_SECONDS || data.iat <= nowSeconds - ID_SECONDS) {
    return null;
  }
  return { id: data.id, iat: data.iat };
}

// A new session. cookie is the whole Set-Cookie line.
function mintIdentity(siteKey, secret, nowSeconds, secure) {
  const id = "s_" + crypto.randomBytes(12).toString("hex");
  const token = signToken("id", siteKey, { id: id, iat: nowSeconds }, secret);
  // HttpOnly: the page script never needs the cookie. It gets a ticket from the status address.
  let cookie = ID_COOKIE + "=" + token + "; Path=/; Max-Age=" + ID_SECONDS + "; SameSite=Lax; HttpOnly";
  if (secure) {
    cookie += "; Secure";
  }
  return { id: id, iat: nowSeconds, cookie: cookie };
}

// The ids of the requirements this session solved a captcha for. A receipt of another session
// gives nothing, so a receipt cannot be passed around.
function readReceipt(cookieHeader, siteKey, secret, sessionId, nowSeconds) {
  const data = readToken("receipt", readCookie(cookieHeader, RECEIPT_COOKIE), siteKey, secret);
  if (data === null || data.session !== sessionId) {
    return [];
  }
  if (!Number.isFinite(data.exp) || data.exp <= nowSeconds || !Array.isArray(data.reqs) ||
      data.reqs.length > 8 || !data.reqs.every(id => /^r_[0-9a-f]{24}$/.test(id))) {
    return [];
  }
  return data.reqs.filter(function (id) {
    return typeof id === "string";
  });
}

// The website's own account id never leaves this server. The service only sees this scrambled
// form, which is the same for every request of the account.
function accountKey(accountId, secret) {
  const hex = crypto.createHmac("sha256", secret).update("account." + accountId).digest("hex");
  return "a:" + hex.slice(0, 32);
}

module.exports = { readCookie, readIdentity, mintIdentity, readReceipt, accountKey };
