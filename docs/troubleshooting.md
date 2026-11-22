# When it does not work

The dashboard shows two results on your site's page. Find the one that is stuck.

## "Server connected" does not show

Your server has never completed a sync with the service.

| Check | How |
|---|---|
| The server started | `mcf(options)` throws at start when `siteKey`, `secret`, `serviceUrl` or `siteOrigin` is missing or wrong. Read the first lines of your server's output |
| The secret arrived | `process.env.MCF_SECRET` must be set in the process that runs your server, not only in your shell's other window |
| The key and secret are this site's | A sync signed with another site's secret is refused. Compare with the site's page; after "Regenerate API key" every server needs the new secret |
| The server can reach the service | From the server's own machine or container, `serviceUrl` (or `reportUrl`, if set) must answer. In Docker, `localhost` is the container; see [On your own computer](local.md) |
| The library was started | The sync starts when `mcf(...)` is called, even without any visitor. If your code never calls it, nothing syncs |

`check.health()` in your own code tells the same story from the server's side: `lastSyncAt` is 0 until
a sync got through.

## "Server connected before, but not syncing now"

The first sync is on record, but no server has synced in the last minute. The time of the last sync is
shown, so an old connection is not taken for a working one. Your server is stopped, cannot reach the
service any more, or uses a secret that was regenerated since.

## A server that syncs but refuses nobody

There are two states in which a server lets every request through. Both are on purpose: your visitors
are never locked out because of a problem on our side.

- **Before the first sync.** A process that has just started has no decisions yet. This ends when its
  first sync has finished, usually within a second.
- **Stale.** The last sync is more than 30 seconds old (`freshForMs`). This lasts until a sync succeeds.

`check.health().fresh` is `false` in both. If you restart your server and at once open a page, you are
in the first state.

## The page test

After **Start page test**, the dashboard lists the steps for this run. The one it waits at tells you where to look.

**The tab does not open.** Your browser blocked it. Use the "Open the test page" link under the steps.
It works for 2 minutes.

**The tab shows "The page test could not start".** The text says why:

- *The link was not made for this server.* The server at that address is configured with another site
  key or secret than the site you started the test from.
- *Started for one address, configured with another.* `siteOrigin` on the server that answered is not
  the address the test was started for. This happens when a proxy sends you to a different deployment.
- *Already opened in another browser.* A test belongs to the first browser that opens its link. Start
  a new one.
- *Run out of time.* The link waits 2 minutes to be opened; the whole test has 10 minutes.

**Stays at "Test page opened".** Your page loaded as usual, without a captcha.

- The dashboard says the server's decisions were not fresh: you are in one of the two states above.
  Wait for "Server connected" to show a recent sync, then reload the page in the test tab.
- Otherwise the request never met the library, or the library was told to leave it alone. Check that
  `app.use(mcf(...))` comes before the route of that page, that it is mounted at the top level, and that
  your `protect` function returns `true` for that page. Then reload the page in the test tab.
- The test asks for a page the browser opens (a `GET` that accepts HTML). An address that answers JSON
  to your app's own code is not one; give the test a page.

**Stays at "Protected page refused".** The refusal page is shown, but no captcha, or solving it changes
nothing.

- *"The check could not be loaded".* Your browser could not load the script from `serviceUrl`. That
  option must be the service's address as a browser reaches it.
- *The captcha is solved and nothing happens.* `siteOrigin` is not the address in your browser's
  address bar (`localhost` and `127.0.0.1` differ, and so do two ports). The result is only handed to
  the configured origin.

**Stays at "Challenge completed".** The page was asked for again but did not answer with a success. A
redirect, an empty response or an error does not count as returning the selected HTML page. Also allow a few seconds:
this step is reported with your server's next sync.

**Stays at "Page loaded again".** Check the shared layout of that page. It must load the MCF script from your service, with your public site key. A script on the challenge page alone is insufficient.

**"Page test passed", but on another address.** The result names the origin it passed on. A pass on
`http://localhost:3000` says nothing about your deployment; run the test there too.

## What a page test does not touch

It gives one browser, yours, one requirement of its own for at most 10 minutes. No other visitor is
asked anything because of it, and no threshold changes. If your browser really has to verify (you
clicked through many pages while testing), that is asked first, with its own captcha, and the test's
captcha comes after it. Solving the test's captcha resets no count.
