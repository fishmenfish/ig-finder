# Instagram Non-Followers Finder 2.1.1

A single-file Tampermonkey userscript for finding Instagram accounts that do not follow you back. It includes search, filters, a whitelist, account-specific saved results, CSV export, and controlled unfollow actions.

## Authorship and project continuity

I am the original author of this script on [Greasy Fork](https://greasyfork.org/en/scripts/537246-instagram-non-followers-finder). This repository was moved to a new GitHub account because I lost authentication access to the old account and can no longer sign in. The new repository keeps development and updates active.

## Installation

Replace the contents of your Tampermonkey script with `ig-finder.user.js`, save it, disable older copies, and reload Instagram. The panel should show **FINDER v2.1.1**. Start with a limit of 10 accounts to verify the connection.

`ig-finder.user.js` is the installable userscript. The old auto-update URL was removed so local builds are not overwritten by a remote version.

## Scan behavior

The script uses `/api/v1/friendships/{account}/following/` and continues pagination with `next_max_id` as the `max_id` parameter.

When a page does not include a follow-back status, the script requests `/api/v1/friendships/show/{id}/`. `followed_by` means that the account follows you, while `following` means that you follow the account. Missing status is treated as unknown: the account is excluded from unfollow actions and the scan is marked partial.

An empty first page is verified through `/api/v1/users/{account}/info/`. An empty result is accepted only when the profile ID matches and `following_count` is actually zero. Positive counts, mismatched identity, incomplete data, empty continuation pages, and repeated cursors fail safely without replacing the previous saved scan.

Per-account relationship checks require additional requests. The configured delay applies before those checks and between pages.

## Features

- The scan limit is the number of following accounts checked, not the number of non-followers found.
- Pause, resume, and stop controls are available for scans and the unfollow queue. Closing the panel does not stop an active job.
- Whitelist usernames with or without `@`, separated by commas, spaces, or new lines.
- Search by username or name, filter verified accounts, sort A-Z or Z-A, and browse 50 accounts per page.
- Unfollow selected accounts only after confirmation. Successful unfollows are removed from the list and saved data.
- CSV export includes all filtered results, scan time, and the partial-scan marker.
- Settings and results are stored per Instagram account. Older saved-result formats can still be loaded.

## Transport and diagnostics

GET requests use `GM_xmlhttpRequest` when available and are restricted to `www.instagram.com`; managers without that API use `fetch`. The `@sandbox DOM` declaration allows the script to run in the extension context. Unfollow requests use the page session and are not automatically retried.

A 25-second timeout releases a stuck request. HTTP errors, rate limits, challenges, and account changes stop the scan. When a scan fails, the details panel shows the stage, transport, request count, HTTP status, and a safe response summary. Cookies, tokens, and account response bodies are never logged.

## References and limitations

References checked on September 14, 2026:

- [instagrapi user/friendships](https://github.com/subzeroid/instagrapi/blob/master/instagrapi/mixins/user.py) for REST following, pagination, relationship checks, and profile info patterns.
- [Instagram Follower Checker](https://github.com/HenryLok0/Instagram_Follower_Checker) for using Instagram web REST endpoints.
- [Tampermonkey request](https://www.tampermonkey.net/documentation.php?locale=en&q=GM_xmlhttpRequest) and [sandbox](https://www.tampermonkey.net/documentation.php?locale=en&q=sandbox).

These endpoints are not a stable public API. Other implementations do not guarantee access for every account or browser. A delay does not guarantee protection from Instagram restrictions, and results are a snapshot of the accounts checked.

## Local tests

The published repository contains the installable userscript only. Local development tests can be run from a private working copy that includes the source and test harness.
