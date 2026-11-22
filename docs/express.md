# First run with Express

From a new site in the dashboard to "Page test passed", on your own computer. It takes a few minutes.

You need Node.js 24 or newer and an Express app. Your site's page in the dashboard shows the snippets
below with your own site key and service address filled in; copy them from there.

## 1. Add the library to your project

Put the library's folder in your project, for example as `mcf-js` next to your server file:

```
your-app/
  server.js
  mcf-js/
    index.js
    lib/
```

The library has no dependencies, so there is nothing to install. Your code loads it by its path.

## 2. Give your server the secret

The secret is on your site's page in the dashboard. Put it in the environment your server starts with,
not in your code:

```
MCF_SECRET=secret_... node server.js
```

## 3. Add the middleware before your routes

```js
const express = require("express");
const mcf = require("./mcf-js");

const app = express();

// Before the routes it should protect.
app.use(mcf({
  siteKey: "site_...",
  secret: process.env.MCF_SECRET,
  serviceUrl: "https://app.makecaptchafun.com",
  siteOrigin: "http://localhost:3000"
}));

app.get("/", function (req, res) {
  res.send(page("Hello"));
});

app.listen(3000);
```

- Routes that come **before** `app.use(mcf(...))` are not protected. Put a health check there.
- Mount it at the top level, not under a path (`app.use("/shop", mcf(...))`): the library answers
  `/_mcf/status` and `/_mcf/setup` at the root of your site.
- `siteOrigin` is what your browser's address bar shows for your app: `http://localhost:3000`, with the
  port, without a path.
- `mcf(...)` throws at start when an option is missing or wrong, so a mistake shows at once.

## 4. Add the page script to your layout

The same line on every page. In a shared layout it is one place:

```js
function page(content) {
  return "<!doctype html><html><body>" + content +
    '<script src="https://app.makecaptchafun.com/mcf.js" data-site="site_..."></script>' +
    "</body></html>";
}
```

With a template engine, put the `<script>` line into the layout template instead.

## 5. Check that it works

Start your server, then open your site's page in the dashboard.

1. **Server connected** appears within a few seconds.
2. Choose your app's address, press **Start page test**, and follow the new tab: your page is refused,
   you clear the game, and your page loads. The dashboard then shows **Page test passed**.

If either does not happen, see [When it does not work](troubleshooting.md).

## Next

- Protection starts with the default thresholds. To change them, see
  [Protection policy](policy.md).
- If your visitors log in, pass `accountId` so pages are counted per account. That and the other
  choices are in [Options](options.md).
- If your pages load data in the background, see [The page script](page-script.md).
- Before you deploy, read [A deployment](hosted.md).
