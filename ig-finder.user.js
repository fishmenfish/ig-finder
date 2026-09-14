// ==UserScript==
// @name         Instagram Non-Followers Finder
// @namespace    https://faizmuhhh
// @version      2.1.1
// @description  Review non-followers with search, account-specific saved scans, export and controlled unfollow actions.
// @author       faizmuhhh
// @homepageURL  https://openuserjs.org/scripts/fishmanfish/Instagram_Non-Followers_Finder
// @source       https://github.com/fishmenfish/ig-finder
// @supportURL   https://github.com/fishmenfish/ig-finder/issues
// @downloadURL  https://openuserjs.org/install/fishmanfish/Instagram_Non-Followers_Finder.user.js
// @updateURL    https://openuserjs.org/install/fishmanfish/Instagram_Non-Followers_Finder.user.js
// @match        https://www.instagram.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @connect      www.instagram.com
// @sandbox      DOM
// @license      MIT
// @antifeature  membership This script requires an Instagram account.
// @run-at       document-idle
// @noframes
// ==/UserScript==

(() => {
    'use strict';
    if (document.getElementById('ig-finder-root')) return;

    const cookie = name => document.cookie.split(';').map(part => part.trim()).find(part => part.startsWith(`${name}=`))?.slice(name.length + 1) || '';
    const account = cookie('ds_user_id');
    const storageKey = `igNonFollowers_${account}`;
    const settingsKey = `igFinderSettings_${account}`;
    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
    const state = { users: [], selected: new Set(), job: null, paused: false, stop: false, checked: 0, total: 0, unknown: 0, timestamp: null, complete: false, page: 0 };
    const pageSize = 50;
    const diagnostic = { phase: 'Ready', requests: 0, http: '-', response: '-', message: 'No scan requests yet.' };
    let scanOutcome = '';
    let cancelRead = null;
    const errorText = error => typeof error?.message === 'string' && error.message ? error.message : typeof error === 'string' ? error : 'The browser returned an error without a message.';
    let storageFailed = false;
    function read(key, fallback) {
        try { return typeof GM_getValue === 'function' ? GM_getValue(key, fallback) : fallback; }
        catch { storageFailed = true; return fallback; }
    }
    function write(key, value) {
        try {
            if (typeof GM_setValue !== 'function') throw new Error('Storage unavailable');
            GM_setValue(key, value);
        } catch { storageFailed = true; }
    }
    function normalizeUser(user) {
        const id = user?.pk ?? user?.id;
        if (!user || (typeof id === 'number' && !Number.isSafeInteger(id)) || !/^\d+$/.test(String(id)) || !/^[a-zA-Z0-9._]{1,30}$/.test(user.username)) return null;
        return { id: String(id), username: user.username, full_name: typeof user.full_name === 'string' ? user.full_name : '', is_verified: user.is_verified === true };
    }
    function whitelist() {
        return new Set($('whitelist').value.toLowerCase().split(/[\s,]+/).map(value => value.replace(/^@/, '')).filter(Boolean));
    }
    function visibleUsers() {
        const query = $('search').value.trim().toLowerCase().replace(/^@/, '');
        const protectedNames = whitelist();
        const users = state.users.filter(user => !protectedNames.has(user.username.toLowerCase()) &&
            `${user.username} ${user.full_name}`.toLowerCase().includes(query) &&
            ($('filter').value === 'all' || user.is_verified === ($('filter').value === 'verified')));
        if ($('sort').value !== 'default') users.sort((a, b) => a.username.localeCompare(b.username) * ($('sort').value === 'asc' ? 1 : -1));
        return users;
    }
    function assertAccount() {
        if (!account || !/^\d+$/.test(account)) throw new Error('Log in to Instagram, then reload this page.');
        if (cookie('ds_user_id') !== account) throw new Error('Your Instagram account changed. Reload the page before continuing.');
    }

    const host = document.createElement('div');
    host.id = 'ig-finder-root';
    host.style.cssText = 'position:fixed;z-index:2147483647;bottom:0;right:0;';
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `
      <style>
        :host { all: initial; font: 14px/1.5 "Segoe UI", Arial, sans-serif; color: #202820; color-scheme: light; }
        * { box-sizing: border-box; } [hidden] { display: none !important; }
        button, input, select, textarea { font: inherit; } button, a, input, select, textarea, summary { -webkit-tap-highlight-color: transparent; }
        button { border: 1px solid #cdd3c8; border-radius: 9px; padding: 9px 13px; background: #fff; color: #26332b; cursor: pointer; font-weight: 600; }
        button:hover:not(:disabled) { background: #e8ede3; border-color: #889b87; }
        button:disabled { color: #737b72; background: #eef0eb; cursor: not-allowed; }
        :focus-visible { outline: 3px solid #598554; outline-offset: 3px; }
        .primary { background: #244b36; color: #fff; border-color: #244b36; } .primary:hover:not(:disabled) { background: #163b26; }
        .danger { color: #a13227; } .small { font-size: 12px; padding: 6px 9px; }
        #launcher { position: fixed; right: 24px; bottom: 24px; display: flex; align-items: center; gap: 10px; padding: 13px 18px; box-shadow: 0 5px 24px #15241725; }
        .mark { display: inline-grid; place-items: center; width: 26px; height: 26px; border: 1px solid currentColor; border-radius: 8px; font-size: 12px; letter-spacing: -1px; }
        #panel { position: fixed; right: 24px; bottom: 86px; width: 470px; max-width: calc(100vw - 24px); max-height: calc(100dvh - 110px); display: flex; flex-direction: column; background: #fafbf7; border: 1px solid #d5dbce; border-radius: 18px; box-shadow: 0 16px 60px #16271830; overflow: hidden; }
        header { padding: 22px 24px 18px; border-bottom: 1px solid #e0e5da; display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
        .eyebrow { font-size: 10px; font-weight: 700; letter-spacing: 1.6px; color: #4e694e; margin-bottom: 5px; }
        h1 { font-size: 25px; letter-spacing: -.8px; line-height: 1.2; margin: 0 0 6px; font-weight: 650; }
        p { margin: 0; } .muted { color: #596457; font-size: 12px; } #close { font-size: 20px; padding: 1px 9px; background: transparent; }
        header, footer, .scan-status { flex-shrink: 0; }
        .body { padding: 18px 24px; overflow: auto; min-height: 0; overscroll-behavior: contain; }
        .overview { display: flex; align-items: baseline; gap: 10px; margin-bottom: 16px; } #count { font-size: 38px; font-weight: 650; letter-spacing: -1.5px; line-height: 1; }
        details { border-block: 1px solid #e0e5da; margin-bottom: 16px; } summary { cursor: pointer; font-size: 12px; font-weight: 650; padding: 12px 0; }
        .settings { padding-bottom: 14px; display: grid; grid-template-columns: 1fr 1fr; gap: 12px; } label { display: block; font-size: 12px; font-weight: 600; }
        input:not([type=checkbox]), select, textarea { width: 100%; border: 1px solid #cbd3c5; border-radius: 8px; padding: 9px 10px; background: #fff; color: #202820; min-width: 0; }
        label input, label textarea { margin-top: 5px; } textarea { resize: vertical; min-height: 60px; } .wide { grid-column: 1 / -1; }
        .actions, .filters, .list-tools, .pagination { display: flex; gap: 8px; align-items: center; } .actions { margin-bottom: 12px; } #start { flex: 1; }
        progress { width: 100%; height: 5px; display: block; accent-color: #315a37; border: 0; border-radius: 4px; overflow: hidden; background: #e3e8de; }
        progress::-webkit-progress-bar { background: #e3e8de; } progress::-webkit-progress-value { background: #315a37; }
        .scan-status { padding: 12px 24px; background: #eef3e8; border-bottom: 1px solid #d5dbce; max-height: 35dvh; overflow: auto; }
        #status { font-size: 13px; margin: 0; overflow-wrap: anywhere; color: #34472f; } #status[data-error=true] { color: #a13227; font-weight: 600; }
        #diagnostics { margin: 6px 0 0; border: 0; } #diagnostics summary { padding: 4px 0; }
        #diagnosticText { min-height: 115px; font: 11px/1.5 Consolas, monospace; }
        #search { margin-bottom: 8px; } .filters select { flex: 1; font-size: 12px; } .list-tools { justify-content: space-between; margin: 14px 0 6px; }
        .select-label { display: flex; align-items: center; gap: 7px; font-weight: 400; } input[type=checkbox] { width: 16px; height: 16px; accent-color: #244b36; margin: 0; cursor: pointer; }
        #list { border-block: 1px solid #dfe5d9; } .row { display: flex; gap: 11px; align-items: center; padding: 12px 0; border-bottom: 1px solid #e5e9e0; } .row:last-child { border-bottom: 0; }
        .avatar { width: 34px; height: 34px; flex-shrink: 0; border-radius: 50%; background: #e5ebdf; color: #435b3e; display: grid; place-items: center; font-weight: 650; font-size: 12px; }
        .identity { flex: 1; min-width: 0; } .identity a { display: block; font-size: 13px; color: #233c29; font-weight: 650; text-decoration: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .identity a:hover { text-decoration: underline; }
        .identity p { font-size: 11px; color: #616b5e; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
        .empty { padding: 28px 12px; text-align: center; } .empty strong { display: block; margin-bottom: 5px; font-size: 14px; }
        .pagination { justify-content: space-between; padding-top: 10px; font-size: 11px; color: #596457; }
        footer { border-top: 1px solid #dfe5d9; padding: 14px 24px 16px; background: #f0f3ea; } footer .actions { margin-bottom: 8px; } #bulk { flex: 1; }
        #saved { font-size: 11px; color: #596457; } .credit { display: flex; justify-content: space-between; gap: 8px; margin-top: 10px; font-size: 10px; color: #64705e; } .credit a { color: #40593b; }
        @media(max-width:520px) { #panel { right: 12px; bottom: 76px; max-height: calc(100dvh - 88px); } #launcher { right: 12px; bottom: 12px; } header { padding: 18px; } .body { padding: 16px 18px; } footer { padding: 12px 18px; } h1 { font-size: 23px; } }
      </style>
      <button id="launcher" class="primary" aria-expanded="false" aria-controls="panel"><span class="mark" aria-hidden="true">nf</span> Non-followers</button>
      <section id="panel" lang="en" role="region" aria-label="Non-followers finder" hidden>
        <header><div><div class="eyebrow">INSTAGRAM / FINDER v2.1.1</div><h1>Who follows back?</h1><p class="muted">Review your connections. Manage your following.</p></div><button id="close" aria-label="Close panel">×</button></header>
        <div class="scan-status"><p id="status" role="status" aria-live="polite">Ready to check the accounts you follow.</p><details id="diagnostics"><summary>Scan details · v2.1.1</summary><textarea id="diagnosticText" readonly aria-label="Scan diagnostics"></textarea></details></div>
        <div class="body">
          <div class="overview"><span id="count">0</span><span class="muted">accounts not following you back<br><span id="scanned">No scans yet</span></span></div>
          <details><summary>Scan settings & whitelist</summary><div class="settings">
            <label>Accounts to check<input id="limit" type="number" min="1" max="100000" value="100" step="1"></label>
            <label>Request delay (seconds)<input id="delay" type="number" min="2" max="60" value="3" step="1"></label>
            <label>Unfollow delay (seconds)<input id="unfollowDelay" type="number" min="3" max="120" value="5" step="1"></label>
            <p class="muted">Delays do not guarantee protection from Instagram limits.</p>
            <label class="wide">Whitelist<textarea id="whitelist" placeholder="username1, username2"></textarea></label>
            <p class="muted wide">Separate usernames with commas or new lines. These accounts are hidden from results and excluded from unfollow actions.</p>
          </div></details>
          <div class="actions"><button id="start" class="primary">Start scan</button><button id="pause" hidden>Pause</button><button id="stop" class="danger" hidden>Stop</button></div>
          <progress id="progress" value="0" max="1" aria-label="Scan progress"></progress>
          <input id="search" type="search" aria-label="Search username or name" placeholder="Search username or name…">
          <div class="filters"><select id="filter" aria-label="Verification filter"><option value="all">All accounts</option><option value="verified">Verified</option><option value="nonverified">Not verified</option></select><select id="sort" aria-label="Sort order"><option value="default">Scan order</option><option value="asc">Username A–Z</option><option value="desc">Username Z–A</option></select></div>
          <div class="list-tools"><label class="select-label"><input id="selectAll" type="checkbox"> Select this page</label><span id="filtered" class="muted">0 shown</span></div>
          <div id="list"></div>
          <div class="pagination" id="pagination" hidden><button id="prev" class="small">Previous</button><span id="pageInfo"></span><button id="next" class="small">Next</button></div>
        </div>
        <footer><div class="actions"><button id="bulk" class="danger" disabled>Unfollow selected (0)</button><button id="export" disabled>Export CSV</button></div><button id="load" class="small">Load saved results</button><p id="saved"></p><div class="credit"><span>Non-followers finder · v2.1.1</span><a href="https://www.paypal.com/paypalme/muhammadfaiz0817" target="_blank" rel="noopener noreferrer">Support creator ↗</a></div></footer>
      </section>`;
    document.body.appendChild(host);
    const $ = id => root.getElementById(id);
    function updateDiagnostic() {
        $('diagnosticText').value = `IG Finder v2.1.1\nScan transport: ${typeof GM_xmlhttpRequest === 'function' ? 'Tampermonkey XHR' : 'browser fetch'}\nStage: ${diagnostic.phase}\nRequest: ${diagnostic.requests} | HTTP: ${diagnostic.http}\nResponse: ${diagnostic.response}\nChecked: ${state.checked} | Unknown: ${state.unknown}\n${diagnostic.message}`;
    }
    const status = (message, error = false) => {
        const text = message || 'The browser returned an error without a message.';
        $('status').textContent = text; $('status').dataset.error = String(error);
        diagnostic.message = text; updateDiagnostic();
        if (error) $('diagnostics').open = true;
        // Log only our message, never cookies, request URLs with tokens, or response bodies.
        if (error) console.error(`[IG Finder v2.1.1] ${text}`);
    };
    const settings = read(settingsKey, {});
    for (const id of ['limit', 'delay', 'unfollowDelay', 'whitelist']) {
        if (settings && settings[id] != null) $(id).value = String(settings[id]);
        $(id).addEventListener('change', () => {
            write(settingsKey, Object.fromEntries(['limit', 'delay', 'unfollowDelay', 'whitelist'].map(key => [key, $(key).value])));
            state.page = 0; render();
        });
    }
    function save() {
        write(storageKey, { timestamp: state.timestamp, data: state.users, checked: state.checked, total: state.total, unknown: state.unknown, complete: state.complete });
    }
    function render() {
        const users = visibleUsers();
        const protectedNames = whitelist();
        const eligible = new Set(users.map(user => user.id));
        for (const id of state.selected) if (!eligible.has(id)) state.selected.delete(id);
        state.page = Math.max(0, Math.min(state.page, Math.ceil(users.length / pageSize) - 1));
        const page = users.slice(state.page * pageSize, (state.page + 1) * pageSize);
        const busy = Boolean(state.job);
        $('count').textContent = state.users.filter(user => !protectedNames.has(user.username.toLowerCase())).length.toLocaleString();
        $('scanned').textContent = state.timestamp ? `${state.checked.toLocaleString()} checked${scanOutcome ? ` · ${scanOutcome}` : state.complete ? '' : ' · partial results'}${state.unknown ? ` · ${state.unknown} unknown` : ''}` : 'No scans yet';
        $('progress').max = state.total || 1;
        $('progress').value = state.checked;
        $('start').disabled = busy;
        $('load').disabled = busy;
        for (const id of ['limit', 'delay', 'unfollowDelay', 'whitelist']) $(id).disabled = busy;
        $('pause').hidden = !busy;
        $('pause').textContent = state.paused ? 'Resume' : 'Pause';
        $('pause').disabled = state.stop;
        $('stop').hidden = !busy;
        $('stop').disabled = state.stop;
        $('export').disabled = users.length === 0;
        $('bulk').disabled = busy || state.selected.size === 0;
        $('bulk').textContent = `Unfollow selected (${state.selected.size})`;
        $('filtered').textContent = `${users.length} results`;
        $('selectAll').disabled = busy || !page.length;
        $('selectAll').checked = page.length > 0 && page.every(user => state.selected.has(user.id));
        $('selectAll').indeterminate = page.some(user => state.selected.has(user.id)) && !$('selectAll').checked;
        $('list').replaceChildren();
        if (!page.length) {
            const empty = document.createElement('div'); empty.className = 'empty';
            const title = document.createElement('strong'); title.textContent = state.timestamp ? 'No accounts to display' : 'Get to know your circle';
            const text = document.createElement('p'); text.className = 'muted'; text.textContent = state.timestamp ? 'Check your filters and whitelist, or start a new scan.' : 'Start a scan to see who does not follow you back.';
            empty.append(title, text); $('list').append(empty);
        }
        for (const user of page) {
            const row = document.createElement('div'); row.className = 'row';
            const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = state.selected.has(user.id); checkbox.disabled = busy; checkbox.setAttribute('aria-label', `Select ${user.username}`);
            checkbox.onchange = () => { checkbox.checked ? state.selected.add(user.id) : state.selected.delete(user.id); render(); };
            const avatar = document.createElement('span'); avatar.className = 'avatar'; avatar.textContent = user.username.slice(0, 2).toUpperCase(); avatar.setAttribute('aria-hidden', 'true');
            const identity = document.createElement('div'); identity.className = 'identity';
            const link = document.createElement('a'); link.href = `https://www.instagram.com/${encodeURIComponent(user.username)}/`; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = `@${user.username}${user.is_verified ? ' ✓' : ''}`;
            const name = document.createElement('p'); name.textContent = user.full_name || 'Instagram account'; identity.append(link, name);
            const button = document.createElement('button'); button.className = 'small danger'; button.textContent = 'Unfollow'; button.disabled = busy; button.setAttribute('aria-label', `Unfollow ${user.username}`); button.onclick = () => unfollow([user]);
            row.append(checkbox, avatar, identity, button); $('list').append(row);
        }
        $('pagination').hidden = users.length <= pageSize;
        $('pageInfo').textContent = `${state.page + 1} / ${Math.max(1, Math.ceil(users.length / pageSize))}`;
        $('prev').disabled = state.page === 0; $('next').disabled = (state.page + 1) * pageSize >= users.length;
        $('saved').textContent = storageFailed ? 'Could not save results. Export them before closing the page.' : state.timestamp && !state.complete && state.checked === 0 ? 'No new results yet. Previously saved results are still available.' : state.timestamp ? `Scan ${new Date(state.timestamp).toLocaleString('en-US')}${state.complete ? '' : ' · partial'}` : 'Results are saved locally, separately for each account.';
    }
    function toggle(open) {
        $('panel').hidden = !open; $('launcher').setAttribute('aria-expanded', String(open));
        (open ? $('close') : $('launcher')).focus();
    }
    $('launcher').onclick = () => toggle($('panel').hidden);
    $('close').onclick = () => toggle(false);
    root.addEventListener('keydown', event => { if (event.key === 'Escape') { event.stopPropagation(); toggle(false); } });
    if (typeof GM_registerMenuCommand === 'function') GM_registerMenuCommand('Open Non-followers Finder', () => toggle(true));
    for (const id of ['search', 'filter', 'sort']) $(id).addEventListener(id === 'search' ? 'input' : 'change', () => { state.page = 0; render(); });
    $('prev').onclick = () => { state.page--; render(); };
    $('next').onclick = () => { state.page++; render(); };
    $('selectAll').onchange = () => {
        for (const user of visibleUsers().slice(state.page * pageSize, (state.page + 1) * pageSize)) $('selectAll').checked ? state.selected.add(user.id) : state.selected.delete(user.id);
        render();
    };
    function number(id) {
        const input = $(id);
        if (!input.checkValidity() || !Number.isFinite(input.valueAsNumber)) { input.closest('details')?.setAttribute('open', ''); input.reportValidity(); throw new Error('Check the numbers in your settings.'); }
        return input.valueAsNumber;
    }
    async function checkpoint() {
        while (state.paused && !state.stop) { assertAccount(); await sleep(150); }
        if (state.stop) throw new DOMException('Stopped', 'AbortError');
        assertAccount();
    }
    async function delay(ms) {
        let remaining = ms;
        while (remaining > 0) { await checkpoint(); const slice = Math.min(150, remaining); await sleep(slice); remaining -= slice; }
        await checkpoint();
    }
    async function request(path, method = 'GET') {
        await checkpoint();
        const csrf = cookie('csrftoken');
        if (method === 'POST' && !csrf) throw new Error('Login token unavailable. Reload Instagram.');
        const controller = new AbortController();
        let gmRequest;
        let rejectPending;
        const pending = new Promise((resolve, reject) => { rejectPending = reject; });
        const abort = error => {
            // Settle the caller even if a browser/extension never reports its abort.
            rejectPending(error);
            try { controller.abort(); gmRequest?.abort(); } catch { /* Already settled. */ }
        };
        const timeout = setTimeout(() => abort(new DOMException('Request timeout', 'TimeoutError')), 25000);
        if (method === 'GET') cancelRead = () => abort(new DOMException('Stopped', 'AbortError'));
        const endpoint = path.split('?')[0];
        diagnostic.phase = `${method} ${endpoint}`; diagnostic.requests++; diagnostic.http = '-'; diagnostic.response = 'Waiting for response'; updateDiagnostic();
        try {
            // POSTs are never automatically retried: a lost response may still have changed the account.
            const url = `https://www.instagram.com${path}`;
            const headers = { Accept: 'application/json', 'X-IG-App-ID': '936619743392459', ...(csrf ? { 'X-CSRFToken': csrf } : {}) };
            // Use the userscript manager for reads; keep mutations on their existing session transport.
            const transport = method === 'GET' && typeof GM_xmlhttpRequest === 'function'
                ? new Promise((resolve, reject) => {
                    gmRequest = GM_xmlhttpRequest({
                        method: 'GET', url, headers, timeout: 25000,
                        onload: result => resolve({
                            ok: result.status >= 200 && result.status < 300,
                            status: result.status,
                            json: async () => JSON.parse(result.responseText)
                        }),
                        onerror: () => reject(new Error('Extension request failed. Check Tampermonkey access to www.instagram.com and your browser connection.')),
                        ontimeout: () => reject(new DOMException('Request timeout', 'TimeoutError')),
                        onabort: () => reject(new DOMException('Stopped', 'AbortError'))
                    });
                })
                : fetch(url, { method, credentials: 'include', signal: controller.signal, headers });
            const response = await Promise.race([transport, pending]);
            assertAccount();
            diagnostic.http = response.status; diagnostic.response = 'Reading response'; updateDiagnostic();
            if (response.status === 429) throw new Error('Instagram rate limit reached (429). The process has stopped; try again later.');
            if ([401, 403].includes(response.status)) throw new Error(`Instagram denied access (HTTP ${response.status}). Check your login or any verification prompts on Instagram.`);
            if (!response.ok) throw new Error(`Request failed (HTTP ${response.status}). Try again later.`);
            let data;
            try { data = await Promise.race([response.json(), pending]); } catch (error) {
                if (['AbortError', 'TimeoutError'].includes(error?.name)) throw error;
                throw new Error('Instagram returned a non-JSON response. Check your login, then reload the page.');
            }
            if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Instagram returned empty or invalid JSON.');
            const hasErrors = Array.isArray(data.errors) ? data.errors.length > 0 : Boolean(data.errors);
            diagnostic.response = Array.isArray(data.users) ? `List: ${data.users.length} accounts; next page=${Boolean(data.next_max_id)}` : typeof data.followed_by === 'boolean' ? `Follow-back status available` : data.user ? 'Profile received' : 'JSON object without a list or follow-back status';
            updateDiagnostic();
            if (data.status === 'fail' || hasErrors || data.challenge || data.checkpoint_url) throw new Error('Instagram rejected the request or requires verification. Open Instagram to check.');
            return data;
        } catch (error) {
            if (error?.name === 'AbortError' && state.stop) throw error;
            if (['AbortError', 'TimeoutError'].includes(error?.name)) throw new Error(`${endpoint}: request timeout (25 seconds).${method === 'POST' ? ' Check Instagram before retrying; the change may already have been processed.' : ' Check the extension access to Instagram and your browser connection.'}`);
            if (error instanceof TypeError) throw new Error(`${endpoint}: the request failed or the browser could not read the response. Check this request in the Network tab for connection, blocker, or CORS errors.`);
            throw new Error(`${endpoint}: ${errorText(error)}`);
        } finally { clearTimeout(timeout); cancelRead = null; }
    }
    function begin(job) { state.job = job; state.stop = false; state.paused = false; render(); }
    function finish() { state.job = null; state.paused = false; state.stop = false; render(); }
    $('pause').onclick = () => { state.paused = !state.paused; status(state.paused ? 'Paused. Any in-flight request will finish first.' : 'Resuming…'); render(); };
    $('stop').onclick = () => { state.stop = true; state.paused = false; status(state.job === 'scan' ? 'Stopping scan…' : 'Stopping after the current request finishes…'); cancelRead?.(); render(); };
    $('start').onclick = async () => {
        if (state.job) return;
        let started = false;
        try {
            diagnostic.phase = 'Checking login and settings'; diagnostic.requests = 0; diagnostic.http = '-'; diagnostic.response = '-';
            status('Starting scan…');
            assertAccount(); const limit = number('limit'); const wait = number('delay') * 1000;
            state.users = []; state.selected.clear(); state.checked = 0; state.total = limit; state.unknown = 0; state.timestamp = Date.now(); state.complete = false; state.page = 0;
            scanOutcome = 'scanning'; started = true; begin('scan'); status('Loading your following list… Each request has a 25-second timeout.');
            let cursor = null; const cursors = new Set(); const seen = new Set();
            while (state.checked < limit) {
                await checkpoint();
                // REST follow-list and friendship/show shapes: instagrapi/mixins/user.py.
                const data = await request(`/api/v1/friendships/${account}/following/?count=${Math.min(50, limit - state.checked)}&search_surface=follow_list_page${cursor ? `&max_id=${encodeURIComponent(cursor)}` : ''}`);
                await checkpoint();
                if (!Array.isArray(data.users)) throw new Error('Instagram list format changed: the response does not contain users. Scan stopped.');
                if (data.next_max_id != null && typeof data.next_max_id !== 'string') throw new Error('Invalid Instagram list cursor.');
                if (!data.users.length) {
                    if (state.checked > 0 || data.next_max_id) throw new Error('Instagram pagination returned an empty page. Results are incomplete.');
                    status('Following list is empty. Checking the following count on your profile…');
                    await delay(wait);
                    const profile = (await request(`/api/v1/users/${account}/info/`)).user;
                    await checkpoint();
                    if (!profile || String(profile.pk ?? profile.id) !== account || !Number.isInteger(profile.following_count) || profile.following_count < 0) throw new Error('The following list is empty, but the following count could not be verified. This is not a valid scan result.');
                    if (profile.following_count > 0) throw new Error(`Instagram returned an empty list, but your profile shows ${profile.following_count} following. Data is unavailable; the scan has not succeeded.`);
                    break;
                }
                const previousCount = state.checked;
                for (const rawUser of data.users) {
                    if (state.checked >= limit) break;
                    await checkpoint();
                    const user = normalizeUser(rawUser);
                    if (!user) throw new Error('Instagram returned incomplete account data. Scan stopped.');
                    if (seen.has(user.id)) continue;
                    let follows = rawUser.friendship_status?.followed_by ?? rawUser.follows_viewer;
                    let following = rawUser.friendship_status?.following;
                    if (typeof follows !== 'boolean') {
                        status(`Checking follow-back for @${user.username} (${state.checked + 1}/${limit})…`);
                        await delay(wait);
                        const relationship = await request(`/api/v1/friendships/show/${user.id}/`);
                        await checkpoint();
                        follows = relationship.followed_by;
                        following = relationship.following;
                    }
                    seen.add(user.id); state.checked++;
                    // Missing relationship data is unknown, never proof that someone does not follow back.
                    if (following !== false && follows === false) state.users.push(user);
                    else if (following !== false && follows !== true) state.unknown++;
                    save(); render();
                }
                save(); render(); status(`${state.checked} accounts checked${state.unknown ? `; ${state.unknown} without follow-back data` : ''}.`);
                if (state.checked === previousCount) throw new Error('Instagram pagination is not advancing. Partial results saved.');
                if (!data.next_max_id || state.checked >= limit) break;
                const next = data.next_max_id;
                if (cursors.has(next)) throw new Error('Instagram pagination is not advancing. Partial results saved.');
                cursors.add(next); cursor = next;
                await delay(wait);
            }
            state.complete = state.unknown === 0; state.total = state.checked;
            scanOutcome = state.complete ? 'complete' : 'partial results'; diagnostic.phase = state.complete ? 'Complete' : 'Incomplete follow-back status';
            status(`${state.complete ? 'Scan complete' : 'Partial scan'}: ${state.checked} accounts checked, ${state.users.length} not following you back.${state.unknown ? ` ${state.unknown} accounts could not be verified and were excluded.` : ''}`, !state.complete);
        } catch (error) {
            const stopped = error?.name === 'AbortError';
            scanOutcome = stopped ? 'stopped' : 'scan failed';
            status(stopped ? `Scan stopped. ${state.checked > 0 ? 'Partial results saved.' : 'No accounts checked yet.'}` : `Scan failed: ${errorText(error)}`, !stopped);
        }
        finally { if (started) { if (state.checked > 0 || state.complete) save(); finish(); } }
    };
    async function unfollow(users) {
        if (state.job || !users.length) return;
        let started = false; let done = 0;
        try {
            assertAccount(); const wait = number('unfollowDelay') * 1000;
            const protectedNames = whitelist();
            const targets = users.filter(user => state.users.some(item => item.id === user.id) && !protectedNames.has(user.username.toLowerCase()));
            if (!targets.length) return;
            const preview = targets.slice(0, 8).map(user => `@${user.username}`).join('\n');
            if (!window.confirm(`Unfollow these ${targets.length} accounts?\n\n${preview}${targets.length > 8 ? `\n…and ${targets.length - 8} other selected accounts.` : ''}\n\nScan results may change. The process stops if Instagram rejects a request.`)) return;
            begin('unfollow'); started = true;
            for (const user of targets) {
                await checkpoint(); status(`Unfollow @${user.username} (${done + 1}/${targets.length})…`);
                const result = await request(`/web/friendships/${user.id}/unfollow/`, 'POST');
                if (result.status !== 'ok' || result.friendship_status?.following === true) throw new Error(`Unfollow @${user.username} was not confirmed by Instagram.`);
                state.users = state.users.filter(item => item.id !== user.id); state.selected.delete(user.id); done++; save(); render();
                if (done < targets.length) await delay(wait);
            }
            status(`${done} accounts successfully unfollowed.`);
        } catch (error) { status(`${done} accounts completed. ${error.name === 'AbortError' ? 'Process stopped.' : error.message}`, error.name !== 'AbortError'); }
        finally { if (started) finish(); }
    }
    $('bulk').onclick = () => unfollow(visibleUsers().filter(user => state.selected.has(user.id)));
    $('load').onclick = () => {
        if (state.job) return;
        try {
            assertAccount(); const saved = read(storageKey, null);
            if (!saved || !Array.isArray(saved.data)) throw new Error('No saved results for this account yet.');
            const users = saved.data.map(normalizeUser);
            if (users.some(user => !user)) throw new Error('Saved data is invalid. Run a new scan.');
            state.users = [...new Map(users.map(user => [user.id, user])).values()]; state.selected.clear(); state.page = 0;
            state.timestamp = Number.isFinite(saved.timestamp) ? saved.timestamp : Date.now();
            state.checked = Number.isFinite(saved.checked) && saved.checked >= 0 ? saved.checked : users.length;
            state.total = Number.isFinite(saved.total) && saved.total >= state.checked ? saved.total : state.checked;
            state.unknown = Number.isFinite(saved.unknown) && saved.unknown >= 0 ? saved.unknown : 0;
            state.complete = saved.complete === true;
            scanOutcome = '';
            render(); status('Saved results loaded. Run a new scan for the latest data.');
        } catch (error) { status(error.message, true); }
    };
    $('export').onclick = () => {
        try {
            assertAccount();
            // Quote CSV fields and neutralize spreadsheet formulas in display names.
            const cell = value => `"${String(value).replace(/^[\s]*[=+@-]/, match => `'${match}`).replace(/"/g, '""')}"`;
            const users = visibleUsers();
            const rows = [['username', 'name', 'verified', 'profile', 'scan_time', 'partial'], ...users.map(user => [user.username, user.full_name, user.is_verified, `https://www.instagram.com/${user.username}/`, new Date(state.timestamp).toISOString(), !state.complete])];
            const url = URL.createObjectURL(new Blob(['\uFEFF' + rows.map(row => row.map(cell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
            const link = document.createElement('a'); link.href = url; link.download = `instagram-non-followers-${account}-${new Date().toISOString().slice(0, 10)}.csv`; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
            status(`${users.length} matching accounts exported to CSV.`);
        } catch (error) { status(error.message, true); }
    };
    render();
    updateDiagnostic();
    if (!account) status('Log in to Instagram, then reload the page to start.', true);
})();
