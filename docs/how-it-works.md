# How it works

What the library does inside your server, what it sends to the service, and what it costs.

## On each request

1. `GET /_mcf/status` and `GET /_mcf/setup` are answered by the library itself. The first is what
   the [page script](page-script.md) asks; the second is where a [page test](page-test.md) enters
   your app. You do not route either.
2. If `protect(req)` is not true, the request passes and nothing else happens.
3. The library reads the `mcf_id` cookie. Without a valid one it starts a new session and sets the
   cookie. The cookie is signed with your secret, so a made-up or changed one counts as none.
4. It looks in its copy of the service's decisions for this session, for this account, and, for a
   visitor without an account, for this network address.
5. If the visitor must verify and has no receipt for it, the request is refused with status 403
   and the header `MCF-Verification: required`:
   - a browser opening a page (its `Accept` header contains `text/html`) gets a small page that
     shows the captcha and then loads the page again;
   - anything else gets `{"error":"mcf_verification_required"}`.
6. Otherwise the request passes to your code. When your answer is finished and it
   [counts as content](options.md#all-options), it is counted.

A visitor is never asked on arrival, and a missing cookie is no reason to refuse.

All of this is a signature check and a few lookups in memory. The library never calls the service
while it handles a request.

## After the captcha

A cleared captcha gives the browser a receipt, the cookie `mcf_receipt`.

Each of your server processes checks the receipt by itself, so the visitor's next request passes
at once, whichever process gets it. A receipt does not clear a later requirement, and it does not
switch the counting off.

Logging in or out, or a change of network, does not ask again for something already cleared.

## The background sync

Once at start and then every 5 seconds (`syncEveryMs`), the library sends one request to the
service. It carries what was counted since the last one and brings back the decisions. So a
decision reaches all your server processes within about two syncs of being made. Until then a few
more pages are served.

### What is sent

- Per session or account: how many pages were served and how many requests were refused.
- Per network address: how many pages, and how many new sessions.
- Your configured `siteOrigin` and [policy](policy.md).
- While you run a page test: which of its steps this server saw.

No addresses of pages, no headers and no bodies are sent. An account id from `accountId` is
scrambled with your secret first. The request is signed with your secret.

### What it costs your server

- **Memory.** At most 5000 visitors and 5000 addresses waiting to be reported, and at most 5000
  decisions. What does not fit is not reported, and is counted as dropped.
- **Retries.** A report that gets no answer is sent again, three times in all, then given up.
- **Shutdown.** The timer never keeps your server running when it would otherwise stop. A restart
  loses what was not sent yet, which only means that slightly too few pages are counted.

## When the service cannot be reached

Decisions go stale 30 seconds (`freshForMs`) after the last successful sync. From then on everyone
is let through, also visitors who were being refused. When the service is back, open requirements
apply again.

A process that has just started is in the same state until its first sync, which usually takes
less than a second.

## Several server processes

Every process reports its own counts, and enforces from its own copy of the decisions. Give every
process the same site key, secret, policy and `siteOrigin`.
[A deployment](hosted.md) has more on this.

## Cookies

The library and the page script set these cookies on your site:

| Cookie | What it is | Lasts |
|---|---|---|
| `mcf_id` | The visitor's session: a random id, signed with your secret. Not readable by page code. | 30 days |
| `mcf_receipt` | Proof of a cleared captcha. | 2 hours by default |
| `mcf_setup` | Your own page test. Only set in the browser that runs one. | Until the test ends |

## Health

The function that `mcf(...)` returns has a `health()` method for your own monitoring:

```js
const check = mcf({ ... });
check.health();
```

| Field | Meaning |
|---|---|
| `fresh` | `false` means nobody is being refused: no sync yet, or the last one is too old. |
| `lastSyncAt` | When the service last answered a sync, in milliseconds. 0 before the first. |
| `lastAppliedAt` | When decisions were last taken over from an answer. |
| `decisions` | How many decisions this process holds. |
| `truncated` | `true` when more visitors must verify than the cache holds, so some are not asked. |
| `dropped` | Activity that was thrown away because a buffer was full. |
| `uncertainBatches` | Reports that were given up without an answer. Their counts may or may not have arrived. |
| `policyVersion`, `activePolicyVersion`, `policyStatus` | See [Protection policy](policy.md#seeing-which-policy-is-in-force). |

The dashboard shows whether a server is syncing and the result of your page test. It does not
show these numbers.

## Limits to know about

- Enforcement lags by a few seconds. It does not cap the exact number of pages served.
- The clocks of your servers and of the service should agree within a few seconds.
