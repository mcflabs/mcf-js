# A deployment

What changes when your app leaves your computer: its origin, the proxy in front of it, and the number
of server processes.

> This setup has not been through a hosted smoke test yet. Run the page test on your deployment,
> through its public address, before you rely on it.

## What this library supports

Long-running Node.js 24 server processes, behind a load balancer or reverse proxy if you like.

Not supported:

- **Serverless and edge functions.** The library keeps its decisions and its counts in the memory of a
  process that stays alive, and syncs on a timer. Short-lived instances would each start with nothing.
  Sharing decisions between them needs a different design.
- **Pages answered entirely from a CDN or shared cache.** The library only sees requests that reach
  your server. A page the cache answers by itself is neither counted nor refused. Either let the
  requests you want covered reach your server, or accept that cached pages are outside its coverage.

## The origin is the public address

```js
siteOrigin: "https://www.example.com"
```

Use the address your visitors' browsers show, not the address your server listens on behind the proxy.
Each deployment has its own: a staging site on `https://staging.example.com` sets that. The page test
is run per origin, and the dashboard says on which origin it last passed, so a test that passed on
`localhost` is not taken for one of the live site.

## Behind a proxy

Behind a proxy or load balancer, three things are different from what your server sees by itself.

**The visitor's address.** The connection comes from the proxy, so every visitor seems to have the
proxy's address. The rule about new sessions per address would then ask new visitors to verify. Give the
library the real address, taken from what **your own** proxy wrote.

With Express, say how many proxies you run and use `req.ip`:

```js
// The number of proxies between the internet and this app that you control.
app.set("trust proxy", 1);

app.use(mcf({
  siteKey: "site_...",
  secret: process.env.MCF_SECRET,
  serviceUrl: "https://app.makecaptchafun.com",
  siteOrigin: "https://www.example.com",
  clientIp: function (req) { return req.ip; },
  secureCookies: true
}));
```

With plain Node, read the header yourself. A proxy adds the address it saw to the **end** of
`X-Forwarded-For`; what stands before it came from outside and can be made up:

```js
// For exactly one proxy of your own in front of this server.
function clientIp(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",");
  return forwarded[forwarded.length - 1].trim() || req.socket.remoteAddress;
}
```

With two proxies of your own, take the second from the end, and so on. Whichever way you read it, it
is only right if your server cannot be reached around the proxy: a visitor who can connect to it
directly can write any header. Do not use `true` for Express's `trust proxy`; it believes the first
address in the header, which the visitor chooses.

**HTTPS.** When HTTPS ends at the proxy, your server sees plain HTTP and would set its cookies without
`Secure`. Set `secureCookies: true`.

**The way to the service.** `serviceUrl` is the service's address as browsers reach it. If your server
must use another one (a private network name, for example), set `reportUrl` to that.

## Several server processes

Every process reports its own counts, and a decision holds for the whole site. Each process refuses
from its own copy of the decisions, refreshed every few seconds. So a decision reaches every process
within about two syncs, and a solved captcha is accepted by every process at once.

Give every process the same `siteKey`, `secret`, `policy` (with the same `version`) and `siteOrigin`.

The page test needs nothing extra here. Its state travels in signed cookies, so its steps can be
answered by different processes.

Two states are worth knowing for a rollout, because in both a process refuses nobody:

- **Before its first sync.** A process that has just started lets every request through until its
  first sync has finished.
- **Stale.** A process whose last sync is more than 30 seconds old (`freshForMs`) lets every request
  through until a sync succeeds again.

Expose `health()` in your own monitoring to see them (`fresh`, `lastSyncAt`). The dashboard shows how
many processes synced in the last minute and when the last sync was.

## Checklist

1. `siteOrigin` is the public address, and each process has the same one.
2. `clientIp` returns the visitor's address from your proxy, and the server cannot be reached around it.
3. `secureCookies: true` when HTTPS ends at the proxy.
4. The secret comes from the environment or a secret store.
5. Health checks and other machine addresses are left out of `protect`, or answered before the library.
6. The dashboard shows **Server connected**, with as many servers as you run.
7. **Page test passed** for the public origin.
