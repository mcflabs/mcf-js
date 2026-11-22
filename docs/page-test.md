# Checking that it works

Your site's page in the dashboard has a section **Check that it works**. It shows two results, and
keeps them apart because one does not prove the other.

## Server connected

This is about the background sync. It shows once your server has synced with the service, with the
time of the last sync. It appears within a few seconds of your server starting.

A server that synced last week is shown as not syncing now, so an old connection is not taken for
a working one.

## Page test passed

This is about a browser. It shows once your own browser was refused a protected page, cleared the
captcha, received the same page, and ran the page script in its layout.

To run it, choose your app's address, give a page the library covers, and press **Start page
test**. A new tab opens on your app. That one browser is refused the page, shows the captcha, and
gets the page back.

The result names the origin it passed on. A pass on `http://localhost:3000` says nothing about
your deployment, so run the test there too.

## What the test does

- **Only your browser asks your app.** The dashboard opens `/_mcf/setup` on your app in a new tab,
  and the library answers that address itself. The service never sends a request to your app,
  which is why the test also works on `localhost`.
- **It belongs to one browser.** The first browser that opens the link owns the test, for at most
  10 minutes. The link is of no use in a second browser, and of no use at all after 2 minutes
  unopened.
- **It is one requirement for you alone.** It is carried in a signed cookie (`mcf_setup`) in your
  browser. No other visitor can meet it, and no threshold changes.
- **It works across server processes.** Its state travels in cookies, so each step can be answered
  by a different process.
- **It is enforced like a real requirement.** That also means: only while the server's decisions
  are fresh. A server that has not synced refuses nobody, and the test does not claim otherwise.
- **It is separate from real requirements.** If your browser really has to verify, that is asked
  first, with its own captcha. Clearing the test's captcha resets no count and ends no real
  requirement.

To run it again, start it again. The newest test replaces the one before it.

If a result does not show, see [When it does not work](troubleshooting.md).
