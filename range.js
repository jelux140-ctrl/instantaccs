/* =========================================
   CREED — TEST RANGE
   A small browser FPS used as a "try before you buy" demo: it shows how the
   feature set (ESP, aimbot, silent aim, grapple) actually feels.

   three.js is fetched lazily on first launch so the homepage stays light.
   ========================================= */

(function creedRange() {
    'use strict';

    const THREE_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
    const LB_KEY = 'creed_range_scores';
    const CFG_KEY = 'creed_range_config';

    const shell = document.getElementById('range-shell');
    if (!shell) return;

    const launchEl = document.getElementById('range-launch');
    const isTouch = window.matchMedia('(hover: none)').matches || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

    /* ---------------- config ---------------- */
    const DEFAULT_CFG = {
        weapon: 'rifle',
        aimEnabled: false,
        aimFov: 35,
        aimSmooth: 0.35,
        aimBone: 'head',
        silentAim: false,
        espBox: true,
        espName: true,
        espDistance: true,
        espSnaplines: false,
        espHealth: true,
        espChams: false,
        fov: 80,
        sensitivity: 1,
        crosshair: true,
        showTracers: true,
    };

    let cfg = loadCfg();

    function loadCfg() {
        try {
            const raw = JSON.parse(localStorage.getItem(CFG_KEY) || '{}');
            return Object.assign({}, DEFAULT_CFG, raw);
        } catch { return Object.assign({}, DEFAULT_CFG); }
    }
    function saveCfg() {
        try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); } catch { /* ignore */ }
    }

    const WEAPONS = {
        /* adsFov: camera FOV while aiming. scoped: draws the sniper scope
           overlay and hides the viewmodel, like a real optic. */
        rifle:  { name: 'Rifle',  mag: 30, rpm: 600, auto: true,  dmg: 34, spread: 0.012, score: 1,    reload: 1.9, label: '30 mag · auto', adsFov: 46, scoped: false },
        smg:    { name: 'SMG',    mag: 40, rpm: 900, auto: true,  dmg: 22, spread: 0.022, score: 0.85, reload: 1.6, label: '40 mag · auto', adsFov: 55, scoped: false },
        sniper: { name: 'Sniper', mag: 5,  rpm: 55,  auto: false, dmg: 120, spread: 0.001, score: 2.2, reload: 2.6, label: '5 mag · bolt',  adsFov: 18, scoped: true },
    };

    /* ---------------- leaderboard ---------------- */
    function getScores() {
        try { return JSON.parse(localStorage.getItem(LB_KEY) || '[]'); } catch { return []; }
    }
    function addScore(entry) {
        const list = getScores();
        list.push(entry);
        list.sort((a, b) => b.score - a.score);
        const top = list.slice(0, 5);
        try { localStorage.setItem(LB_KEY, JSON.stringify(top)); } catch { /* ignore */ }
        return top;
    }
    function renderLeaderboard() {
        const el = document.getElementById('range-lb-list');
        if (!el) return;
        const list = getScores();
        const personalBest = document.getElementById('range-personal-best');
        if (personalBest) personalBest.textContent = list.length ? list[0].score.toLocaleString() : '0';
        el.innerHTML = list.length
            ? list.map((s, i) => `<li><span class="rlb-rank">${i + 1}</span><span class="rlb-score">${s.score}</span><span class="rlb-meta">${s.acc}% · ${s.weapon}</span></li>`).join('')
            : '<li class="rlb-empty">No runs yet — set the first score.</li>';
    }
    renderLeaderboard();

    /* ---------------- lazy loader ---------------- */
    let threeLoading = null;
    function loadThree() {
        if (window.THREE) return Promise.resolve();
        if (threeLoading) return threeLoading;
        threeLoading = new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = THREE_SRC;
            s.async = true;
            s.onload = () => resolve();
            s.onerror = () => reject(new Error('Could not load the 3D engine'));
            document.head.appendChild(s);
        });
        return threeLoading;
    }

    /* ---------------- game ---------------- */
    let game = null;

    function boot(mode) {
        if (isTouch) return;
        shell.classList.add('is-loading');
        loadThree()
            .then(() => {
                shell.classList.remove('is-loading');
                shell.classList.add('is-live');
                if (!game) game = new Range();
                window.creedRange = game; // handy for debugging in the console
                game.start(mode);
            })
            .catch((err) => {
                shell.classList.remove('is-loading');
                const msg = document.getElementById('range-error');
                if (msg) { msg.textContent = err.message; msg.hidden = false; }
            });
    }

    class Range {
        constructor() {
            this.canvas = document.getElementById('range-canvas');
            this.overlay = document.getElementById('range-overlay');
            this.octx = this.overlay.getContext('2d');

            this.clock = { last: performance.now() };
            this.keys = Object.create(null);
            this.bots = [];
            this.tracers = [];
            this.running = false;
            this.mode = 'freeplay';

            this.initScene();
            this.initPlayer();
            this.buildViewmodel();
            this.initInput();
            this.buildHud();
            this.resize();
            window.addEventListener('resize', () => this.resize());
        }

        /* ---------- scene ---------- */
        initScene() {
            const T = window.THREE;
            this.scene = new T.Scene();
            this.scene.background = new T.Color(0x1b2030);
            this.scene.fog = new T.Fog(0x1b2030, 70, 210);

            this.camera = new T.PerspectiveCamera(cfg.fov, 16 / 9, 0.1, 500);

            this.renderer = new T.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
            this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

            this.scene.add(new T.AmbientLight(0xffffff, 0.28));
            this.scene.add(new T.HemisphereLight(0xc9d6f0, 0x3a352a, 0.42));
            const sun = new T.DirectionalLight(0xfff0d5, 0.62);
            sun.position.set(40, 70, 25);
            this.scene.add(sun);
            const rim = new T.DirectionalLight(0xffb800, 0.22);
            rim.position.set(-30, 25, -35);
            this.scene.add(rim);

            // floor
            const floor = new T.Mesh(
                new T.PlaneGeometry(220, 220),
                new T.MeshLambertMaterial({ color: 0x5d5849 })
            );
            floor.rotation.x = -Math.PI / 2;
            this.scene.add(floor);

            const grid = new T.GridHelper(220, 55, 0x4a463b, 0x524d41);
            grid.position.y = 0.02;
            this.scene.add(grid);

            // arena geometry
            this.colliders = [];
            const blockMat = new T.MeshLambertMaterial({ color: 0x4a5266 });
            const accentMat = new T.MeshLambertMaterial({ color: 0x376d66 });
            const goldMat = new T.MeshLambertMaterial({ color: 0xffb800 });

            const addBox = (w, h, d, x, y, z, mat) => {
                const m = new T.Mesh(new T.BoxGeometry(w, h, d), mat || blockMat);
                m.position.set(x, y + h / 2, z);
                this.scene.add(m);
                this.colliders.push({ mesh: m, w, h, d, x, z, y: y + h / 2 });
                return m;
            };

            // perimeter walls
            const R = 55;
            addBox(R * 2, 8, 2, 0, 0, -R);
            addBox(R * 2, 8, 2, 0, 0, R);
            addBox(2, 8, R * 2, -R, 0, 0);
            addBox(2, 8, R * 2, R, 0, 0);

            // cover blocks — a simple, readable arena
            const layout = [
                [8, 3, 8, -18, 0, -14], [8, 5, 8, 16, 0, -20], [6, 2, 14, 0, 0, 8],
                [12, 4, 6, -26, 0, 16], [10, 6, 10, 24, 0, 18], [5, 2, 5, -6, 0, -28],
                [14, 3, 5, 8, 0, 30], [4, 7, 4, -34, 0, -26], [4, 7, 4, 34, 0, -6],
                [6, 2, 6, -14, 0, 34], [7, 4, 7, 30, 0, -34],
            ];
            layout.forEach((b, i) => addBox(b[0], b[1], b[2], b[3], b[4], b[5], i % 4 === 0 ? accentMat : blockMat));

            // elevated platforms
            addBox(16, 0.6, 16, -18, 5, -14, accentMat);
            addBox(14, 0.6, 14, 24, 6, 18, accentMat);

            // gold accent strips (visual only)
            [[-18, 5.7, -14], [24, 6.7, 18]].forEach((p) => {
                const strip = new T.Mesh(new T.BoxGeometry(16, 0.12, 0.4), goldMat);
                strip.position.set(p[0], p[1], p[2] - 8);
                this.scene.add(strip);
            });

            this.raycaster = new T.Raycaster();
        }

        /* ---------- player ---------- */
        initPlayer() {
            this.player = {
                pos: new window.THREE.Vector3(0, 1.7, 44),
                vel: new window.THREE.Vector3(),
                yaw: Math.PI,
                pitch: 0,
                onGround: true,
                height: 1.7,
                sliding: false,
                grapple: null,
                grappleCd: 0,
            };
            this.weapon = { id: cfg.weapon, ammo: WEAPONS[cfg.weapon].mag, cooldown: 0, reloading: 0 };
            this.stats = { score: 0, hits: 0, shots: 0, time: 0 };
        }

        /* ---------- input ---------- */
        initInput() {
            this.onKeyDown = (e) => {
                if (!this.running) return;
                const k = e.code;
                this.keys[k] = true;

                if (k === 'Tab') { e.preventDefault(); this.toggleMenu(); return; }
                if (k === 'Escape' && this.menuOpen) { this.toggleMenu(false); return; }
                if (!this.pointerLocked && this.menuOpen) return;

                if (k === 'Digit1') this.setWeapon('rifle');
                if (k === 'Digit2') this.setWeapon('smg');
                if (k === 'Digit3') this.setWeapon('sniper');
                if (k === 'KeyR') this.reload();
                if (k === 'KeyB') { cfg.espBox = !cfg.espBox; saveCfg(); this.syncMenu(); this.toast('ESP ' + (cfg.espBox ? 'ON' : 'OFF')); }
                if (k === 'KeyV') { cfg.aimEnabled = !cfg.aimEnabled; saveCfg(); this.syncMenu(); this.toast('Aimbot ' + (cfg.aimEnabled ? 'ON' : 'OFF')); }
                if (k === 'KeyQ') this.fireGrapple();
                if (k === 'Space' && this.player.onGround) { this.player.vel.y = 7.4; this.player.onGround = false; }
            };
            this.onKeyUp = (e) => { this.keys[e.code] = false; };

            this.onMouseMove = (e) => {
                if (!this.pointerLocked) return;
                // Aiming slows the look speed, scaled by how far the weapon
                // actually zooms - the sniper tightens far more than the SMG.
                const w = WEAPONS[this.weapon.id];
                const zoom = cfg.fov / (w.adsFov || cfg.fov);
                const adsScale = 1 - (this.adsT || 0) * (1 - 1 / Math.max(1, zoom * 0.75));
                const s = 0.0022 * cfg.sensitivity * adsScale;
                // Feeds viewmodel sway so the gun trails the camera.
                this._swayX = Math.max(-1, Math.min(1, (this._swayX || 0) * 0.85 - e.movementX * 0.006));
                this._swayY = Math.max(-1, Math.min(1, (this._swayY || 0) * 0.85 - e.movementY * 0.006));
                this.player.yaw -= e.movementX * s;
                this.player.pitch -= e.movementY * s;
                const lim = Math.PI / 2 - 0.02;
                this.player.pitch = Math.max(-lim, Math.min(lim, this.player.pitch));
            };

            this.onMouseDown = (e) => {
                // Right mouse = aim down sights. Previously every non-left
                // button returned early, so right-click did nothing at all.
                if (e.button === 2) {
                    e.preventDefault();
                    if (this.pointerLocked) this.ads = true;
                    return;
                }
                if (e.button !== 0) return;
                if (!this.pointerLocked && !this.menuOpen) { this.lock(); return; }
                this.firing = true;
            };
            this.onMouseUp = (e) => {
                if (e && e.button === 2) { this.ads = false; return; }
                this.firing = false;
            };
            // Without this the browser context menu opens over the canvas and
            // steals pointer lock the first time you try to scope.
            this.onContextMenu = (e) => { e.preventDefault(); };

            this.onPointerLockChange = () => {
                this.pointerLocked = document.pointerLockElement === this.canvas;
                shell.classList.toggle('is-locked', this.pointerLocked);
                if (!this.pointerLocked && this.running && !this.menuOpen) this.toggleMenu(true);
            };

            document.addEventListener('pointerlockchange', this.onPointerLockChange);
        }

        lock() { this.canvas.requestPointerLock?.(); }

        bindEvents(on) {
            const fn = on ? 'addEventListener' : 'removeEventListener';
            document[fn]('keydown', this.onKeyDown);
            document[fn]('keyup', this.onKeyUp);
            document[fn]('mousemove', this.onMouseMove);
            this.canvas[fn]('mousedown', this.onMouseDown);
            document[fn]('mouseup', this.onMouseUp);
            this.canvas[fn]('contextmenu', this.onContextMenu);
        }

        /* ---------- bots ---------- */
        spawnBot() {
            const T = window.THREE;
            const g = new T.Group();
            const bodyMat = new T.MeshLambertMaterial({ color: 0x3f6fd8 });
            const headMat = new T.MeshLambertMaterial({ color: 0xff8a3d });

            const body = new T.Mesh(new T.BoxGeometry(0.7, 1.15, 0.45), bodyMat);
            body.position.y = 0.95;
            const head = new T.Mesh(new T.BoxGeometry(0.42, 0.42, 0.42), headMat);
            head.position.y = 1.78;
            const legs = new T.Mesh(new T.BoxGeometry(0.6, 0.8, 0.4), bodyMat);
            legs.position.y = 0.4;
            g.add(body, head, legs);

            let x, z;
            let tries = 0;
            do {
                x = (Math.random() - 0.5) * 90;
                z = (Math.random() - 0.5) * 90;
                tries++;
            } while (tries < 30 && Math.hypot(x - this.player.pos.x, z - this.player.pos.z) < 14);

            g.position.set(x, 0, z);
            this.scene.add(g);

            const bot = {
                group: g, head, body,
                hp: 100,
                dir: Math.random() * Math.PI * 2,
                speed: 1.6 + Math.random() * 2.4,
                changeIn: 1 + Math.random() * 2,
                alive: true,
            };
            this.bots.push(bot);
            return bot;
        }

        killBot(bot) {
            bot.alive = false;
            this.scene.remove(bot.group);
            const i = this.bots.indexOf(bot);
            if (i !== -1) this.bots.splice(i, 1);
            setTimeout(() => { if (this.running) this.spawnBot(); }, 350);
        }

        /* ---------- weapons ---------- */
        setWeapon(id) {
            if (!WEAPONS[id] || this.weapon.id === id) return;
            this.weapon.id = id;
            this.weapon.ammo = WEAPONS[id].mag;
            this.weapon.reloading = 0;
            cfg.weapon = id;
            saveCfg();
            this.buildViewmodel();
            this.syncMenu();
            this.updateHud();
        }

        reload() {
            const w = WEAPONS[this.weapon.id];
            if (this.weapon.reloading > 0 || this.weapon.ammo === w.mag) return;
            this.weapon.reloading = w.reload;
        }

        /** Pick the best aimbot target inside the configured FOV cone. */
        pickTarget() {
            const T = window.THREE;
            const eye = this.player.pos;
            const fwd = this.forward();
            let best = null;
            let bestDot = Math.cos((cfg.aimFov * Math.PI) / 180);

            for (const bot of this.bots) {
                if (!bot.alive) continue;
                const p = this.aimPoint(bot);
                const dir = new T.Vector3().subVectors(p, eye).normalize();
                const dot = dir.dot(fwd);
                if (dot > bestDot) { bestDot = dot; best = bot; }
            }
            return best;
        }

        aimPoint(bot) {
            const T = window.THREE;
            const p = bot.group.position;
            const y = cfg.aimBone === 'head' ? 1.78 : 0.95;
            return new T.Vector3(p.x, p.y + y, p.z);
        }

        forward() {
            const T = window.THREE;
            return new T.Vector3(
                Math.sin(this.player.yaw) * Math.cos(this.player.pitch),
                Math.sin(this.player.pitch),
                Math.cos(this.player.yaw) * Math.cos(this.player.pitch)
            ).normalize();
        }

        shoot() {
            const T = window.THREE;
            const w = WEAPONS[this.weapon.id];
            if (this.weapon.reloading > 0) return;
            if (this.weapon.ammo <= 0) { this.reload(); return; }

            this.weapon.ammo--;
            this.weapon.cooldown = 60 / w.rpm;
            this.stats.shots++;

            const eye = this.player.pos.clone();
            let dir = this.forward();

            // Silent aim: the bullet goes to the target even though the view doesn't move.
            const target = cfg.aimEnabled || cfg.silentAim ? this.pickTarget() : null;
            if (cfg.silentAim && target) {
                dir = new T.Vector3().subVectors(this.aimPoint(target), eye).normalize();
            } else {
                dir = dir.clone();
                // Aiming down sights tightens the cone to a third.
                const spread = w.spread * (1 - (this.adsT || 0) * 0.66);
                dir.x += (Math.random() - 0.5) * spread;
                dir.y += (Math.random() - 0.5) * spread;
                dir.z += (Math.random() - 0.5) * spread;
                dir.normalize();
            }

            // Viewmodel punch, softened while braced in ADS.
            this.vmKick = 0.055 * (1 - (this.adsT || 0) * 0.5);

            // hit test against bots
            this.raycaster.set(eye, dir);
            this.raycaster.far = 300;
            const meshes = [];
            this.bots.forEach((b) => { if (b.alive) { meshes.push(b.head, b.body); } });
            const hits = this.raycaster.intersectObjects(meshes, false);

            let end = eye.clone().add(dir.clone().multiplyScalar(120));

            if (hits.length) {
                const hit = hits[0];
                end = hit.point.clone();
                const bot = this.bots.find((b) => b.head === hit.object || b.body === hit.object);
                if (bot) {
                    const isHead = hit.object === bot.head;
                    bot.hp -= w.dmg * (isHead ? 2.2 : 1);
                    this.stats.hits++;
                    this.hitMarker(isHead);
                    if (bot.hp <= 0) {
                        const gained = Math.round((isHead ? 150 : 100) * w.score);
                        this.stats.score += gained;
                        this.killBot(bot);
                        this.popup(isHead ? 'HEADSHOT +' + gained : '+' + gained, isHead);
                    }
                }
            }

            if (cfg.showTracers) this.tracers.push({ a: eye.clone(), b: end, life: 0.09 });
            this.recoil = 0.012;
            this.updateHud();
        }

        /* ---------- viewmodel ----------
           Built from primitives rather than a downloaded model: it is the same
           blocky look the reference uses, costs no extra network request, and
           cannot break if a third-party asset host goes away. Parented to the
           camera so it inherits look rotation for free. */
        buildViewmodel() {
            const T = window.THREE;
            if (this.vm) { this.camera.remove(this.vm); }

            const gold = 0xffb800;
            const body = new T.MeshLambertMaterial({ color: 0x15161c });
            const accent = new T.MeshLambertMaterial({ color: gold });
            const dark = new T.MeshLambertMaterial({ color: 0x0a0b0f });

            const g = new T.Group();
            const add = (geo, mat, x, y, z) => {
                const m = new T.Mesh(geo, mat);
                m.position.set(x, y, z);
                g.add(m);
                return m;
            };

            const id = this.weapon.id;
            const long = id === 'sniper' ? 1.35 : id === 'smg' ? 0.72 : 1.0;

            add(new T.BoxGeometry(0.09, 0.11, long), body, 0, 0, -long / 2);          // receiver
            add(new T.BoxGeometry(0.05, 0.05, long * 0.75), dark, 0, 0.02, -long * 1.05); // barrel
            add(new T.BoxGeometry(0.08, 0.17, 0.1), body, 0, -0.12, 0.04);            // grip
            add(new T.BoxGeometry(0.07, 0.12, 0.16), dark, 0, -0.09, -long * 0.42);   // magazine
            add(new T.BoxGeometry(0.1, 0.035, 0.26), accent, 0, 0.075, -long * 0.35); // rail accent

            if (id === 'sniper') {
                add(new T.CylinderGeometry(0.035, 0.035, 0.34, 12), dark, 0, 0.11, -long * 0.45)
                    .rotation.x = Math.PI / 2;                                        // scope tube
            }

            // Bottom-right rest pose, and the centred pose used while aiming.
            g.position.set(0.17, -0.16, -0.36);
            this.vmRest = g.position.clone();
            this.vmAds = new T.Vector3(0, -0.085, -0.28);
            this.vm = g;
            this.camera.add(g);
            // Camera children only render when the camera is in the graph.
            if (!this.camera.parent) this.scene.add(this.camera);
        }

        updateViewmodel(dt) {
            if (!this.vm) return;
            const T = window.THREE;
            const p = this.player;
            const w = WEAPONS[this.weapon.id];
            const t = this.adsT || 0;

            // Scoped optics hide the gun entirely, as a real scope would.
            this.vm.visible = !(w.scoped && t > 0.6);

            this._bob = (this._bob || 0) + dt * (p.onGround ? Math.hypot(p.vel.x, p.vel.z) * 0.9 : 0);
            const bobAmt = (1 - t) * 0.012;
            const sway = (1 - t) * 0.02;

            const target = this.vmRest.clone().lerp(this.vmAds, t);
            target.x += Math.cos(this._bob) * bobAmt + (this._swayX || 0) * sway;
            target.y += Math.abs(Math.sin(this._bob)) * bobAmt + (this._swayY || 0) * sway;
            target.z += (this.vmKick || 0);

            this.vm.position.lerp(target, Math.min(1, dt * 16));
            this.vm.rotation.z = (this._swayX || 0) * 0.4 * (1 - t);
            this.vmKick = (this.vmKick || 0) * Math.max(0, 1 - dt * 9);
        }

        /* ---------- grapple ---------- */
        fireGrapple() {
            if (this.player.grappleCd > 0) return;
            this.raycaster.set(this.player.pos, this.forward());
            this.raycaster.far = 60;
            const hits = this.raycaster.intersectObjects(this.colliders.map((c) => c.mesh), false);
            if (!hits.length) return;
            const p = this.player;
            p.grapple = hits[0].point.clone();
            p.grappleCd = 1.2;
            p.onGround = false;
            // Fired from the ground, the very next physics step re-grounded the
            // player and resolve() cleared p.grapple on the same frame, so the
            // grapple appeared to do nothing at all. Kick the player off the
            // floor and hold a short grace window where landing cannot cancel it.
            p.vel.y = Math.max(p.vel.y, 6.2);
            p.grappleGrace = 0.3;
            this.flashGrapple = 0.18;
        }

        /* ---------- loop ---------- */
        start(mode) {
            this.mode = mode === 'deploy' ? 'deploy' : 'freeplay';
            this.stats = { score: 0, hits: 0, shots: 0, time: this.mode === 'deploy' ? 60 : 0 };
            this.player.pos.set(0, 1.7, 44);
            this.player.vel.set(0, 0, 0);
            this.player.yaw = Math.PI;
            this.player.pitch = 0;
            this.weapon.ammo = WEAPONS[this.weapon.id].mag;
            this.weapon.reloading = 0;

            this.bots.forEach((b) => this.scene.remove(b.group));
            this.bots = [];
            for (let i = 0; i < 6; i++) this.spawnBot();

            this.running = true;
            this.bindEvents(true);
            this.clock.last = performance.now();
            this.updateHud();
            this.toggleMenu(false);
            launchEl.hidden = true;
            document.getElementById('range-hud').hidden = false;
            this.lock();
            if (!this._raf) this.loop();
        }

        stop() {
            this.running = false;
            this.bindEvents(false);
            document.exitPointerLock?.();
            cancelAnimationFrame(this._raf);
            this._raf = null;
        }

        endRun() {
            const acc = this.stats.shots ? Math.round((this.stats.hits / this.stats.shots) * 100) : 0;
            const top = addScore({ score: this.stats.score, acc, weapon: WEAPONS[this.weapon.id].name, at: Date.now() });
            this.stop();
            shell.classList.remove('is-live');
            launchEl.hidden = false;
            document.getElementById('range-hud').hidden = true;
            renderLeaderboard();

            const res = document.getElementById('range-result');
            if (res) {
                const best = top[0] && top[0].score === this.stats.score && top[0].at;
                res.hidden = false;
                res.innerHTML = `<strong>Run over</strong>
                    <span>${this.stats.score} pts · ${acc}% accuracy · ${this.stats.hits}/${this.stats.shots} hits</span>
                    ${best ? '<em>New personal best</em>' : ''}`;
            }
        }

        loop() {
            this._raf = requestAnimationFrame(() => this.loop());
            const now = performance.now();
            let dt = (now - this.clock.last) / 1000;
            this.clock.last = now;
            dt = Math.min(dt, 0.05);
            // render() needs dt for the ADS ease and viewmodel motion, and it
            // also runs while paused, so keep it on the instance.
            this._dt = dt;

            if (this.running && !this.menuOpen) this.update(dt);
            this.render();
        }

        update(dt) {
            const p = this.player;
            const w = WEAPONS[this.weapon.id];

            // timer
            if (this.mode === 'deploy') {
                this.stats.time -= dt;
                if (this.stats.time <= 0) { this.stats.time = 0; this.endRun(); return; }
            } else {
                this.stats.time += dt;
            }

            // reload
            if (this.weapon.reloading > 0) {
                this.weapon.reloading -= dt;
                if (this.weapon.reloading <= 0) { this.weapon.ammo = w.mag; this.updateHud(); }
            }

            // aimbot (visible): rotate the view toward the target
            if (cfg.aimEnabled && !cfg.silentAim && this.firing) {
                const t = this.pickTarget();
                if (t) {
                    const to = this.aimPoint(t).sub(p.pos);
                    const wantYaw = Math.atan2(to.x, to.z);
                    const wantPitch = Math.atan2(to.y, Math.hypot(to.x, to.z));
                    const s = 1 - Math.pow(1 - Math.min(0.95, cfg.aimSmooth), dt * 60);
                    p.yaw += angleDelta(p.yaw, wantYaw) * s;
                    p.pitch += (wantPitch - p.pitch) * s;
                }
            }

            // firing
            this.weapon.cooldown -= dt;
            if (this.firing && this.weapon.cooldown <= 0) {
                this.shoot();
                if (!w.auto) this.firing = false;
            }

            // movement
            const speed = this.keys.ShiftLeft ? 9.5 : 6.4;
            const fwd = new window.THREE.Vector3(Math.sin(p.yaw), 0, Math.cos(p.yaw));
            const right = new window.THREE.Vector3(Math.sin(p.yaw - Math.PI / 2), 0, Math.cos(p.yaw - Math.PI / 2));
            const wish = new window.THREE.Vector3();
            if (this.keys.KeyW) wish.add(fwd);
            if (this.keys.KeyS) wish.sub(fwd);
            if (this.keys.KeyD) wish.add(right);
            if (this.keys.KeyA) wish.sub(right);
            if (wish.lengthSq() > 0) wish.normalize();

            p.sliding = !!this.keys.ControlLeft && p.onGround;
            const accel = p.onGround ? 55 : 14;
            const target = wish.multiplyScalar(p.sliding ? speed * 1.5 : speed);
            p.vel.x += (target.x - p.vel.x) * Math.min(1, accel * dt);
            p.vel.z += (target.z - p.vel.z) * Math.min(1, accel * dt);

            // grapple pull
            if (p.grappleCd > 0) p.grappleCd -= dt;
            if (p.grappleGrace > 0) p.grappleGrace -= dt;
            if (p.grapple) {
                const to = new window.THREE.Vector3().subVectors(p.grapple, p.pos);
                const dist = to.length();
                if (dist < 2.4) { p.grapple = null; }
                else {
                    to.normalize().multiplyScalar(26);
                    p.vel.lerp(to, Math.min(1, dt * 4.5));
                }
            }

            // gravity
            p.vel.y -= 22 * dt;

            // integrate + collide
            const next = p.pos.clone().addScaledVector(p.vel, dt);
            this.resolve(p, next, dt);

            p.height = p.sliding ? 1.05 : 1.7;

            // bots wander
            for (const bot of this.bots) {
                bot.changeIn -= dt;
                if (bot.changeIn <= 0) { bot.dir = Math.random() * Math.PI * 2; bot.changeIn = 1 + Math.random() * 2.5; }
                const bx = bot.group.position.x + Math.sin(bot.dir) * bot.speed * dt;
                const bz = bot.group.position.z + Math.cos(bot.dir) * bot.speed * dt;
                if (Math.abs(bx) < 50) bot.group.position.x = bx; else bot.dir += Math.PI;
                if (Math.abs(bz) < 50) bot.group.position.z = bz; else bot.dir += Math.PI;
                bot.group.rotation.y = bot.dir;
            }

            // tracers
            for (let i = this.tracers.length - 1; i >= 0; i--) {
                this.tracers[i].life -= dt;
                if (this.tracers[i].life <= 0) this.tracers.splice(i, 1);
            }

            if (this.recoil) this.recoil = Math.max(0, this.recoil - dt * 0.09);
            this.updateTimer();
        }

        /** Very small AABB resolve — enough to stop the player walking through cover. */
        resolve(p, next, dt) {
            const r = 0.42;
            for (const c of this.colliders) {
                const hw = c.w / 2 + r, hd = c.d / 2 + r;
                const top = c.y + c.h / 2;
                const dx = next.x - c.x, dz = next.z - c.z;
                if (Math.abs(dx) < hw && Math.abs(dz) < hd) {
                    const feet = next.y - p.height;
                    if (feet < top && feet > top - 1.2 && p.vel.y <= 0) {
                        next.y = top + p.height;
                        p.vel.y = 0;
                        p.onGround = true;
                        if (!(p.grappleGrace > 0)) p.grapple = null;
                        continue;
                    }
                    if (feet < top) {
                        // push out on the shallower axis
                        const ox = hw - Math.abs(dx), oz = hd - Math.abs(dz);
                        if (ox < oz) { next.x = c.x + Math.sign(dx) * hw; p.vel.x = 0; }
                        else { next.z = c.z + Math.sign(dz) * hd; p.vel.z = 0; }
                    }
                }
            }

            if (next.y - p.height <= 0) {
                next.y = p.height; p.vel.y = 0; p.onGround = true;
                if (!(p.grappleGrace > 0)) p.grapple = null;
            }
            else if (next.y - p.height > 0.05) p.onGround = false;

            next.x = Math.max(-53, Math.min(53, next.x));
            next.z = Math.max(-53, Math.min(53, next.z));
            p.pos.copy(next);
        }

        /* ---------- render ---------- */
        render() {
            const p = this.player;
            // Ease between hip FOV and the weapon's ADS FOV. adsT also drives
            // the viewmodel position and look sensitivity, so one value keeps
            // zoom, gun placement and aim feel in step.
            const w = WEAPONS[this.weapon.id];
            const target = this.ads ? (w.adsFov || 50) : cfg.fov;
            this.adsT = this.adsT == null ? 0 : this.adsT;
            this.adsT += ((this.ads ? 1 : 0) - this.adsT) * Math.min(1, (this._dt || 0.016) * 12);
            this.camera.fov = cfg.fov + (target - cfg.fov) * this.adsT;
            this.camera.updateProjectionMatrix();
            this.updateViewmodel(this._dt || 0.016);
            this.camera.position.copy(p.pos);
            this.camera.rotation.set(0, 0, 0);
            // three's camera looks down -Z; the rest of the game uses
            // (sin yaw, cos yaw), so offset by PI to keep them in sync.
            this.camera.rotateY(p.yaw + Math.PI);
            this.camera.rotateX(p.pitch + (this.recoil || 0));
            this.renderer.render(this.scene, this.camera);
            this.drawOverlay();
        }

        drawOverlay() {
            const ctx = this.octx;
            const W = this.overlay.width, H = this.overlay.height;
            ctx.clearRect(0, 0, W, H);
            if (!this.running) return;

            const dpr = Math.min(devicePixelRatio, 2);
            ctx.save();
            ctx.scale(dpr, dpr);
            const w = W / dpr, h = H / dpr;


            // tracers
            if (cfg.showTracers) {
                ctx.strokeStyle = 'rgba(255,184,0,0.75)';
                ctx.lineWidth = 1.2;
                for (const t of this.tracers) {
                    const a = this.project(t.a, w, h), b = this.project(t.b, w, h);
                    if (!a || !b) continue;
                    ctx.globalAlpha = Math.max(0, t.life / 0.09);
                    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
                }
                ctx.globalAlpha = 1;
            }

            // ESP
            for (const bot of this.bots) {
                if (!bot.alive) continue;
                const base = bot.group.position;
                const feet = this.project({ x: base.x, y: base.y, z: base.z }, w, h);
                const head = this.project({ x: base.x, y: base.y + 2.05, z: base.z }, w, h);
                if (!feet || !head) continue;

                const bh = feet.y - head.y;
                const bw = bh * 0.46;
                const x = head.x - bw / 2, y = head.y;
                const dist = Math.round(this.player.pos.distanceTo(base));

                if (cfg.espSnaplines) {
                    ctx.strokeStyle = 'rgba(255,184,0,0.35)';
                    ctx.lineWidth = 1;
                    ctx.beginPath(); ctx.moveTo(w / 2, h); ctx.lineTo(feet.x, feet.y); ctx.stroke();
                }

                if (cfg.espBox) {
                    ctx.strokeStyle = '#FFB800';
                    ctx.lineWidth = 1.5;
                    ctx.strokeRect(x, y, bw, bh);
                    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
                    ctx.lineWidth = 3;
                    ctx.strokeRect(x - 1.2, y - 1.2, bw + 2.4, bh + 2.4);
                }

                if (cfg.espHealth) {
                    const hp = Math.max(0, bot.hp) / 100;
                    ctx.fillStyle = 'rgba(0,0,0,0.6)';
                    ctx.fillRect(x - 6, y, 3, bh);
                    ctx.fillStyle = hp > 0.5 ? '#39d98a' : hp > 0.25 ? '#ffb800' : '#ff5b5b';
                    ctx.fillRect(x - 6, y + bh * (1 - hp), 3, bh * hp);
                }

                ctx.textAlign = 'center';
                ctx.font = '600 11px Inter, system-ui, sans-serif';
                if (cfg.espName) {
                    ctx.fillStyle = 'rgba(0,0,0,0.75)';
                    ctx.fillText('BOT', head.x + 1, y - 5);
                    ctx.fillStyle = '#fff';
                    ctx.fillText('BOT', head.x, y - 6);
                }
                if (cfg.espDistance) {
                    ctx.fillStyle = 'rgba(0,0,0,0.75)';
                    ctx.fillText(dist + 'm', feet.x + 1, feet.y + 13);
                    ctx.fillStyle = '#FFB800';
                    ctx.fillText(dist + 'm', feet.x, feet.y + 12);
                }
            }

            // aimbot FOV circle
            if (cfg.aimEnabled) {
                const r = Math.tan((cfg.aimFov * Math.PI) / 360) / Math.tan((cfg.fov * Math.PI) / 360) * (h / 2);
                ctx.strokeStyle = 'rgba(255,184,0,0.28)';
                ctx.lineWidth = 1;
                ctx.beginPath(); ctx.arc(w / 2, h / 2, Math.min(r, h), 0, Math.PI * 2); ctx.stroke();
            }

            // crosshair
            if (cfg.crosshair) {
                ctx.strokeStyle = '#FFB800';
                ctx.lineWidth = 1.5;
                const g = 4, len = 8, cx = w / 2, cy = h / 2;
                ctx.beginPath();
                ctx.moveTo(cx - g - len, cy); ctx.lineTo(cx - g, cy);
                ctx.moveTo(cx + g, cy); ctx.lineTo(cx + g + len, cy);
                ctx.moveTo(cx, cy - g - len); ctx.lineTo(cx, cy - g);
                ctx.moveTo(cx, cy + g); ctx.lineTo(cx, cy + g + len);
                ctx.stroke();
            }

            // hitmarker
            if (this.hitAt && performance.now() - this.hitAt < 180) {
                const cx = w / 2, cy = h / 2;
                ctx.strokeStyle = this.hitHead ? '#ff5b5b' : '#fff';
                ctx.lineWidth = 2;
                ctx.beginPath();
                [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sy]) => {
                    ctx.moveTo(cx + sx * 6, cy + sy * 6);
                    ctx.lineTo(cx + sx * 12, cy + sy * 12);
                });
                ctx.stroke();
            }

            // Sniper optic: black surround with a thin reticle, drawn over
            // everything else so it reads as looking through glass.
            const wpn = WEAPONS[this.weapon.id];
            const scopeT = wpn.scoped ? (this.adsT || 0) : 0;
            if (scopeT > 0.6) {
                const a = (scopeT - 0.6) / 0.4;
                const r = Math.min(w, h) * 0.36;
                ctx.save();
                ctx.globalAlpha = a;
                ctx.fillStyle = '#000';
                ctx.beginPath();
                ctx.rect(0, 0, w, h);
                ctx.arc(w / 2, h / 2, r, 0, Math.PI * 2, true);
                ctx.fill('evenodd');

                ctx.strokeStyle = 'rgba(255,184,0,0.55)';
                ctx.lineWidth = 1.5;
                ctx.beginPath(); ctx.arc(w / 2, h / 2, r, 0, Math.PI * 2); ctx.stroke();

                ctx.strokeStyle = 'rgba(255,255,255,0.75)';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(w / 2 - r, h / 2); ctx.lineTo(w / 2 - 10, h / 2);
                ctx.moveTo(w / 2 + 10, h / 2); ctx.lineTo(w / 2 + r, h / 2);
                ctx.moveTo(w / 2, h / 2 - r); ctx.lineTo(w / 2, h / 2 - 10);
                ctx.moveTo(w / 2, h / 2 + 10); ctx.lineTo(w / 2, h / 2 + r);
                ctx.stroke();
                ctx.restore();
            }

            ctx.restore();
        }

        /** World point -> screen point (null when behind the camera). */
        project(v, w, h) {
            const T = window.THREE;
            const p = new T.Vector3(v.x, v.y, v.z).project(this.camera);
            if (p.z > 1) return null;
            return { x: (p.x * 0.5 + 0.5) * w, y: (-p.y * 0.5 + 0.5) * h };
        }

        hitMarker(head) { this.hitAt = performance.now(); this.hitHead = head; }

        popup(text, big) {
            const el = document.getElementById('range-popups');
            if (!el) return;
            const d = document.createElement('div');
            d.className = 'range-popup' + (big ? ' is-head' : '');
            d.textContent = text;
            el.appendChild(d);
            setTimeout(() => d.remove(), 900);
        }

        toast(text) {
            const el = document.getElementById('range-toast');
            if (!el) return;
            el.textContent = text;
            el.classList.add('show');
            clearTimeout(this._toastT);
            this._toastT = setTimeout(() => el.classList.remove('show'), 1100);
        }

        /* ---------- hud ---------- */
        buildHud() {
            this.hud = {
                score: document.getElementById('range-score'),
                sub: document.getElementById('range-sub'),
                timer: document.getElementById('range-timer'),
                ammo: document.getElementById('range-ammo'),
                mag: document.getElementById('range-mag'),
                weapons: document.querySelectorAll('.range-weapon'),
            };
            document.querySelectorAll('.range-weapon').forEach((b) => {
                b.addEventListener('click', () => this.setWeapon(b.dataset.weapon));
            });
        }

        updateHud() {
            const w = WEAPONS[this.weapon.id];
            if (this.hud.score) this.hud.score.textContent = this.stats.score;
            if (this.hud.sub) {
                const acc = this.stats.shots ? Math.round((this.stats.hits / this.stats.shots) * 100) : 0;
                this.hud.sub.textContent = `${this.stats.hits} hits · ${this.stats.shots} shots · ${acc}%`;
            }
            if (this.hud.ammo) this.hud.ammo.textContent = this.weapon.reloading > 0 ? '–' : this.weapon.ammo;
            if (this.hud.mag) this.hud.mag.textContent = '/ ' + w.mag;
            this.hud.weapons.forEach((b) => b.classList.toggle('is-active', b.dataset.weapon === this.weapon.id));
        }

        updateTimer() {
            if (!this.hud.timer) return;
            const t = this.stats.time;
            this.hud.timer.textContent = this.mode === 'deploy'
                ? t.toFixed(1) + 's'
                : Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0');
            this.hud.timer.classList.toggle('is-low', this.mode === 'deploy' && t < 10);
        }

        /* ---------- cheat menu ---------- */
        toggleMenu(force) {
            const el = document.getElementById('range-menu');
            if (!el) return;
            this.menuOpen = typeof force === 'boolean' ? force : !this.menuOpen;
            el.hidden = !this.menuOpen;
            if (this.menuOpen) { document.exitPointerLock?.(); this.syncMenu(); }
            else if (this.running) this.lock();
        }

        syncMenu() {
            document.querySelectorAll('[data-cfg]').forEach((input) => {
                const key = input.dataset.cfg;
                if (input.type === 'checkbox') input.checked = !!cfg[key];
                else if (input.type === 'range') {
                    input.value = cfg[key];
                    const out = input.parentElement.querySelector('output');
                    if (out) out.textContent = input.dataset.suffix ? cfg[key] + input.dataset.suffix : cfg[key];
                } else if (input.tagName === 'BUTTON') {
                    input.classList.toggle('is-active', String(cfg[key]) === input.dataset.value);
                }
            });
            document.querySelectorAll('.range-weapon').forEach((b) => b.classList.toggle('is-active', b.dataset.weapon === this.weapon.id));
        }
    }

    function angleDelta(from, to) {
        let d = (to - from) % (Math.PI * 2);
        if (d > Math.PI) d -= Math.PI * 2;
        if (d < -Math.PI) d += Math.PI * 2;
        return d;
    }

    Range.prototype.resize = function () {
        const rect = shell.getBoundingClientRect();
        const w = rect.width, h = rect.height;
        const dpr = Math.min(devicePixelRatio, 2);
        if (this.renderer) {
            this.renderer.setSize(w, h, false);
            this.camera.aspect = w / h;
            this.camera.updateProjectionMatrix();
        }
        this.overlay.width = w * dpr;
        this.overlay.height = h * dpr;
        this.overlay.style.width = w + 'px';
        this.overlay.style.height = h + 'px';
    };

    /* ---------------- wiring ---------------- */
    shell.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const action = btn.dataset.action;

        if (action === 'fullscreen') {
            if (document.fullscreenElement) document.exitFullscreen();
            else shell.requestFullscreen?.();
            return;
        }
        if (action === 'cheats') {
            if (!game) { boot('freeplay'); setTimeout(() => game && game.toggleMenu(true), 900); }
            else game.toggleMenu(true);
            return;
        }
        if (action === 'close-menu') { game && game.toggleMenu(false); return; }
        if (action === 'quit') { game && game.endRun(); return; }
        boot(action);
    });

    // cheat menu inputs
    document.addEventListener('input', (e) => {
        const key = e.target.dataset && e.target.dataset.cfg;
        if (!key) return;
        if (e.target.type === 'checkbox') cfg[key] = e.target.checked;
        else if (e.target.type === 'range') {
            cfg[key] = parseFloat(e.target.value);
            const out = e.target.parentElement.querySelector('output');
            if (out) out.textContent = e.target.dataset.suffix ? cfg[key] + e.target.dataset.suffix : cfg[key];
        }
        saveCfg();
    });

    document.addEventListener('click', (e) => {
        const b = e.target.closest('button[data-cfg][data-value]');
        if (!b) return;
        const key = b.dataset.cfg;
        cfg[key] = b.dataset.value === 'true' ? true : b.dataset.value === 'false' ? false : b.dataset.value;
        saveCfg();
        if (game) game.syncMenu();
    });

    // menu tabs
    document.addEventListener('click', (e) => {
        const tab = e.target.closest('.range-tab');
        if (!tab) return;
        document.querySelectorAll('.range-tab').forEach((t) => t.classList.toggle('is-active', t === tab));
        document.querySelectorAll('.range-pane').forEach((p) => { p.hidden = p.dataset.pane !== tab.dataset.tab; });
    });

    if (isTouch) shell.classList.add('is-touch');
})();
