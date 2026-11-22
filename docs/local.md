# Running on your own computer

What is particular about `localhost`. The first-run steps themselves are in
[First run with Express](express.md) and [First run with plain Node](node-http.md).

## The origin is `localhost` with its port

```js
siteOrigin: "http://localhost:3000"
```

Use exactly what your browser's address bar shows: the scheme, the host and the port, no path.
`http://localhost:3000` and `http://127.0.0.1:3000` are two different origins to a browser. Pick the one
you open your app with, and open it that way.

If `siteOrigin` and the address bar differ, the captcha cannot hand its result to your page: you solve
it and nothing happens. The page test catches this.

## The page test works on localhost

The MCF service cannot reach your computer, and it does not try. When you press **Start page test**,
the dashboard opens your app in a new tab of your own browser, and everything the service needs to
know comes back through that browser and through your server's sync. So a test on `localhost` is the
same test as on a public website.

It has to be the browser you are signed in to the dashboard with, on the computer the app runs on.

## Your server must reach the service

Your **browser** loads the page script from `serviceUrl`. Your **server** syncs with the service in the
background. Usually that is the same address. When it is not, name the server's one separately:

```js
serviceUrl: "http://localhost:4000",             // as your browser reaches the service
reportUrl: "http://host.docker.internal:4000"    // as your server reaches it
```

This is needed when your app runs in a Docker container and the service runs on your computer: inside
the container, `localhost` is the container itself.

## Before the first sync, and when the sync stops

The library never makes a visitor wait for the service, and never refuses on old information:

- A server that has just started lets every request through until its first sync has finished. That
  takes a moment, not minutes.
- A server whose last sync is more than 30 seconds old (`freshForMs`) lets every request through until
  the next one succeeds.

While developing you restart your server often, so you meet the first state often. The dashboard's
"Server connected" line and the time of the last sync tell you which state you are in. A page test in
either state serves your page without a captcha, and the dashboard says so.

## Cookies on plain HTTP

On `http://localhost` the library's cookies are set without `Secure`, which is right. Do not set
`secureCookies: true` locally: the browser would drop the cookies and every request would look like a
new visitor.

## Two apps on localhost

A browser keeps cookies per host name, not per port. Two apps on `localhost:3000` and `localhost:3001`
that use the same site key share their visitor cookies. That is harmless, and each app only takes part
in a page test that was started for its own `siteOrigin`.
