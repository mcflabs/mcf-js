# Options

`mcf(options)` returns one function, `(req, res, next)`. Express uses it as middleware; with plain
Node you call it yourself. Four options are required:

```js
const mcf = require("./mcf-js");

const check = mcf({
  siteKey: "site_...",
  secret: process.env.MCF_SECRET,
  serviceUrl: "https://app.makecaptchafun.com",
  siteOrigin: "https://www.example.com"
});
```

`mcf(options)` throws when a required option is missing or wrong, so a mistake shows when your
server starts and not when a visitor arrives.

## All options

| Option | What it is |
|---|---|
| `siteKey` | Your site's public key. It starts with `site_`. Required. |
| `secret` | Your site's private secret. It starts with `secret_`. Keep it on the server. Required. |
| `serviceUrl` | The address of the service as your visitors' browsers reach it, without a slash at the end. Required. |
| `siteOrigin` | Your website's origin, such as `https://www.example.com`. No path, query or wildcard. Required. See [below](#the-site-origin). |
| `reportUrl` | The address your server uses to reach the service, when that is not `serviceUrl`. See [On your own computer](local.md). |
| `protect(req)` | Returns `true` for a request the library should look at. Default: the method is `GET` or `HEAD`. |
| `countResponse(req, res)` | Returns `true` for an answer that counts as content. Default: not `HEAD`, a status from 200 to 299, and a `Content-Type` that starts with `text/html` or `application/json`. |
| `accountId(req)` | Returns your own id of the logged-in account as a text, or nothing. |
| `clientIp(req)` | Returns the visitor's network address. Default: `req.socket.remoteAddress`. |
| `secureCookies` | `true` to always mark the library's cookies `Secure`. Default: only when the connection itself is HTTPS. |
| `policy` | The thresholds. See [Protection policy](policy.md). |
| `syncEveryMs` | How often the library syncs with the service. Default 5000. |
| `freshForMs` | How long decisions are used without hearing from the service. Default 30000. |

With the default `countResponse`, stylesheets, images, redirects, errors and `304 Not Modified` do
not count as content.

Choose `freshForMs` longer than `syncEveryMs`, with room for a slow network and a retry. A longer
sync interval means less traffic and slower decisions. A longer freshness time means the library
keeps refusing for longer when the service cannot be reached.

## Which requests are covered

By default only `GET` and `HEAD`. Every other request passes untouched: it is not counted and
never refused, so the library does not get in the way of an order or a payment by surprise.

A covered form page does not cover the `POST` it submits to. To cover a form post, or a `POST`
that reads content, name it in `protect`:

```js
protect: function (req) {
  if (req.method === "POST") return req.path === "/search";
  return req.method === "GET" || req.method === "HEAD";
}
```

`req.path` is Express's. With plain Node, compare `req.url` instead.

Leave out the addresses that machines call: webhooks, health checks, an API for your mobile app.
Their callers keep no cookies, so every call would look like a new visitor.

## Where the library sits

The library only sees requests that reach it.

- With Express, routes that come before `app.use(mcf(...))` are not covered.
- Mount it at the top level, not under a path. It answers `/_mcf/status` and `/_mcf/setup` at the
  root of your site.
- Pages answered from a CDN or shared cache in front of your server are neither counted nor
  refused.
- An answer that sets the library's cookie will usually not be stored by a shared cache, which can
  lower the cache's hit rate for first-time visitors.

## The visitor's address

Behind a proxy or CDN, the socket's address is the proxy's. Give the library the visitor's real
address, from a header that only your own proxy can set:

```js
app.set("trust proxy", 1);
app.use(mcf({ ..., clientIp: function (req) { return req.ip; } }));
```

If you do not, every visitor seems to come from one address, and the rule about new sessions per
address will ask new visitors to verify. [A deployment](hosted.md) has the whole setup behind a
proxy, also for plain Node.

## Accounts

If your visitors log in, return your own account id from `accountId`. Pages are then counted for
the account, also across browsers and thrown-away cookies.

```js
accountId: function (req) {
  return req.user ? String(req.user.id) : null;
}
```

The id never leaves your server: the service gets a scrambled form of it. It must come from your
own checked login, so either add the library after your login check, or read your login cookie
inside `accountId`.

## The site origin

`siteOrigin` is the address in the browser's address bar when someone opens your app: the scheme,
the host and the port, without a path. On your own computer that is `http://localhost:3000` (with
the port your app listens on). For a deployment it is the public address.

It is set in your server's code, not in the dashboard, for a reason. A solved captcha's result is
handed only to this origin, never to a destination taken from a request header or a return address
a browser supplies.

- A trailing slash and a default port are tidied away. An invalid or missing value stops your
  server at start.
- Server processes behind the same public website use the same origin.
- Deployments on different origins, such as a staging site, each set their own. They can share one
  site key.
- If `siteOrigin` and the address bar differ, a solved captcha does nothing. The
  [page test](page-test.md) catches this.

## Keep the secret on the server

The secret signs the library's cookies and its sync. Anyone who has it can make sessions that this
library accepts.

- Never put the secret in a page, in browser JavaScript, or in a mobile app.
- Do not commit it to your repository. Read it from an environment variable or a secret store.
- The site key is public. It is fine for it to appear in your pages.
- If the secret leaks, regenerate it on your site's page in the dashboard and give every server
  the new one.
