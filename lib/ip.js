"use strict";

// Network addresses and their groups, in the one form that is reported.

const net = require("net");

// Answers the address in one fixed form, or null when it is no address.
function cleanIp(value) {
  if (typeof value !== "string") {
    return null;
  }
  // A zone ("%eth0") names a network card of this machine, not the visitor.
  let ip = value.trim().split("%")[0].toLowerCase();
  // Node reports an IPv4 visitor on an IPv6 socket as "::ffff:1.2.3.4".
  if (ip.startsWith("::ffff:") && net.isIPv4(ip.slice(7))) {
    ip = ip.slice(7);
  }
  if (net.isIPv4(ip) || net.isIPv6(ip)) {
    return ip;
  }
  return null;
}

// The eight 16-bit parts of an IPv6 address, as numbers.
function ipv6Parts(ip) {
  let text = ip;
  // The last 32 bits may be written as an IPv4 address ("64:ff9b::1.2.3.4").
  const lastColon = text.lastIndexOf(":");
  const tail = text.slice(lastColon + 1);
  if (tail.includes(".")) {
    const bytes = tail.split(".").map(Number);
    text = text.slice(0, lastColon + 1) +
      (bytes[0] * 256 + bytes[1]).toString(16) + ":" + (bytes[2] * 256 + bytes[3]).toString(16);
  }

  const halves = text.split("::");
  const head = halves[0] === "" ? [] : halves[0].split(":");
  const rest = halves.length > 1 && halves[1] !== "" ? halves[1].split(":") : [];
  const zeros = new Array(8 - head.length - rest.length).fill("0");
  return head.concat(zeros, rest).map(function (part) {
    return parseInt(part, 16);
  });
}

// ip must come from cleanIp. One device can use any address inside its IPv6 prefix, so the rule
// about new sessions looks at the prefix. A group is a rough network group, never a device.
function ipGroup(ip, prefix) {
  if (net.isIPv4(ip)) {
    return ip;
  }
  const parts = ipv6Parts(ip);
  const kept = [];
  for (let i = 0; i < 8; i++) {
    const bitsLeft = prefix - 16 * i;
    let part = parts[i];
    if (bitsLeft <= 0) {
      part = 0;
    } else if (bitsLeft < 16) {
      part = part & (0xffff << (16 - bitsLeft)) & 0xffff;
    }
    kept.push(part.toString(16));
  }
  return kept.join(":") + "/" + prefix;
}

module.exports = { cleanIp, ipGroup };
