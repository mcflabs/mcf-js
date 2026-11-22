# The page script

One line in your shared page layout, so that every page has it:

```html
<script src="https://app.makecaptchafun.com/mcf.js" data-site="site_..."></script>
```

`data-site` is your public site key. Your site's page in the dashboard shows the line with your
key filled in.

The script decides nothing. Your own server says whether this visitor must verify; the script
shows the captcha and helps the page carry on afterwards.

## What it does by itself

- **It asks your server whether this visitor must verify**, when a page opens and about every 10
  seconds while the page is visible. The question goes to `/_mcf/status` on your own site, which
  the library answers from memory.
- **It lays the captcha over the page** when the answer is yes. The visitor stays where they are
  and keeps what they typed. After the game the captcha goes away and the page carries on.
- **It finishes a refused page.** A visitor who opens a page while they must verify gets a small
  page from the library instead. The script on that page shows the captcha and then loads the page
  they asked for.

## Background requests

A page that loads data in the background can be refused too. A refusal is always recognisable: it
has status 403 and the header `MCF-Verification: required`. A request that did not ask for HTML
gets this body:

```json
{"error":"mcf_verification_required"}
```

The script puts two helpers on `window.mcf` for this.

### `mcf.fetch(input, init)`

It works like `fetch`. When a read (`GET` or `HEAD`) is refused, it shows the captcha, waits for
the visitor, and sends the read again. You get the second answer.

```js
const response = await mcf.fetch("/api/articles?page=2");
const articles = await response.json();
```

A refused write is never sent again by the script, because only your page knows whether that is
safe. You get the 403 and decide.

### `mcf.verify()`

It returns a promise. If the visitor must verify, it shows the captcha and resolves with `true`
once they are through. If they do not have to, it resolves with `true` at once. It resolves with
`false` when your server could not be asked.

```js
const response = await fetch("/api/save", { method: "POST", body: form });
if (response.status === 403 && response.headers.get("MCF-Verification") === "required") {
  if (await mcf.verify()) {
    // Send it again, if that is safe for this request.
  }
}
```

## What is handled

| Pattern | Handled |
|---|---|
| Opening a page | Yes. |
| A requirement that arrives while a page is open | Yes. The captcha is laid over the page within about 10 seconds, and what was typed stays. |
| A background read through `mcf.fetch` | Yes. |
| A background request through your own `fetch` or `XMLHttpRequest` | No. You get the 403. Use `mcf.fetch`, or call `mcf.verify()` and send it again. |
| A covered form `POST` that is refused | Partly. The visitor verifies, is sent back to the form, and submits again. |

## What it reports

When [`behaviourCollection`](policy.md) is on, which is the default, the script reports how the
page is used: pointer movement, clicks, key presses and changes to fields, with their timing, and
the path of the page.

It never sends which letters are typed or what a field holds.

With `behaviourCollection: false` the script reports nothing. It still shows the captcha.

## If the script cannot load

Then no captcha can be shown. A visitor who must verify sees the library's small page with the
line "The check could not be loaded" and a link to try again. Visitors who do not have to verify
notice nothing.

If your site sends a Content-Security-Policy header, allow the service's address for scripts
(`script-src`), for frames (`frame-src`) and for background requests (`connect-src`).
