// Run: node check.cjs. No dependencies and no real Instagram requests.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(`${__dirname}/ig-finder.js`, 'utf8');

class Element {
    constructor(tag = 'div') { this.tag = tag; this.children = []; this.value = ''; this.dataset = {}; this.style = {}; this.events = {}; this.hidden = false; }
    set innerHTML(html) {
        this.html = html;
        this.elements = Object.fromEntries([...html.matchAll(/<([a-z]+)\b([^>]*\bid="([^"]+)"[^>]*)>/g)].map(([, tag, attrs, id]) => {
            const el = new Element(tag);
            for (const prop of ['value', 'min', 'max']) el[prop] = attrs.match(new RegExp(`${prop}="([^"]*)"`))?.[1] ?? '';
            el.hidden = /\bhidden\b/.test(attrs);
            return [id, el];
        }));
        if (this.elements.filter) { this.elements.filter.value = 'all'; this.elements.sort.value = 'default'; }
    }
    getElementById(id) { return this.elements[id]; }
    attachShadow() { this.shadowRoot = new Element(); return this.shadowRoot; }
    append(...nodes) { this.children.push(...nodes); }
    appendChild(node) { this.children.push(node); return node; }
    replaceChildren(...nodes) { this.children = nodes; }
    setAttribute(key, value) { this[key] = value; }
    addEventListener(key, fn) { this.events[key] = fn; }
    focus() {} remove() {} click() {} closest() { return null; } reportValidity() {}
    get valueAsNumber() { return this.value === '' ? NaN : Number(this.value); }
    checkValidity() { return Number.isInteger(this.valueAsNumber) && this.valueAsNumber >= Number(this.min) && this.valueAsNumber <= Number(this.max); }
}
const node = (id, follows = false) => ({ node: { id: String(id), username: `user${id}`, full_name: `User ${id}`, follows_viewer: follows } });
const page = (edges, next = false, cursor = null) => ({ status: 'ok', users: edges.map(({ node: { id, follows_viewer, ...user } }) => ({ ...user, pk: id, friendship_status: { followed_by: follows_viewer, following: true } })), next_max_id: next ? cursor : null });
function setup(responses = [], stored = new Map()) {
    const body = new Element();
    const document = { body, cookie: 'ds_user_id=123; csrftoken=test', getElementById: () => null, createElement: tag => new Element(tag) };
    const requests = [];
    const errors = [];
    const context = { document, console: { ...console, error: message => errors.push(message) }, TypeError, DOMException, AbortController, Blob, URL, setTimeout: (fn, ms) => ms >= 25000 ? 0 : setImmediate(fn), clearTimeout: id => clearImmediate(id),
        GM_getValue: (key, fallback) => stored.get(key) ?? fallback, GM_setValue: (key, value) => stored.set(key, structuredClone(value)), GM_registerMenuCommand() {}, window: { confirm: () => true },
        fetch: async (url, options) => { requests.push({ url, options }); const item = responses.shift(); if (!item) throw new Error('Unexpected request'); return typeof item === 'function' ? item() : { ok: true, status: 200, json: async () => item }; } };
    vm.runInNewContext(source, context);
    const $ = id => body.children[0].shadowRoot.getElementById(id);
    return { $, document, requests, stored, context, errors };
}
const flush = () => new Promise(resolve => setImmediate(resolve));
(async () => {
    let app = setup([page([node(1), node(2, true), node(3, null), node(4)]), { status: 'ok', followed_by: null }]);
    app.$('launcher').onclick(); assert.equal(app.$('panel').hidden, false, 'first launcher click opens');
    app.$('limit').value = '3'; await app.$('start').onclick();
    assert.equal(app.$('count').textContent, '1');
    assert.match(app.$('scanned').textContent, /3 checked.*1 unknown/);
    assert.equal(app.stored.get('igNonFollowers_123').data.length, 1, 'strict false and exact limit');
    assert.equal(app.requests.length, 2, 'list and unknown relationship lookup only');
    assert.ok(app.requests[0].url.includes('/api/v1/friendships/123/following/'));
    assert.ok(app.requests[1].url.endsWith('/api/v1/friendships/show/3/'));
    app.$('search').value = 'missing'; app.$('search').events.input(); assert.equal(app.$('export').disabled, true);
    app.$('search').value = ''; app.$('search').events.input();

    app = setup([page([node(1), node(1)], true, 'same'), page([node(1)], true, 'same')]);
    await app.$('start').onclick(); assert.equal(app.requests.length, 2); assert.match(app.$('status').textContent, /pagination/);
    assert.equal(app.stored.get('igNonFollowers_123').data.length, 1, 'deduplicates repeated edges');
    assert.equal(app.stored.get('igNonFollowers_123').complete, false);

    app = setup([() => ({ ok: false, status: 429 })]);
    await app.$('start').onclick(); assert.match(app.$('status').textContent, /429/); assert.equal(app.requests.length, 1);
    assert.equal(app.$('start').disabled, false);
    app = setup([{}]); await app.$('start').onclick(); assert.match(app.$('status').textContent, /format/);
    app = setup([{ ...page([node(1)]), errors: [] }]);
    await app.$('start').onclick(); assert.equal(app.$('count').textContent, '1', 'empty errors array is not a failure');
    assert.match(app.$('status').textContent, /Scan complete/);
    app = setup([() => ({ ok: true, status: 200, json: async () => null })]);
    await app.$('start').onclick(); assert.match(app.$('status').textContent, /empty or invalid JSON/);
    app = setup([() => { throw new TypeError('Failed to fetch'); }], new Map([['igNonFollowers_123', { data: [node(9).node] }]]));
    await app.$('start').onclick(); assert.match(app.$('status').textContent, /\/following\/.*Network tab/);
    assert.match(app.errors[0], /^\[IG Finder v2\.1\.1\]/);
    assert.equal(app.$('diagnostics').open, true, 'failure automatically exposes diagnosis');
    assert.match(app.$('diagnosticText').value, /Request: 1.*HTTP: -/);
    assert.match(app.$('scanned').textContent, /scan failed/);
    assert.equal(app.stored.get('igNonFollowers_123').data.length, 1, 'failed first request preserves previous saved scan');
    assert.ok(!app.errors[0].includes('csrftoken') && !app.errors[0].includes('variables='), 'diagnostic does not leak request details');
    app = setup(); app.$('limit').value = '-1'; await app.$('start').onclick(); assert.equal(app.requests.length, 0);
    assert.match(app.$('diagnosticText').value, /Request: 0/);
    assert.match(app.$('status').textContent, /Scan failed/);
    app = setup([() => ({ ok: false, status: 403 })]);
    await app.$('start').onclick();
    assert.match(app.$('diagnosticText').value, /HTTP: 403/);
    assert.match(app.$('status').textContent, /HTTP 403/);

    let resolve;
    app = setup([() => new Promise(done => { resolve = done; })]);
    let ended = false;
    const run = app.$('start').onclick().then(() => { ended = true; });
    await flush(); app.$('pause').onclick();
    resolve({ ok: true, status: 200, json: async () => page([node(1)]) });
    await flush(); assert.equal(ended, false, 'pause keeps scan alive');
    app.$('pause').onclick(); await run; assert.equal(app.$('count').textContent, '1');

    app = setup([() => new Promise(done => { resolve = done; })]);
    const stopped = app.$('start').onclick(); await flush(); app.$('pause').onclick(); app.$('stop').onclick();
    resolve({ ok: true, status: 200, json: async () => page([node(1)]) });
    await stopped; assert.match(app.$('status').textContent, /stopped/); assert.equal(app.$('start').disabled, false);

    app = setup([page([node(1), node(2)]), { status: 'ok' }, { status: 'ok' }]);
    await app.$('start').onclick(); app.$('whitelist').value = '@USER2'; app.$('whitelist').events.change();
    app.$('selectAll').checked = true; app.$('selectAll').onchange(); await app.$('bulk').onclick();
    assert.equal(app.requests.length, 2, 'whitelist excludes account from batch');
    assert.equal(app.stored.get('igNonFollowers_123').data.length, 1, 'unfollow persists removal');
    assert.equal(app.$('count').textContent, '0');
    app.$('whitelist').value = ''; app.$('whitelist').events.change();
    app.document.cookie = 'ds_user_id=456; csrftoken=test';
    app.$('selectAll').checked = true; app.$('selectAll').onchange(); await app.$('bulk').onclick();
    assert.equal(app.requests.length, 2, 'account switch prevents mutation');

    app = setup([page([node(1), node(2)]), { status: 'fail' }]);
    await app.$('start').onclick(); app.$('selectAll').checked = true; app.$('selectAll').onchange(); await app.$('bulk').onclick();
    assert.equal(app.requests.length, 2, 'batch stops after first failed mutation'); assert.equal(app.$('count').textContent, '2');

    const stored = new Map([['igNonFollowers_123', { timestamp: Date.now(), data: [], complete: true }]]);
    app = setup([], stored); app.$('load').onclick(); assert.match(app.$('status').textContent, /loaded/);
    app = setup([], new Map([['igNonFollowers_123', { data: [{ id: '1', username: '<script>' }] }]]));
    app.$('load').onclick(); assert.match(app.$('status').textContent, /invalid/);

    // The reported regression: an empty list is not proof that the account follows nobody.
    app = setup([page([]), { user: { pk: '123', following_count: 75 } }], new Map([['igNonFollowers_123', { data: [node(9).node] }]]));
    await app.$('start').onclick(); assert.match(app.$('status').textContent, /your profile shows 75/);
    assert.equal(app.stored.get('igNonFollowers_123').data.length, 1, 'false empty result cannot overwrite a previous scan');
    assert.ok(app.requests[1].url.endsWith('/api/v1/users/123/info/'));
    app = setup([page([]), { user: { pk: '123', following_count: 0 } }]);
    await app.$('start').onclick(); assert.match(app.$('status').textContent, /Scan complete: 0/);
    for (const user of [{ pk: '456', following_count: 0 }, { pk: '123' }]) {
        app = setup([page([]), { user }]); await app.$('start').onclick();
        assert.match(app.$('status').textContent, /could not be verified/);
        assert.equal(app.stored.has('igNonFollowers_123'), false);
    }
    app = setup([page([node(1)], true, 'cursor +/='), page([node(2)])]);
    await app.$('start').onclick(); assert.equal(app.$('count').textContent, '2');
    assert.ok(app.requests[1].url.includes('max_id=cursor%20%2B%2F%3D'));
    app = setup([page([node(1)], true, 'cursor'), page([])]);
    await app.$('start').onclick(); assert.match(app.$('status').textContent, /empty page/);
    assert.equal(app.stored.get('igNonFollowers_123').complete, false);

    app = setup([{ status: 'ok', users: [{ pk: '10', username: 'friend' }, { pk: '11', username: 'other' }, { pk: '12', username: 'removed' }] },
        { status: 'ok', followed_by: true, following: true }, { status: 'ok', followed_by: false, following: true }, { status: 'ok', followed_by: false, following: false }]);
    await app.$('start').onclick(); assert.equal(app.$('count').textContent, '1');
    assert.equal(app.stored.get('igNonFollowers_123').data[0].username, 'other', 'followed_by is incoming; following is outgoing');
    assert.equal(app.requests.length, 4);
    app = setup([page([node(1, null)]), { status: 'ok' }]);
    await app.$('start').onclick(); assert.match(app.$('status').textContent, /Partial scan/);
    assert.equal(app.stored.get('igNonFollowers_123').complete, false);
    assert.equal(app.$('count').textContent, '0', 'unknown relationship cannot be unfollowed');

    // Exercise the actual extension callback transport, not only mocked fetch.
    app = setup();
    let gmOptions;
    app.context.GM_xmlhttpRequest = options => {
        gmOptions = options;
        setImmediate(() => options.onload({ status: 200, responseText: JSON.stringify(page([node(1)])) }));
        return { abort() {} };
    };
    await app.$('start').onclick();
    assert.equal(app.$('count').textContent, '1');
    assert.equal(app.requests.length, 0, 'extension reads do not call page fetch');
    assert.equal(gmOptions.method, 'GET');
    assert.equal(gmOptions.timeout, 25000);
    assert.equal(gmOptions.anonymous, undefined, 'normal session cookies remain enabled');
    assert.match(app.$('diagnosticText').value, /Tampermonkey XHR/);

    app = setup();
    app.context.GM_xmlhttpRequest = options => {
        setImmediate(() => options.onerror()); return { abort() {} };
    };
    await app.$('start').onclick(); assert.match(app.$('status').textContent, /Extension request failed/);

    app = setup();
    let aborted = false;
    app.context.GM_xmlhttpRequest = () => ({ abort() { aborted = true; } });
    const cancelled = app.$('start').onclick(); await flush(); app.$('stop').onclick(); await cancelled;
    assert.equal(aborted, true); assert.equal(app.$('start').disabled, false);
    assert.match(app.$('status').textContent, /Scan stopped/);

    // A frozen transport and a frozen response body must both release the scan on timeout.
    for (const transport of ['extension', 'fetch', 'body']) {
        app = setup([() => transport === 'body' ? { ok: true, status: 200, json: () => new Promise(() => {}) } : new Promise(() => {})]);
        let expire;
        app.context.setTimeout = (fn, ms) => { assert.equal(ms, 25000); expire = fn; return 0; };
        if (transport === 'extension') app.context.GM_xmlhttpRequest = () => ({ abort() {} });
        const timed = app.$('start').onclick(); await flush(); expire(); await flush();
        assert.equal(app.$('start').disabled, false, `${transport} timeout releases the scan even without abort callbacks`);
        await timed; assert.match(app.$('status').textContent, /timeout \(25 seconds\)/);
    }
    console.log('PASS: launcher, strict relationship checks, scan limit, filters, pagination, rate limit, validation, pause/resume, stop, whitelist, unfollow persistence, account guard, failed batch, saved results.');
    console.log('PASS: extension request success/error, immediate GET cancellation, frozen extension/fetch/body timeout.');
})().catch(error => { console.error(error); process.exitCode = 1; });
