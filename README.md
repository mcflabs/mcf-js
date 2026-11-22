# make-captcha-fun-js

The JavaScript server library for Make Captcha Fun.

Make Captcha Fun stops automated readers from collecting a whole website. This library runs on
your own server. It counts what each visitor reads and reports the counts to the service in the
background. The service decides when a visitor must verify by playing a short game, and this
library enforces that from a copy it keeps in memory.

- It works with Express and with plain Node `http`.
- It has no dependencies. It uses only Node's built-in `crypto`, `net` and `fetch`.
- It never calls the service while handling a request. A request costs a signature check and a
  few lookups in memory.
- It needs no database. It keeps a report buffer and a decision cache, both with a fixed largest
  size.
- When the service cannot be reached, it lets everyone through.
- It is for long-lived Node.js processes. Serverless and edge runtimes are not supported.

## Documentation

The documentation is in [docs/](docs/README.md).

| Page | For |
|---|---|
| [First run with Express](docs/express.md) | from a new site to a passed page test |
| [First run with plain Node](docs/node-http.md) | the same, without a framework |
| [Checking that it works](docs/page-test.md) | the two results in the dashboard, and the page test |
| [Options](docs/options.md) | every option, covered requests, the visitor's address, accounts |
| [Protection policy](docs/policy.md) | the thresholds, and how to change them |
| [The page script](docs/page-script.md) | `mcf.fetch`, `mcf.verify`, and what the script reports |
| [On your own computer](docs/local.md) | `localhost` and Docker |
| [A deployment](docs/hosted.md) | public origin, proxy, several server processes |
| [When it does not work](docs/troubleshooting.md) | finding the step that is stuck |
| [How it works](docs/how-it-works.md) | each request, the background sync, cookies, health, limits |

## Quick start

You need Node.js 24 or newer, and a site in your Make Captcha Fun dashboard. The site's page there
shows these same steps with your site key filled in.

1. Put this folder in your project, for example as `mcf-js` next to your server file. The library
   has no dependencies, so there is nothing to install.

2. Give your server the site's private secret through its environment:

   ```
   MCF_SECRET=secret_...
   ```

3. Add the middleware before the routes it should protect. `siteOrigin` is the address in your
   browser's address bar when you open your app: with its port, without a path.

   ```js
   const mcf = require("./mcf-js");

   app.use(mcf({
     siteKey: "site_...",
     secret: process.env.MCF_SECRET,
     serviceUrl: "https://app.makecaptchafun.com",
     siteOrigin: "http://localhost:3000"
   }));
   ```

   Without Express, `mcf(options)` returns a function `(req, res, next)` that you call first in
   your own request handler. See [First run with plain Node](docs/node-http.md).

4. Add the page script to your shared page layout, so every page has it:

   ```html
   <script src="https://app.makecaptchafun.com/mcf.js" data-site="site_..."></script>
   ```

5. Start your server and open your site's page in the dashboard. Under **Check that it works**,
   **Server connected** shows within a few seconds, and **Start page test** takes your own browser
   through a refused page, the captcha and back.

No protection settings are needed for a first run. The default thresholds apply.

## Files

| File | What it does |
|---|---|
| `index.js` | the middleware: identifies the visitor, lets a request through or refuses it |
| `lib/policy.js` | checks and fills in the protection policy |
| `lib/identity.js` | the identity cookie, the receipt cookie, the account key |
| `lib/decisions.js` | the copy of the service's decisions |
| `lib/activity.js` | what was counted and not reported yet |
| `lib/sync.js` | the background call to the service |
| `lib/answers.js` | the refusal and the status answer |
| `lib/setup.js` | the owner's page test: its links, its cookie, its error page |
| `lib/origin.js` | checks `siteOrigin` |
| `lib/ip.js` | network addresses and their groups |
| `lib/signing.js` | signatures and signed tokens |
| `docs/` | the documentation |
