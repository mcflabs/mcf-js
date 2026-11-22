"use strict";

// What happened on this server and was not reported yet. It only lives in memory and has a fixed
// largest size, so neither a flood nor an outage can make it grow without end.

const MAX_ENTRIES = 5000;
// One owner runs one page test at a time. This only keeps a mistake from growing the list.
const MAX_SETUP_ENTRIES = 20;

function createActivityBuffer() {
  // Key: subject key + " " + solved ids. Value: { key, solved, ip, requests, refused }.
  let subjects = new Map();
  // Key: the address. Value: { ip, mints, requests }.
  let ips = new Map();
  // Key: check + " " + session + " " + stage. Value: { check, session, stage }.
  let setup = new Map();
  // Counts that could not be kept or delivered, since this process started.
  let dropped = 0;

  function subjectEntry(key, solved, ip) {
    const entryKey = key + " " + solved.join(",");
    let entry = subjects.get(entryKey);
    if (!entry) {
      if (subjects.size >= MAX_ENTRIES) {
        return null;
      }
      entry = { key: key, solved: solved, ip: ip, requests: 0, refused: 0 };
      subjects.set(entryKey, entry);
    }
    entry.ip = ip;
    return entry;
  }

  function ipEntry(ip) {
    if (ip === null) {
      return null;
    }
    let entry = ips.get(ip);
    if (!entry) {
      if (ips.size >= MAX_ENTRIES) {
        return null;
      }
      entry = { ip: ip, mints: 0, requests: 0 };
      ips.set(ip, entry);
    }
    return entry;
  }

  // solved: the requirement ids of the receipt the request carried. They are reported with
  // the count.
  function countContent(key, solved, ip) {
    const subject = subjectEntry(key, solved, ip);
    if (subject) {
      subject.requests += 1;
    } else {
      dropped += 1;
    }
    // The address keeps its own count, so a flood of sessions is still seen per address when
    // there is no room left to list every session.
    const address = ipEntry(ip);
    if (address) {
      address.requests += 1;
    }
  }

  function countRefused(key, ip) {
    const subject = subjectEntry(key, [], ip);
    if (subject) {
      subject.refused += 1;
    }
  }

  function countMint(ip) {
    const address = ipEntry(ip);
    if (address) {
      address.mints += 1;
    } else if (ip !== null) {
      dropped += 1;
    }
  }

  // What happened in the owner's page test (lib/setup.js). It is a fact, not a count: saying it
  // twice changes nothing, so it is kept once per report.
  function noteSetup(check, session, stage) {
    const entryKey = check + " " + session + " " + stage;
    if (setup.has(entryKey) || setup.size < MAX_SETUP_ENTRIES) {
      setup.set(entryKey, { check: check, session: session, stage: stage });
    }
  }

  // Hands over everything collected so far and starts again from nothing.
  function take() {
    const lists = {
      activity: Array.from(subjects.values()),
      ips: Array.from(ips.values()),
      setup: Array.from(setup.values())
    };
    subjects = new Map();
    ips = new Map();
    setup = new Map();
    return lists;
  }

  return {
    countContent: countContent,
    countRefused: countRefused,
    countMint: countMint,
    noteSetup: noteSetup,
    take: take,
    dropped: function () { return dropped; }
  };
}

module.exports = { createActivityBuffer };
