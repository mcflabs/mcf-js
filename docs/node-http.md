# First run with plain Node

From a new site in the dashboard to "Page test passed", on your own computer, without a framework.
It takes a few minutes.

You need Node.js 24 or newer. Your site's page in the dashboard shows the snippets below with your own
site key and service address filled in; choose "Plain Node" there and copy them.

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

## 3. Put the check in front of your request handling

`mcf(options)` returns a function `(req, res, next)`. Call it first, and do your own work in `next`:

```js
const http = require("http");
const mcf = require("./mcf-js");

const check = mcf({
  siteKey: "site_...",
  secret: process.env.MCF_SECRET,
  serviceUrl: "https://app.makecaptchafun.com",
  siteOrigin: "http://localhost:3000"
});

http.createServer(function (req, res) {
  check(req, res, function () {
    // Your own request handling goes here. Everything in here is protected.
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(page("Hello"));
  });
}).listen(3000);
```

- What you answer **without** calling `check` is not protected. Answer a health check that way.
- When a visitor must verify, `check` answers the request itself and `next` is not called.
- `siteOrigin` is what your browser's address bar shows for your app: `http://localhost:3000`, with the
  port, without a path.
- Set a `Content-Type` on your answers. Only `text/html` and `application/json` answers with a status
  from 200 to 299 are counted as content.
- `mcf(...)` throws at start when an option is missing or wrong, so a mistake shows at once.

## 4. Add the page script to your layout

The same line on every page. If your pages share one function or template for their frame, it is one
place:

```js
function page(content) {
  return "<!doctype html><html><body>" + content +
    '<script src="https://app.makecaptchafun.com/mcf.js" data-site="site_..."></script>' +
    "</body></html>";
}
```

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
