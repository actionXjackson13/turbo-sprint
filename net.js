// Multiplayer transport. Players connect directly to each other over WebRTC data
// channels; the only thing that touches a third party is the handshake.
//
// There's no backend here — the game is static files on GitHub Pages — so we use
// the public PeerJS cloud as a *dumb signalling relay*. It just forwards a JSON
// message from one registered id to another, and never sees the payload shape we
// choose or any gameplay traffic. That's why this file talks to it with a plain
// WebSocket instead of pulling in the PeerJS client library: we need about 5% of
// what that library does, and this keeps the project dependency-free.
//
// Topology is a star. The host is the authority: guests report their own position
// to the host, and the host echoes everyone's positions back out. Fine for a
// handful of friends; there's deliberately no anti-cheat.
const Net = {
    SIGNAL_HOST: 'wss://0.peerjs.com/peerjs?key=peerjs&version=1.5.4',
    ICE: { iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:global.stun.twilio.com:3478' }
    ] },

    ID_PREFIX: 'turbosprint-',
    CODE_CHARS: 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789',   // no I/O/0/1, they get misread aloud
    CODE_LEN: 4,

    POS_HZ: 15,
    JOIN_TIMEOUT: 12000,
    FINISH_GRACE: 12000,   // once someone finishes, how long the rest get
    RACE_LIMIT: 90000,     // hard stop, in case nobody finishes at all

    PALETTE: [
        { light: '#5cc8ff', dark: '#1667c4' },
        { light: '#ff7d6b', dark: '#c02a1c' },
        { light: '#a97dff', dark: '#5a2ec0' },
        { light: '#7dffb0', dark: '#1f9a55' },
        { light: '#ffd24a', dark: '#c08a00' },
        { light: '#ff8ad8', dark: '#b31f86' }
    ],
    MAX_PLAYERS: 6,

    /* ------------------------------------------------------------- state -- */

    active: false,
    role: null,        // 'host' | 'guest'
    code: null,
    myId: null,
    myName: '',
    players: [],       // [{ id, name, lane, colors, x, speed, finishTime, isMe }]
    ws: null,
    peers: new Map(),  // remote id -> { pc, ch }
    handlers: {},      // set by game.js
    lastSent: 0,
    heartbeat: null,
    joinTimer: null,
    pendingIce: new Map(),
    connIds: new Map(),   // remote id -> the signalling connectionId we agreed on

    /* ------------------------------------------------------------ helpers -- */

    randomCode() {
        let s = '';
        for (let i = 0; i < this.CODE_LEN; i++) {
            s += this.CODE_CHARS[Math.floor(Math.random() * this.CODE_CHARS.length)];
        }
        return s;
    },

    randomId() {
        return this.ID_PREFIX + 'g-' + Math.random().toString(36).slice(2, 10);
    },

    emit(name, data) {
        const fn = this.handlers[name];
        if (fn) fn(data);
    },

    me() { return this.players.find(p => p.isMe); },

    // Assigns lanes and colours in join order so every client agrees.
    reindex() {
        this.players.forEach((p, i) => {
            p.lane = i;
            p.colors = this.PALETTE[i % this.PALETTE.length];
        });
    },

    /* --------------------------------------------------------- signalling -- */

    openSignal(id) {
        return new Promise((resolve, reject) => {
            const token = Math.random().toString(36).slice(2);
            const url = `${this.SIGNAL_HOST}&id=${encodeURIComponent(id)}&token=${token}`;
            let settled = false;
            const ws = new WebSocket(url);

            ws.onmessage = (ev) => {
                let msg;
                try { msg = JSON.parse(ev.data); } catch (e) { return; }

                if (msg.type === 'OPEN') {
                    settled = true;
                    this.ws = ws;
                    this.myId = id;
                    this.heartbeat = setInterval(() => {
                        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'HEARTBEAT' }));
                    }, 20000);
                    resolve(ws);
                    return;
                }
                if (msg.type === 'ID-TAKEN') {
                    settled = true;
                    ws.close();
                    reject(new Error('ID-TAKEN'));
                    return;
                }
                this.onSignal(msg);
            };

            ws.onerror = () => { if (!settled) { settled = true; reject(new Error('SIGNAL-FAILED')); } };
            ws.onclose = () => {
                if (!settled) { settled = true; reject(new Error('SIGNAL-CLOSED')); return; }
                if (this.active) this.emit('error', 'Lost connection to the matchmaking server.');
            };
        });
    },

    // The relay validates the shape of what it forwards and hangs up on anything
    // that doesn't look like the official PeerJS client — a minimal
    // `{sdp}` payload gets the socket closed with no error message. So every
    // signalling payload carries the fields that client would send. Only `sdp`,
    // `candidate` and `connectionId` are actually load-bearing for us; the rest is
    // there to get past the door.
    signalSend(type, dst, payload) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        const connectionId = this.connIds.get(dst) || this.newConnId(dst);
        this.ws.send(JSON.stringify({
            type,
            dst,
            payload: Object.assign({
                type: 'data',
                connectionId,
                label: connectionId,
                reliable: true,
                serialization: 'json',
                metadata: null,
                browser: 'Chrome'
            }, payload)
        }));
    },

    newConnId(dst) {
        const id = 'dc_' + Math.random().toString(36).slice(2, 11);
        this.connIds.set(dst, id);
        return id;
    },

    onSignal(msg) {
        const src = msg.src;
        if (!src) return;

        if (msg.type === 'OFFER') {
            if (this.role !== 'host') return;
            // Answer on the same connectionId the guest opened with.
            if (msg.payload && msg.payload.connectionId) this.connIds.set(src, msg.payload.connectionId);
            this.acceptOffer(src, msg.payload && msg.payload.sdp);
        } else if (msg.type === 'ANSWER') {
            const entry = this.peers.get(src);
            if (!entry || !msg.payload) return;
            entry.pc.setRemoteDescription(msg.payload.sdp).then(() => this.flushIce(src)).catch(() => {});
        } else if (msg.type === 'CANDIDATE') {
            const entry = this.peers.get(src);
            const cand = msg.payload && msg.payload.candidate;
            if (!cand) return;
            if (!entry || !entry.pc.remoteDescription) {
                if (!this.pendingIce.has(src)) this.pendingIce.set(src, []);
                this.pendingIce.get(src).push(cand);
                return;
            }
            entry.pc.addIceCandidate(cand).catch(() => {});
        } else if (msg.type === 'EXPIRE') {
            // The relay couldn't deliver — almost always a wrong code.
            if (this.role === 'guest') this.emit('error', "No game found with that code.");
        } else if (msg.type === 'LEAVE') {
            this.dropPeer(src);
        }
    },

    flushIce(id) {
        const entry = this.peers.get(id);
        const queued = this.pendingIce.get(id);
        if (!entry || !queued) return;
        for (const c of queued) entry.pc.addIceCandidate(c).catch(() => {});
        this.pendingIce.delete(id);
    },

    newPeerConnection(remoteId) {
        const pc = new RTCPeerConnection(this.ICE);
        pc.onicecandidate = (e) => {
            if (e.candidate) this.signalSend('CANDIDATE', remoteId, { candidate: e.candidate });
        };
        pc.onconnectionstatechange = () => {
            if (['failed', 'closed', 'disconnected'].includes(pc.connectionState)) this.dropPeer(remoteId);
        };
        return pc;
    },

    /* -------------------------------------------------------------- host -- */

    async startHosting(name) {
        this.reset();
        this.active = true;
        this.role = 'host';
        this.myName = name;

        // A code collision just means someone else is already using it.
        let lastErr = null;
        for (let attempt = 0; attempt < 5; attempt++) {
            const code = this.randomCode();
            try {
                await this.openSignal(this.ID_PREFIX + code);
                this.code = code;
                this.players = [{ id: this.myId, name, x: 0, speed: 0, finishTime: null, isMe: true }];
                this.reindex();
                this.emit('lobby', this.lobbyView());
                return code;
            } catch (e) {
                lastErr = e;
                if (e.message !== 'ID-TAKEN') break;
            }
        }
        this.active = false;
        throw lastErr || new Error('SIGNAL-FAILED');
    },

    async acceptOffer(guestId, sdp) {
        if (!sdp) return;
        if (this.players.length >= this.MAX_PLAYERS) return;   // silently full

        const pc = this.newPeerConnection(guestId);
        pc.ondatachannel = (e) => this.wireChannel(guestId, e.channel);
        this.peers.set(guestId, { pc, ch: null });

        try {
            await pc.setRemoteDescription(sdp);
            this.flushIce(guestId);
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            this.signalSend('ANSWER', guestId, { sdp: pc.localDescription });
        } catch (e) {
            this.dropPeer(guestId);
        }
    },

    /* ------------------------------------------------------------- guest -- */

    async joinGame(code, name) {
        this.reset();
        this.active = true;
        this.role = 'guest';
        this.myName = name;
        this.code = code;

        await this.openSignal(this.randomId());

        const hostId = this.ID_PREFIX + code;
        const pc = this.newPeerConnection(hostId);
        const ch = pc.createDataChannel('game', { ordered: true });
        this.peers.set(hostId, { pc, ch });
        this.wireChannel(hostId, ch);

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        this.signalSend('OFFER', hostId, { sdp: pc.localDescription });

        this.joinTimer = setTimeout(() => {
            if (this.active && !this.players.length) {
                this.emit('error', "Couldn't reach that game. Check the code, or the host may be on a network that blocks direct connections.");
                this.leave();
            }
        }, this.JOIN_TIMEOUT);
    },

    /* ------------------------------------------------------ data channels -- */

    wireChannel(remoteId, ch) {
        const entry = this.peers.get(remoteId) || {};
        entry.ch = ch;
        this.peers.set(remoteId, entry);

        ch.onopen = () => {
            if (this.role === 'guest') this.send(remoteId, { t: 'hello', name: this.myName });
        };
        ch.onmessage = (e) => {
            let msg;
            try { msg = JSON.parse(e.data); } catch (err) { return; }
            this.onMessage(remoteId, msg);
        };
        ch.onclose = () => this.dropPeer(remoteId);
    },

    send(remoteId, msg) {
        const entry = this.peers.get(remoteId);
        if (entry && entry.ch && entry.ch.readyState === 'open') {
            entry.ch.send(JSON.stringify(msg));
        }
    },

    broadcast(msg, exceptId) {
        const raw = JSON.stringify(msg);
        for (const [id, entry] of this.peers) {
            if (id === exceptId) continue;
            if (entry.ch && entry.ch.readyState === 'open') entry.ch.send(raw);
        }
    },

    lobbyView() {
        return {
            code: this.code,
            role: this.role,
            players: this.players.map(p => ({ id: p.id, name: p.name, isMe: p.isMe, colors: p.colors }))
        };
    },

    onMessage(from, msg) {
        if (msg.t === 'hello' && this.role === 'host') {
            if (this.players.some(p => p.id === from)) return;
            const name = String(msg.name || 'Racer').slice(0, 12) || 'Racer';
            this.players.push({ id: from, name, x: 0, speed: 0, finishTime: null, isMe: false });
            this.reindex();
            this.pushLobby();
            this.emit('lobby', this.lobbyView());

        } else if (msg.t === 'lobby' && this.role === 'guest') {
            if (this.joinTimer) { clearTimeout(this.joinTimer); this.joinTimer = null; }
            this.players = msg.players.map(p => ({
                ...p, isMe: p.id === this.myId, x: 0, speed: 0, finishTime: null
            }));
            this.reindex();
            this.emit('lobby', this.lobbyView());

        } else if (msg.t === 'start') {
            this.players.forEach(p => { p.x = 0; p.speed = 0; p.finishTime = null; });
            this.emit('start', { mapId: msg.mapId, level: msg.level });

        } else if (msg.t === 'pos' && this.role === 'host') {
            const p = this.players.find(q => q.id === from);
            if (p) { p.x = msg.x; p.speed = msg.speed; }

        } else if (msg.t === 'state' && this.role === 'guest') {
            for (const row of msg.p) {
                const p = this.players.find(q => q.id === row[0]);
                if (p && !p.isMe) { p.x = row[1]; p.speed = row[2]; }
            }

        } else if (msg.t === 'done' && this.role === 'host') {
            const p = this.players.find(q => q.id === from);
            if (p && p.finishTime === null) {
                p.finishTime = msg.time;
                p.x = Math.max(p.x, Track.LENGTH);
                this.checkAllDone();
            }

        } else if (msg.t === 'results') {
            this.emit('results', msg.standings);
        }
    },

    /* ---------------------------------------------------------- race flow -- */

    pushLobby() {
        if (this.role !== 'host') return;
        this.broadcast({
            t: 'lobby',
            players: this.players.map(p => ({ id: p.id, name: p.name }))
        });
    },

    hostStart(mapId, level) {
        if (this.role !== 'host') return;
        this.players.forEach(p => { p.x = 0; p.speed = 0; p.finishTime = null; });
        this.firstFinishAt = null;
        if (this.graceTimer) { clearTimeout(this.graceTimer); this.graceTimer = null; }
        if (this.watchdog) { clearTimeout(this.watchdog); }

        // Backstop: the grace timer only starts once *somebody* finishes, so if
        // nobody ever does the race would hang. Call it after RACE_LIMIT.
        this.watchdog = setTimeout(() => this.sendResults(), this.RACE_LIMIT);

        this.broadcast({ t: 'start', mapId, level });
        this.emit('start', { mapId, level });
    },

    // Called every frame by the game with the local car's progress.
    reportPosition(x, speed) {
        const me = this.me();
        if (me) { me.x = x; me.speed = speed; }

        const now = performance.now();
        if (now - this.lastSent < 1000 / this.POS_HZ) return;
        this.lastSent = now;

        if (this.role === 'guest') {
            this.broadcast({ t: 'pos', x: Math.round(x), speed: Math.round(speed) });
        } else {
            this.broadcast({
                t: 'state',
                p: this.players.map(p => [p.id, Math.round(p.x), Math.round(p.speed)])
            });
        }
    },

    reportFinish(time) {
        const me = this.me();
        if (me && me.finishTime === null) me.finishTime = time;
        if (this.role === 'guest') {
            this.broadcast({ t: 'done', time });
        } else {
            this.checkAllDone();
        }
    },

    // Host decides when the race is over: everyone home, or the stragglers ran
    // out of grace time. The grace timer is what stops one player who backgrounded
    // the app — which freezes their game loop entirely — from hanging the race for
    // everyone else.
    checkAllDone() {
        if (this.role !== 'host') return;
        if (this.players.every(p => p.finishTime !== null)) {
            this.sendResults();
            return;
        }
        if (!this.firstFinishAt && this.players.some(p => p.finishTime !== null)) {
            this.firstFinishAt = performance.now();
            this.graceTimer = setTimeout(() => this.sendResults(), this.FINISH_GRACE);
        }
    },

    sendResults() {
        if (this.role !== 'host' || this.resultsSent) return;
        this.resultsSent = true;
        if (this.graceTimer) { clearTimeout(this.graceTimer); this.graceTimer = null; }
        if (this.watchdog) { clearTimeout(this.watchdog); this.watchdog = null; }

        const standings = [...this.players].sort((a, b) => {
            if (a.finishTime !== null && b.finishTime !== null) return a.finishTime - b.finishTime;
            if (a.finishTime !== null) return -1;
            if (b.finishTime !== null) return 1;
            return b.x - a.x;
        }).map(p => ({ id: p.id, name: p.name, time: p.finishTime, x: Math.round(p.x) }));

        this.broadcast({ t: 'results', standings });
        this.emit('results', standings);
    },

    armRace() { this.resultsSent = false; this.firstFinishAt = null; },

    /* ------------------------------------------------------------ teardown -- */

    dropPeer(id) {
        const entry = this.peers.get(id);
        if (entry) {
            try { if (entry.ch) entry.ch.close(); } catch (e) { /* ignore */ }
            try { entry.pc.close(); } catch (e) { /* ignore */ }
            this.peers.delete(id);
        }
        this.pendingIce.delete(id);
        if (!this.active) return;

        if (this.role === 'host') {
            const before = this.players.length;
            this.players = this.players.filter(p => p.id !== id);
            if (this.players.length !== before) {
                this.reindex();
                this.pushLobby();
                this.emit('lobby', this.lobbyView());
                this.emit('playerLeft');
            }
        } else if (id === this.ID_PREFIX + this.code) {
            this.emit('error', 'The host left the game.');
            this.leave();
        }
    },

    leave() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            try { this.ws.send(JSON.stringify({ type: 'LEAVE', dst: this.ID_PREFIX + this.code })); } catch (e) { /* ignore */ }
        }
        this.reset();
    },

    reset() {
        this.active = false;
        for (const [, entry] of this.peers) {
            try { if (entry.ch) entry.ch.close(); } catch (e) { /* ignore */ }
            try { entry.pc.close(); } catch (e) { /* ignore */ }
        }
        this.peers.clear();
        this.pendingIce.clear();
        this.connIds.clear();
        if (this.heartbeat) { clearInterval(this.heartbeat); this.heartbeat = null; }
        if (this.joinTimer) { clearTimeout(this.joinTimer); this.joinTimer = null; }
        if (this.graceTimer) { clearTimeout(this.graceTimer); this.graceTimer = null; }
        if (this.watchdog) { clearTimeout(this.watchdog); this.watchdog = null; }
        if (this.ws) { try { this.ws.close(); } catch (e) { /* ignore */ } this.ws = null; }
        this.role = null;
        this.code = null;
        this.myId = null;
        this.players = [];
        this.resultsSent = false;
        this.firstFinishAt = null;
    },

    /* -------------------------------------------------------------- name -- */

    NAME_KEY: 'turboSprint.name',

    loadName() {
        try { return localStorage.getItem(this.NAME_KEY) || ''; } catch (e) { return ''; }
    },

    saveName(name) {
        try { localStorage.setItem(this.NAME_KEY, name); } catch (e) { /* ignore */ }
    }
};
