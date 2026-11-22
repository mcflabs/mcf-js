# Protection policy

The policy says how much a visitor may read before being asked to verify. It is set in your
server's code, next to the rest of the integration. The dashboard has no settings for it.

No policy is needed for a first run. Fields you leave out use the values shown here:

```js
app.use(mcf({
  siteKey: "site_...",
  secret: process.env.MCF_SECRET,
  serviceUrl: "https://app.makecaptchafun.com",
  siteOrigin: "https://www.example.com",
  policy: {
    version: 1,
    requestsPerHour: 300,
    requestsPerDay: 2000,
    newSessionsAllowed: 15,
    suspiciousAllowed: 0,
    behaviourCollection: true
  }
}));
```

## The fields

| Field | What it means | Default |
|---|---|---|
| `version` | The number of this set of values. Raise it with every change. | 1 |
| `requestsPerHour` | Pages one visitor may read in an hour. | 300 |
| `requestsPerDay` | Pages one visitor may read in a day. | 2000 |
| `newSessionsAllowed` | New sessions one network address may start in about ten minutes. | 15 |
| `suspiciousAllowed` | Actions a person would not show that are let pass. `0` means the first one can ask for verification. | 0 |
| `behaviourCollection` | Whether the page script reports how a page is used. `false` leaves only the counts and the network rule. | `true` |

All numbers are whole numbers. `suspiciousAllowed` may be 0; the others are at least 1. An unknown
field or a wrong value stops your server at start.

A "visitor" is a logged-in account when you pass [`accountId`](options.md#accounts), and a browser
session otherwise.

## How a policy takes effect

The library sends the whole policy with its signed background sync. No visitor request waits for
this.

Changing the policy does not reset any count, and does not clear a requirement that is already
open.

## Changing it

**Raise `version` with every change**, also when you go back to earlier values.

- A higher version replaces a lower one. A server still running the lower one cannot undo it.
- Different values under the same version are a conflict. The policy that was in force stays in
  force.
- Every server process that shares a site key must have the same values and the same version.

Count up by one each time. A version that was set far too high can only be corrected by a still
higher one.

## Seeing which policy is in force

`health()` on the function that `mcf(...)` returned says where this server stands:

```js
const check = mcf({ ... });
const health = check.health();
// health.policyVersion        the version this server is configured with
// health.activePolicyVersion  the version the service is enforcing
// health.policyStatus         "pending", "applied", "outdated" or "conflict"
```

| Status | Meaning |
|---|---|
| `pending` | No sync has been answered yet. |
| `applied` | The service enforces this server's policy. |
| `outdated` | The service enforces a higher version. Deploy the current policy to this server. |
| `conflict` | Same version, different values. Raise the version. |

For `outdated` and `conflict` the library also writes one warning to your server's output.
