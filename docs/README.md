# Make Captcha Fun for Node.js

`make-captcha-fun-js` is the server library for Make Captcha Fun. It runs inside your own Node.js
server, counts what each visitor reads, and asks only the heavy readers to verify by playing one
short game. Everyone else never sees it.

## How the pieces fit

Three parts work together:

- **The library** runs in your server. It gives each browser a signed cookie, counts the pages your
  server answers, and refuses a visitor who has been asked to verify. It never calls our service
  while it handles a request.
- **The service** is run by us. Every few seconds the library reports its counts to it in the
  background and gets back the list of visitors who must verify.
- **The page script** is one `<script>` line in your page layout. When your server says a visitor
  must verify, it lays the captcha over the page and lets them carry on afterwards.

When the service cannot be reached, the library lets everyone through.

## What you need

- Node.js 24 or newer, in a server process that keeps running. Serverless and edge functions are
  not supported.
- Express, or plain Node `http`. The library has no dependencies of its own.
- A site in your Make Captcha Fun dashboard. It gives you a public site key and a private secret.

## Start here

- [First run with Express](express.md): from a new site to a passed page test, in a few minutes.
- [First run with plain Node](node-http.md): the same, without a framework.
- [Checking that it works](page-test.md): the two results the dashboard shows, and the page test.

## Fit it to your site

- [Options](options.md): every option, and the decisions that are yours: which requests are
  covered, the visitor's address behind a proxy, and logged-in accounts.
- [Protection policy](policy.md): the thresholds, and how to change them safely.
- [The page script](page-script.md): what it handles by itself, and the two helpers for your own
  page code.

## Run it

- [On your own computer](local.md): what is particular about `localhost` and Docker.
- [A deployment](hosted.md): the public origin, a proxy in front, several server processes.
- [When it does not work](troubleshooting.md): find the step that is stuck.

## Understand it

- [How it works](how-it-works.md): what happens on each request, the background sync, what is
  sent to the service, cookies, health numbers and limits.
