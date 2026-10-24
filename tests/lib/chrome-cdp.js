/*
 * Just enough of playwright-core to run tests/layout.test.js, spoken straight to Chrome
 * over its own debugging protocol.
 *
 * A fallback, not a replacement. layout.test.js asks for playwright-core first and only
 * comes here when it is not installed - which is the case in any sandbox that has a
 * browser but no route to the npm registry, and that is where this app is largely
 * worked on. The alternative was the suite being runnable only on the runner, which is
 * how it came to not be run at all for months.
 *
 * CI installs the real playwright-core, so the authoritative run never touches this. If
 * this ever drifts from what playwright does, the runner still catches it; the worst a
 * drift can cost here is a local pass that CI then disagrees with.
 *
 * It implements exactly what that one test uses - launch, newPage, addInitScript, goto,
 * evaluate, waitForTimeout, close - and nothing else. Anything more belongs in the real
 * library.
 */
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

function wsConnect(url) {
  return new Promise((res, rej) => {
    const s = new WebSocket(url);
    s.onopen = () => res(s);
    s.onerror = (e) => rej(new Error('ws: ' + (e && e.message)));
  });
}

class Conn {
  constructor(sock) {
    this.sock = sock;
    this.id = 0;
    this.waiting = new Map();
    this.listeners = [];
    sock.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && this.waiting.has(m.id)) {
        const { res, rej } = this.waiting.get(m.id);
        this.waiting.delete(m.id);
        if (m.error) rej(new Error(m.error.message)); else res(m.result);
      }
      this.listeners.forEach((fn) => fn(m));
    };
  }
  send(method, params, sessionId) {
    const id = ++this.id;
    const msg = { id, method, params: params || {} };
    if (sessionId) msg.sessionId = sessionId;
    this.sock.send(JSON.stringify(msg));
    return new Promise((res, rej) => this.waiting.set(id, { res, rej }));
  }
  once(pred) {
    return new Promise((res) => {
      const fn = (m) => {
        if (!pred(m)) return;
        this.listeners = this.listeners.filter((x) => x !== fn);
        res(m);
      };
      this.listeners.push(fn);
    });
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class Page {
  constructor(conn, sessionId, targetId) {
    this.conn = conn; this.sid = sessionId; this.tid = targetId;
  }
  async addInitScript(source) {
    await this.conn.send('Page.addScriptToEvaluateOnNewDocument',
      { source: typeof source === 'string' ? source : '(' + source + ')()' }, this.sid);
  }
  async goto(url) {
    const loaded = this.conn.once((m) => m.method === 'Page.loadEventFired' && m.sessionId === this.sid);
    await this.conn.send('Page.navigate', { url }, this.sid);
    await Promise.race([loaded, sleep(20000)]);
  }
  async evaluate(fn, arg) {
    const expr = arg === undefined
      ? '(' + fn.toString() + ')()'
      : '(' + fn.toString() + ')(' + JSON.stringify(arg) + ')';
    const r = await this.conn.send('Runtime.evaluate',
      { expression: expr, returnByValue: true, awaitPromise: true, userGesture: true }, this.sid);
    if (r.exceptionDetails) {
      const d = r.exceptionDetails;
      throw new Error('evaluate: ' + (d.exception && (d.exception.description || d.exception.value) || d.text));
    }
    return r.result && r.result.value;
  }
  waitForTimeout(ms) { return sleep(ms); }
  async close() {
    try { await this.conn.send('Target.closeTarget', { targetId: this.tid }); } catch (e) {}
  }
}

class Browser {
  constructor(conn, proc, dir) { this.conn = conn; this.proc = proc; this.dir = dir; }
  async newPage(opts) {
    opts = opts || {};
    const { targetId } = await this.conn.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await this.conn.send('Target.attachToTarget', { targetId, flatten: true });
    const page = new Page(this.conn, sessionId, targetId);
    await this.conn.send('Page.enable', {}, sessionId);
    await this.conn.send('Runtime.enable', {}, sessionId);
    const v = opts.viewport || { width: 1280, height: 720 };
    await this.conn.send('Emulation.setDeviceMetricsOverride', {
      width: v.width, height: v.height,
      deviceScaleFactor: opts.deviceScaleFactor || 1,
      mobile: !!opts.isMobile
    }, sessionId);
    if (opts.hasTouch) {
      await this.conn.send('Emulation.setTouchEmulationEnabled',
        { enabled: true, maxTouchPoints: 5 }, sessionId);
    }
    return page;
  }
  async close() {
    try { this.proc.kill('SIGKILL'); } catch (e) {}
    try { fs.rmSync(this.dir, { recursive: true, force: true }); } catch (e) {}
  }
}

const chromium = {
  async launch(opts) {
    opts = opts || {};
    const exe = opts.executablePath;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ndchrome-'));
    const proc = spawn(exe, [
      '--headless=new', '--remote-debugging-port=0', '--user-data-dir=' + dir,
      '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
      '--allow-file-access-from-files', '--hide-scrollbars',
      '--disable-background-timer-throttling', 'about:blank'
    ], { stdio: ['ignore', 'pipe', 'pipe'] });

    const url = await new Promise((res, rej) => {
      let buf = '';
      const t = setTimeout(() => rej(new Error('chrome did not say where to listen:\n' + buf)), 30000);
      proc.stderr.on('data', (d) => {
        buf += d.toString();
        const m = /DevTools listening on (ws:\/\/\S+)/.exec(buf);
        if (m) { clearTimeout(t); res(m[1]); }
      });
      proc.on('exit', (c) => { clearTimeout(t); rej(new Error('chrome exited ' + c + '\n' + buf)); });
    });
    const conn = new Conn(await wsConnect(url));
    return new Browser(conn, proc, dir);
  }
};

module.exports = { chromium };
