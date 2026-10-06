/* =========================================
   CREED — SPOOFER CONSOLE DEMO
   A simulated spoofer run for the free-trial page. Types realistic CMD output
   line by line so visitors can see what the tool actually does before buying.

   Nothing here touches the machine: it is a scripted playback, which is why
   the UI carries a SIMULATION badge. Serials shown are randomised per run and
   partially masked so no output ever resembles a real identifier.

   Deliberately mirrors what a spoofer genuinely does — it randomises HARDWARE
   identifiers. It never claims to restore or unban an account.
   ========================================= */

(function creedSpooferDemo() {
    'use strict';

    var root = document.getElementById('spoofer-demo');
    if (!root) return;

    var out = document.getElementById('spoofer-out');
    var runBtn = document.getElementById('spoofer-run');
    var skipBtn = document.getElementById('spoofer-skip');
    var statusEl = document.getElementById('spoofer-status');

    var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var running = false;
    var timers = [];

    var HEX = '0123456789ABCDEF';
    function hex(n) {
        var s = '';
        for (var i = 0; i < n; i++) s += HEX[Math.floor(Math.random() * 16)];
        return s;
    }
    function mac() {
        return [hex(2), hex(2), hex(2), '**', '**', '**'].join(':');
    }

    /* Each line: [text, class, delayAfterMs]. */
    function script() {
        var disk = hex(4) + '-' + hex(4);
        var uuid = hex(8) + '-' + hex(4) + '-' + hex(4) + '-****-************';
        var newDisk = hex(4) + '-' + hex(4);
        var keys = 90 + Math.floor(Math.random() * 80);
        var secs = (6 + Math.random() * 4).toFixed(2);

        return [
            ['Creed Spoofer v2.4.1  (trial build)', 'sp-dim', 260],
            ['Copyright (c) 2021-2026 Creed. All rights reserved.', 'sp-dim', 420],
            ['', '', 160],
            ['[*] Initialising kernel driver...', '', 520],
            ['[+] Driver loaded: creed_hwid.sys', 'sp-ok', 380],
            ['', '', 120],
            ['[*] Reading current hardware identifiers...', '', 460],
            ['    Disk serial   : ' + disk, 'sp-val', 130],
            ['    SMBIOS UUID   : ' + uuid, 'sp-val', 130],
            ['    MAC address   : ' + mac(), 'sp-val', 130],
            ['    Volume GUID   : {' + hex(8) + '-****}', 'sp-val', 130],
            ['    TPM           : present (2.0)', 'sp-val', 380],
            ['', '', 120],
            ['[*] Backing up originals...', '', 480],
            ['[+] Backup written to C:\\Creed\\restore\\hwid.bak', 'sp-ok', 420],
            ['', '', 120],
            ['[*] Generating new identifiers...', '', 560],
            ['[+] Disk serial   -> ' + newDisk, 'sp-ok', 260],
            ['[+] SMBIOS UUID   -> randomised', 'sp-ok', 240],
            ['[+] MAC address   -> ' + mac(), 'sp-ok', 240],
            ['[+] Volume GUIDs  -> randomised', 'sp-ok', 380],
            ['', '', 120],
            ['[*] Clearing anti-cheat traces...', '', 520],
            ['[+] EasyAntiCheat : cleared', 'sp-ok', 260],
            ['[+] BattlEye      : cleared', 'sp-ok', 260],
            ['[+] Registry      : ' + keys + ' keys removed', 'sp-ok', 380],
            ['', '', 120],
            ['[*] Verifying...', '', 620],
            ['[+] All hardware identifiers changed successfully.', 'sp-ok', 320],
            ['[!] Reboot required for changes to take effect.', 'sp-warn', 300],
            ['', '', 120],
            ['Completed in ' + secs + 's.', 'sp-dim', 0]
        ];
    }

    function clearTimers() {
        timers.forEach(clearTimeout);
        timers = [];
    }

    function addLine(text, cls) {
        var el = document.createElement('div');
        el.className = 'sp-line' + (cls ? ' ' + cls : '');
        el.textContent = text || '\u00a0';
        out.appendChild(el);
        out.scrollTop = out.scrollHeight;
        return el;
    }

    /** Types one line character by character, then resolves. */
    function typeLine(text, cls, done) {
        if (!text) { addLine('', cls); return done(); }
        var el = addLine('', cls);
        var i = 0;
        // Fast enough to feel like console output, slow enough to read.
        var step = text.length > 60 ? 6 : 12;
        (function tick() {
            i += 2;
            el.textContent = text.slice(0, i);
            out.scrollTop = out.scrollHeight;
            if (i < text.length) timers.push(setTimeout(tick, step));
            else done();
        })();
    }

    function finish() {
        running = false;
        root.classList.remove('is-running');
        root.classList.add('is-done');
        runBtn.disabled = false;
        runBtn.innerHTML = '<i class="fas fa-rotate-right"></i> Run again';
        skipBtn.hidden = true;
        if (statusEl) statusEl.textContent = 'Simulation complete';
    }

    function run() {
        if (running) return;
        running = true;
        clearTimers();
        out.innerHTML = '';
        root.classList.add('is-running');
        root.classList.remove('is-done');
        runBtn.disabled = true;
        runBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Running…';
        skipBtn.hidden = false;
        if (statusEl) statusEl.textContent = 'Spoofing…';

        var lines = script();
        var idx = 0;

        function next() {
            if (idx >= lines.length) return finish();
            var l = lines[idx++];
            var pause = reduceMotion ? 40 : l[2];
            var render = reduceMotion
                ? function (t, c, d) { addLine(t, c); d(); }
                : typeLine;
            render(l[0], l[1], function () {
                timers.push(setTimeout(next, pause));
            });
        }
        next();
    }

    /** Dump the rest instantly. */
    function skip() {
        if (!running) return;
        clearTimers();
        out.innerHTML = '';
        script().forEach(function (l) { addLine(l[0], l[1]); });
        finish();
    }

    runBtn.addEventListener('click', run);
    skipBtn.addEventListener('click', skip);
})();
