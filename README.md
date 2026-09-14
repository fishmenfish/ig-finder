# Instagram Non-Followers Finder 2.1.1

![Visitor Counter](https://anime-counter.lulushu.workers.dev/@fishmenfish?theme=flat&color=58A6FF&bg=0D1117&animation=pulse)

A Tampermonkey userscript for finding Instagram accounts that do not follow you back. It includes search, filters, a whitelist, saved results per account, CSV export, and controlled unfollow actions.

## Authorship and project continuity

I am the original author of this script on [Greasy Fork](https://greasyfork.org/en/scripts/537246-instagram-non-followers-finder). This repository moved to a new GitHub account because I lost authentication access to the old account and can no longer sign in. The new repository keeps development and updates active.

## Installation

1. Install [Tampermonkey](https://www.tampermonkey.net/).
2. Open `ig-finder.user.js`.
3. Copy the full file into a new Tampermonkey script.
4. Save the script and reload Instagram.

The panel should show **FINDER v2.1.1**. Start with a limit of 10 accounts to verify the connection.

## Usage

1. Open the **Non-followers** panel on Instagram.
2. Set the number of accounts to check.
3. Click **Start scan**.
4. Review the results.
5. Select accounts before using **Unfollow selected**.

The script supports pause, resume, stop, search by username or name, verified-account filters, A-Z/Z-A sorting, a whitelist, saved results, and CSV export. The whitelist accepts usernames with or without `@`, separated by commas, spaces, or new lines.

The scan limit is the number of following accounts checked, not the number of non-followers found. Results are shown 50 accounts per page. Closing the panel does not stop an active scan or unfollow queue.

## Scan behavior

The script reads following accounts from `/api/v1/friendships/{account}/following/` and continues pagination with `next_max_id` as the `max_id` parameter.

When a page does not include follow-back status, the script checks `/api/v1/friendships/show/{id}/`. `followed_by` means the account follows you. `following` means you follow the account. Missing status is treated as unknown, so the account is excluded from unfollow actions and the scan is marked partial.

An empty first page is verified through `/api/v1/users/{account}/info/`. An empty result is accepted only when the profile ID matches and `following_count` is zero. Positive counts, mismatched identity, incomplete data, empty continuation pages, and repeated cursors fail safely without replacing the previous saved scan.

## Transport and diagnostics

GET requests use `GM_xmlhttpRequest` when available and are restricted to `www.instagram.com`. Managers without that API use `fetch`. The `@sandbox DOM` declaration allows the script to run in the extension context. Unfollow requests use the page session and are not automatically retried.

A 25-second timeout releases a stuck request. HTTP errors, rate limits, challenges, and account changes stop the scan. When a scan fails, the details panel shows the stage, transport, request count, HTTP status, and a safe response summary. Cookies, tokens, and account response bodies are never logged.

## Repository files

- `ig-finder.user.js` — installable userscript.
- `README.md` — project guide.
- `LICENSE` — MIT License.
- `.gitignore` — ignores local files.

The repository intentionally publishes only the installable `.user.js` file. Development sources, private backups, and local test files are not included.

## References and limitations

References checked on September 14, 2026:

- [instagrapi user/friendships](https://github.com/subzeroid/instagrapi/blob/master/instagrapi/mixins/user.py) for REST following, pagination, relationship checks, and profile info patterns.
- [Instagram Follower Checker](https://github.com/HenryLok0/Instagram_Follower_Checker) for using Instagram web REST endpoints.
- [Tampermonkey request](https://www.tampermonkey.net/documentation.php?locale=en&q=GM_xmlhttpRequest) and [sandbox](https://www.tampermonkey.net/documentation.php?locale=en&q=sandbox).

These endpoints are not a stable public API. Other implementations do not guarantee access for every account or browser. Delays do not guarantee protection from Instagram restrictions. Results are a snapshot of the accounts checked.

## License

MIT License. See [LICENSE](LICENSE).
