class GameScene extends Phaser.Scene {
  constructor() {
    super('Game');
    this.currentFloor = 1;
  }

  create() {
    this.enemies = this.physics.add.group();
    this.itemsGroup = this.add.group();
    this._colliders = [];
    this.player = null;
    this.stairsTile = null;
    this._onStairs = false;

    this.events.on('player-dead', this._onPlayerDead, this);
    this._activeTornadoes = [];
    this._runesGroup = this.add.group();

    this._buildFloor();

    this.qKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.Q);

    this.scene.launch('UI');
    this.scene.bringToTop('UI');

    const isRuneMode = this.registry.get('mode') === 'rune';
    if (isRuneMode) {
      this.showMessage('Find and charge all runes to unlock the stairs  |  SHIFT: Dash');
    } else {
      this.showMessage('WASD: Move  |  SPACE: Attack  |  SHIFT: Dash  |  Q: Elemental Super');
    }
  }

  _buildFloor() {
    this._cleanup();

    const isRuneMode = this.registry.get('mode') === 'rune';
    const gen = new DungeonGenerator(CONFIG.MAP_COLS, CONFIG.MAP_ROWS);
    const data = gen.generate(this.currentFloor, isRuneMode ? { noHazard: true, noPits: true } : {});
    this.dungeonData = data;

    const T = CONFIG.TILE_SIZE;

    // Build tilemap from 2D data array
    this.tilemap = this.make.tilemap({
      data: data.map,
      tileWidth: T,
      tileHeight: T,
    });
    const tileset = this.tilemap.addTilesetImage('tiles', 'tiles', T, T, 0, 0);
    this.groundLayer = this.tilemap.createLayer(0, tileset, 0, 0);
    // Only walls (tile index 1) block movement
    this.groundLayer.setCollision([CONFIG.TILES.WALL]);
    this.groundLayer.setDepth(0);

    const worldW = CONFIG.MAP_COLS * T;
    const worldH = CONFIG.MAP_ROWS * T;
    this.physics.world.setBounds(0, 0, worldW, worldH);

    // Player: create once, then just reposition
    const px = data.playerStart.x * T + T / 2;
    const py = data.playerStart.y * T + T / 2;
    if (!this.player) {
      this.player = new Player(this, px, py);
    } else {
      this.player.setPosition(px, py);
      this.player.setVelocity(0, 0);
    }

    this.cameras.main.setBounds(0, 0, worldW, worldH);
    this.cameras.main.startFollow(this.player, true, 0.08, 0.08);
    this.cameras.main.setZoom(2.5);

    // Spawn enemies (rune mode: cap at 1-3 total, type 0 only)
    const enemyList = isRuneMode
      ? data.enemies.slice(0, 1 + Math.floor(Math.random() * 3)).map(e => ({ ...e, type: 0 }))
      : data.enemies;
    enemyList.forEach(e => {
      const enemy = new Enemy(this, e.x * T + T / 2, e.y * T + T / 2, e.type);
      this.enemies.add(enemy);
    });

    // Spawn items
    data.items.forEach(i => {
      const item = new Item(this, i.x * T + T / 2, i.y * T + T / 2, i.type);
      this.itemsGroup.add(item);
    });

    // Colliders
    this._colliders.push(this.physics.add.collider(this.player, this.groundLayer));
    this._colliders.push(this.physics.add.collider(this.enemies, this.groundLayer));
    this._colliders.push(this.physics.add.collider(this.enemies, this.enemies));

    this.stairsTile = data.stairs;
    this._onStairs = false;
    this._lastSafeX = px;
    this._lastSafeY = py;

    // Hazard room persistent tints
    this._hazard = null;
    this._playerRoomId = null;
    if (!isRuneMode) this._drawHazardRoomTints();

    // Rune mode: place runes and lock stairs
    this._stairsLocked = false;
    this._stairLockGfx = null;
    if (isRuneMode) this._placeRunes();

    this.events.emit('floor-changed', this.currentFloor);
    this.events.emit('player-healed', this.player); // refresh UI
  }

  _cleanup() {
    this._colliders.forEach(c => this.physics.world.removeCollider(c));
    this._colliders = [];

    if (this.enemies) {
      this.enemies.getChildren().slice().forEach(e => e.destroy());
      this.enemies.clear(false, false);
    }

    if (this.itemsGroup) {
      this.itemsGroup.getChildren().slice().forEach(item => {
        this.tweens.killTweensOf(item);
        item.destroy();
      });
      this.itemsGroup.clear(false, false);
    }

    if (this.tilemap) {
      this.tilemap.destroy();
      this.tilemap = null;
      this.groundLayer = null;
    }

    if (this._runesGroup) {
      this._runesGroup.getChildren().slice().forEach(r => r.destroy());
      this._runesGroup.clear(false, false);
    }
    if (this._stairLockGfx) { this._stairLockGfx.destroy(); this._stairLockGfx = null; }
    if (this._stairsArrow) { this._stairsArrow.destroy(); this._stairsArrow = null; }
    this.events.off('rune-charged', this._onRuneCharged, this);

    this._stopHazard();
    this._hazard = null;
    this._playerRoomId = null;
  }

  update(time, delta) {
    if (!this.player || !this.player.active) return;

    this.player.update(time, delta);

    this.enemies.getChildren().forEach(e => { if (e.active) e.update(time, delta); });

    const isRuneMode = this.registry.get('mode') === 'rune';

    if (isRuneMode) {
      this._updateRuneCharging(delta);
      this._updateStairsArrow();
    } else {
      // Hazard room check
      this._checkHazardRoom(delta);

      // Super attack
      if (this.player.charge >= CONFIG.CHARGE_REQUIRED && Phaser.Input.Keyboard.JustDown(this.qKey)) {
        this._activateSuper();
      }

      // Update active tornadoes
      this._activeTornadoes = this._activeTornadoes.filter(t => this._updateTornado(t, delta));
    }

    // Pit check
    const currentTile = this.groundLayer?.getTileAtWorldXY(this.player.x, this.player.y);
    if (currentTile) {
      const { PIT, LAVA, FLOOR, STAIRS } = CONFIG.TILES;
      if ((currentTile.index === PIT || currentTile.index === LAVA) && !this.player.dashing && this.player.postDashGrace <= 0) {
        this.player.takeDamage(20);
        this.player.setPosition(this._lastSafeX, this._lastSafeY);
        this.player.setVelocity(0, 0);
        this.showMessage(currentTile.index === LAVA ? 'Lava! SHIFT to dash across.' : 'Watch the gaps! SHIFT to dash across.');
      } else if (currentTile.index === FLOOR || currentTile.index === STAIRS) {
        this._lastSafeX = this.player.x;
        this._lastSafeY = this.player.y;
      }
    }

    // Enemy pit deaths
    this.enemies.getChildren().forEach(e => {
      if (!e.active) return;
      const t = this.groundLayer?.getTileAtWorldXY(e.x, e.y);
      if (t && (t.index === CONFIG.TILES.PIT || t.index === CONFIG.TILES.LAVA)) e.takeDamage(999);
    });

    // Item pickup (distance check)
    this.itemsGroup.getChildren().slice().forEach(item => {
      if (!item.active) return;
      const dx = this.player.x - item.x;
      const dy = this.player.y - item.y;
      if (dx * dx + dy * dy < 13 * 13) item.collect(this.player);
    });

    // Stairs detection
    const T = CONFIG.TILE_SIZE;
    const tx = Math.floor(this.player.x / T);
    const ty = Math.floor(this.player.y / T);
    const onStairs = tx === this.stairsTile.x && ty === this.stairsTile.y;

    if (onStairs && !this._onStairs && !this._stairsLocked) {
      this._onStairs = true;
      this._descend();
    } else if (!onStairs) {
      this._onStairs = false;
    }

    this.events.emit('update-ui', this.player);
  }

  _descend() {
    this.currentFloor++;
    this.cameras.main.fadeOut(400, 0, 0, 0);
    this.time.delayedCall(400, () => {
      this._buildFloor();
      this.cameras.main.fadeIn(400);
      this.showMessage(`Floor ${this.currentFloor} — deeper danger awaits...`);
    });
  }

  _onPlayerDead() {
    this.cameras.main.shake(300, 0.015);
    this.cameras.main.fadeOut(800, 80, 0, 0);
    this.time.delayedCall(900, () => {
      // Reset player stats
      this.currentFloor = 1;
      this.player.hp = this.player.maxHp;
      this.player.attack = CONFIG.PLAYER.ATTACK;
      this.player.defense = 0;
      this._buildFloor();
      this.cameras.main.fadeIn(600);
      this.showMessage('You perished... Back to floor 1.');
    });
  }

  // ── Rune mode ────────────────────────────────────────────────────────────

  _placeRunes() {
    const T = CONFIG.TILE_SIZE;
    const rooms = this.dungeonData.rooms;
    // eligible: skip first (spawn) and last (stairs)
    const eligible = rooms.slice(1, -1).slice();
    for (let i = eligible.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [eligible[i], eligible[j]] = [eligible[j], eligible[i]];
    }
    const count = Math.min(1 + Math.floor(Math.random() * 5), eligible.length);

    // Pick one room to get a lava gap (if large enough)
    const lavaRoomIdx = Math.floor(Math.random() * count);

    for (let i = 0; i < count; i++) {
      const r = eligible[i];
      let rx = r.cx * T + T / 2;
      let ry = r.cy * T + T / 2;
      if (i === lavaRoomIdx) {
        const gapInfo = this._tryAddLavaGap(r);
        if (gapInfo) { rx = gapInfo.runeX; ry = gapInfo.runeY; }
      }
      const rune = new Rune(this, rx, ry);
      this._runesGroup.add(rune);
    }
    this._runesTotal = count;
    this._runesPowered = 0;
    this._stairsLocked = count > 0;

    // Lock visual: red overlay on stairs
    if (this._stairsLocked) {
      const sx = this.dungeonData.stairs.x * T;
      const sy = this.dungeonData.stairs.y * T;
      this._stairLockGfx = this.add.graphics().setDepth(3);
      this._stairLockGfx.fillStyle(0xff2200, 0.5);
      this._stairLockGfx.fillRect(sx, sy, T, T);
    }

    this.events.on('rune-charged', this._onRuneCharged, this);
    this.events.emit('rune-progress', this._runesPowered, this._runesTotal);
  }

  _onRuneCharged() {
    this._runesPowered++;
    this.events.emit('rune-progress', this._runesPowered, this._runesTotal);
    if (this._runesPowered >= this._runesTotal) {
      this._unlockStairs();
    } else {
      this.showMessage(`Rune activated! ${this._runesPowered}/${this._runesTotal} — keep going`);
    }
  }

  _unlockStairs() {
    this._stairsLocked = false;
    if (this._stairLockGfx) { this._stairLockGfx.destroy(); this._stairLockGfx = null; }
    this.cameras.main.flash(300, 80, 255, 180);
    this.showMessage('All runes powered! The stairs are open!');

    // Stairs arrow indicator
    this._stairsArrow = this.add.graphics().setScrollFactor(0).setDepth(40);
    this._stairsArrow.fillStyle(0xffee44, 1);
    this._stairsArrow.fillTriangle(-10, -7, -10, 7, 8, 0);
    this._stairsArrow.lineStyle(1, 0xffffff, 0.7);
    this._stairsArrow.strokeTriangle(-10, -7, -10, 7, 8, 0);
  }

  _updateStairsArrow() {
    if (!this._stairsArrow) return;
    const T = CONFIG.TILE_SIZE;
    const cam = this.cameras.main;
    const sx = this.stairsTile.x * T + T / 2;
    const sy = this.stairsTile.y * T + T / 2;
    const angle = Math.atan2(sy - this.player.y, sx - this.player.x);

    // Convert stairs world pos to screen pos
    const screenX = (sx - cam.scrollX) * cam.zoom;
    const screenY = (sy - cam.scrollY) * cam.zoom;
    const W = cam.width, H = cam.height;
    const onScreen = screenX > 20 && screenX < W - 20 && screenY > 20 && screenY < H - 20;
    if (onScreen) {
      this._stairsArrow.setVisible(false);
      return;
    }
    this._stairsArrow.setVisible(true);

    const margin = 30;
    const halfW = W / 2 - margin;
    const halfH = H / 2 - margin;
    const cosA = Math.cos(angle), sinA = Math.sin(angle);
    const s = Math.min(
      Math.abs(cosA) > 0.001 ? halfW / Math.abs(cosA) : Infinity,
      Math.abs(sinA) > 0.001 ? halfH / Math.abs(sinA) : Infinity
    );
    this._stairsArrow.x = W / 2 + cosA * s;
    this._stairsArrow.y = H / 2 + sinA * s;
    this._stairsArrow.rotation = angle;
  }

  _updateRuneCharging(delta) {
    const dt = delta / 1000;
    const spaceHeld = this.player.attackKey.isDown;
    if (!spaceHeld) return;
    this._runesGroup.getChildren().forEach(rune => {
      if (rune.charged) return;
      const dx = rune.x - this.player.x;
      const dy = rune.y - this.player.y;
      if (Math.sqrt(dx * dx + dy * dy) < 28) {
        rune.addCharge(dt);
      }
    });
  }

  _tryAddLavaGap(room) {
    const T = CONFIG.TILE_SIZE;
    const LAVA = CONFIG.TILES.LAVA;

    // Try vertical lava strip (3 columns wide, full room height)
    // Gap starts one tile right of center so corridor entry at cx is safe
    if (room.w >= 9) {
      const gapX = room.cx + 1;
      if (gapX + 3 <= room.x + room.w - 2) {
        for (let x = gapX; x < gapX + 3; x++) {
          for (let y = room.y; y < room.y + room.h; y++) {
            this.groundLayer.putTileAt(LAVA, x, y);
          }
        }
        const runeX = Math.floor((gapX + 3 + room.x + room.w - 1) / 2) * T + T / 2;
        const runeY = room.cy * T + T / 2;
        return { runeX, runeY };
      }
    }

    // Try horizontal lava strip (3 rows wide, full room width)
    if (room.h >= 9) {
      const gapY = room.cy + 1;
      if (gapY + 3 <= room.y + room.h - 2) {
        for (let y = gapY; y < gapY + 3; y++) {
          for (let x = room.x; x < room.x + room.w; x++) {
            this.groundLayer.putTileAt(LAVA, x, y);
          }
        }
        const runeX = room.cx * T + T / 2;
        const runeY = Math.floor((gapY + 3 + room.y + room.h - 1) / 2) * T + T / 2;
        return { runeX, runeY };
      }
    }

    return null;
  }

  // ── Hazard rooms ─────────────────────────────────────────────────────────

  _drawHazardRoomTints() {
    const T = CONFIG.TILE_SIZE;
    const colors = { FIRE: 0xff3300, ICE: 0x0088ff, WIND: 0x88ddff, LIGHTNING: 0xffee00 };
    this.dungeonData.rooms.forEach(room => {
      if (!room.hazard) return;
      const gfx = this.add.graphics().setDepth(1);
      gfx.fillStyle(colors[room.hazard], 0.08);
      gfx.fillRect(room.x * T, room.y * T, room.w * T, room.h * T);
    });
  }

  _getRoomAt(wx, wy) {
    const T = CONFIG.TILE_SIZE;
    const tx = Math.floor(wx / T), ty = Math.floor(wy / T);
    return this.dungeonData.rooms.find(r =>
      tx >= r.x && tx < r.x + r.w && ty >= r.y && ty < r.y + r.h
    ) || null;
  }

  _checkHazardRoom(delta) {
    const room = this._getRoomAt(this.player.x, this.player.y);
    const id = room ? `${room.x},${room.y}` : null;
    if (id === this._playerRoomId) {
      // Still in same room — run wind force
      if (this._hazard?.type === 'WIND') this._applyWind(delta);
      if (this._hazard?.type === 'ICE')  this._applyIceSlug();
      return;
    }
    this._playerRoomId = id;
    this._stopHazard();
    if (room?.hazard) this._startHazard(room);
  }

  _startHazard(room) {
    const T = CONFIG.TILE_SIZE;
    const labels = { FIRE: 'Inferno Chamber', ICE: 'Frozen Vault', WIND: 'Storm Chamber', LIGHTNING: 'Charged Vault' };
    const colors = { FIRE: 0xff3300, ICE: 0x0088ff, WIND: 0x88ddff, LIGHTNING: 0xffee00 };
    this.showMessage(`⚠ ${labels[room.hazard]}!`);
    this.cameras.main.flash(200, ...(room.hazard === 'FIRE' ? [255,60,0] : room.hazard === 'ICE' ? [50,150,255] : room.hazard === 'WIND' ? [100,200,255] : [220,200,0]));

    const effectGfx = this.add.graphics().setDepth(6);
    this._hazard = { type: room.hazard, room, effectGfx, timer: null, windForce: { x: 1, y: 0 }, windArrow: null };

    switch (room.hazard) {
      case 'FIRE':      this._startFireHazard(room);      break;
      case 'ICE':       this._startIceHazard(room);       break;
      case 'WIND':      this._startWindHazard(room);      break;
      case 'LIGHTNING': this._startLightningHazard(room); break;
    }
  }

  _stopHazard() {
    if (!this._hazard) return;
    const h = this._hazard;
    if (h.timer)     { h.timer.remove(false); h.timer = null; }
    if (h.effectGfx) { h.effectGfx.destroy(); }
    if (h.windArrow) { h.windArrow.destroy(); }
    // Restore ice-affected enemies
    if (h.type === 'ICE') {
      this.enemies.getChildren().forEach(e => {
        if (e.active && e._iceBoost) { e.speed /= 1.4; e._iceBoost = false; }
      });
    }
    this._hazard = null;
  }

  // Fire ──────────────────────────────────────────────────
  _startFireHazard(room) {
    this._hazard.timer = this.time.addEvent({ delay: 1800, callback: this._triggerFire, callbackScope: this, loop: true });
    this.time.delayedCall(600, this._triggerFire, [], this);
  }

  _triggerFire() {
    if (!this._hazard || this._hazard.type !== 'FIRE') return;
    const { room, effectGfx } = this._hazard;
    const T = CONFIG.TILE_SIZE;
    const tiles = [];
    for (let i = 0; i < 4; i++) {
      tiles.push({
        tx: room.x + 1 + Math.floor(Math.random() * (room.w - 2)),
        ty: room.y + 1 + Math.floor(Math.random() * (room.h - 2)),
      });
    }
    // Warning phase
    effectGfx.clear();
    effectGfx.fillStyle(0xff8800, 0.45);
    tiles.forEach(({ tx, ty }) => effectGfx.fillRect(tx * T + 1, ty * T + 1, T - 2, T - 2));

    this.time.delayedCall(500, () => {
      if (!this._hazard || this._hazard.type !== 'FIRE') return;
      // Active fire phase
      effectGfx.clear();
      effectGfx.fillStyle(0xff2200, 0.75);
      tiles.forEach(({ tx, ty }) => effectGfx.fillRect(tx * T + 1, ty * T + 1, T - 2, T - 2));
      // Damage check
      const px = Math.floor(this.player.x / T), py = Math.floor(this.player.y / T);
      if (tiles.some(t => t.tx === px && t.ty === py)) this.player.takeDamage(12);

      this.time.delayedCall(700, () => { if (this._hazard?.type === 'FIRE') effectGfx.clear(); });
    });
  }

  // Ice ───────────────────────────────────────────────────
  _startIceHazard(room) {
    // Boost enemies in this room
    this.enemies.getChildren().forEach(e => {
      if (!e.active || e._iceBoost) return;
      const T = CONFIG.TILE_SIZE;
      const tx = Math.floor(e.x / T), ty = Math.floor(e.y / T);
      if (tx >= room.x && tx < room.x + room.w && ty >= room.y && ty < room.y + room.h) {
        e.speed *= 1.4;
        e._iceBoost = true;
        e.setTint(0xaaddff);
      }
    });
    this.showMessage('The cold empowers your enemies...');
  }

  _applyIceSlug() {
    // Dampen player velocity when no key held (sliding feel)
    const vx = this.player.body.velocity.x, vy = this.player.body.velocity.y;
    if (Math.abs(vx) > 0 || Math.abs(vy) > 0) {
      this.player.body.velocity.x *= 0.88;
      this.player.body.velocity.y *= 0.88;
    }
  }

  // Wind ──────────────────────────────────────────────────
  _startWindHazard(room) {
    this._pickNewWindDirection();
    this._hazard.windArrow = this.add.graphics().setDepth(7);
    this._drawWindArrow();
    this._hazard.timer = this.time.addEvent({ delay: 3000, callback: () => {
      this._pickNewWindDirection();
      this._drawWindArrow();
      this.showMessage('The wind shifts!');
    }, loop: true });
  }

  _pickNewWindDirection() {
    const dirs = [{ x:1,y:0 }, { x:-1,y:0 }, { x:0,y:1 }, { x:0,y:-1 }];
    this._hazard.windForce = dirs[Math.floor(Math.random() * dirs.length)];
  }

  _drawWindArrow() {
    const h = this._hazard;
    if (!h?.windArrow) return;
    const T = CONFIG.TILE_SIZE;
    const cx = (h.room.cx) * T + T / 2;
    const cy = (h.room.cy) * T + T / 2;
    h.windArrow.clear();
    h.windArrow.lineStyle(2, 0x88ddff, 0.7);
    h.windArrow.lineBetween(cx, cy, cx + h.windForce.x * 24, cy + h.windForce.y * 24);
    h.windArrow.fillStyle(0x88ddff, 0.8);
    h.windArrow.fillTriangle(
      cx + h.windForce.x * 28, cy + h.windForce.y * 28,
      cx + h.windForce.x * 20 - h.windForce.y * 5, cy + h.windForce.y * 20 + h.windForce.x * 5,
      cx + h.windForce.x * 20 + h.windForce.y * 5, cy + h.windForce.y * 20 - h.windForce.x * 5
    );
  }

  _applyWind(delta) {
    const dt = delta / 1000;
    const { windForce } = this._hazard;
    this.player.body.velocity.x += windForce.x * 55 * dt * 60;
    this.player.body.velocity.y += windForce.y * 55 * dt * 60;
  }

  // Lightning ─────────────────────────────────────────────
  _startLightningHazard(room) {
    this._hazard.timer = this.time.addEvent({ delay: 2000, callback: this._triggerLightning, callbackScope: this, loop: true });
    this.time.delayedCall(800, this._triggerLightning, [], this);
  }

  _triggerLightning() {
    if (!this._hazard || this._hazard.type !== 'LIGHTNING') return;
    const { room, effectGfx } = this._hazard;
    const T = CONFIG.TILE_SIZE;
    const tx = room.x + 1 + Math.floor(Math.random() * (room.w - 2));
    const ty = room.y + 1 + Math.floor(Math.random() * (room.h - 2));

    // Warning
    effectGfx.clear();
    effectGfx.fillStyle(0xffee44, 0.4);
    effectGfx.fillRect(tx * T, ty * T, T, T);

    this.time.delayedCall(600, () => {
      if (!this._hazard || this._hazard.type !== 'LIGHTNING') return;
      // Strike
      effectGfx.clear();
      effectGfx.fillStyle(0xffffff, 0.9);
      effectGfx.fillRect(tx * T, ty * T, T, T);

      // Lightning bolt from above
      const bolt = this.add.graphics({ x: tx * T + T / 2, y: ty * T }).setDepth(40);
      bolt.lineStyle(2, 0xffee22, 1);
      bolt.beginPath(); bolt.moveTo(0, -T * 2);
      for (let i = 1; i <= 4; i++) {
        bolt.lineTo((Math.random() - 0.5) * 8, -T * 2 + i * (T * 2 / 4));
      }
      bolt.lineTo(0, T); bolt.strokePath();
      this.cameras.main.shake(80, 0.006);

      const px = Math.floor(this.player.x / T), py = Math.floor(this.player.y / T);
      if (tx === px && ty === py) this.player.takeDamage(18);

      this.time.delayedCall(150, () => {
        if (this._hazard?.type === 'LIGHTNING') effectGfx.clear();
        bolt.destroy();
      });
    });
  }

  // ─────────────────────────────────────────────────────────────────────────

  _activateSuper() {
    this.player.charge = 0;
    this.events.emit('charge-updated', 0);
    const element = this.registry.get('element') || 'AIR';
    switch (element) {
      case 'AIR':       this._superAir();       break;
      case 'FIRE':      this._superFire();      break;
      case 'ICE':       this._superIce();       break;
      case 'LIGHTNING': this._superLightning(); break;
    }
  }

  _superAir() {
    this.showMessage('TORNADO!');
    const fx = this.player.facing.x || 1;
    const fy = this.player.facing.y || 0;

    const sprite = this.add.image(this.player.x, this.player.y, 'tornado_super')
      .setDepth(15).setScale(2.5).setAlpha(0.9);
    this.tweens.add({ targets: sprite, angle: 360, duration: 450, repeat: -1 });

    const ringGfx = this.add.graphics({ x: this.player.x, y: this.player.y }).setDepth(14);
    ringGfx.lineStyle(1.5, 0x88ddff, 0.35);
    ringGfx.strokeCircle(0, 0, 60);

    this._activeTornadoes.push({
      sprite, ringGfx,
      vx: fx * 50, vy: fy * 50,
      lifetime: 3.5, damageTimer: 0,
    });
  }

  _updateTornado(t, delta) {
    const dt = delta / 1000;
    t.lifetime -= dt;
    t.damageTimer -= dt;

    t.sprite.x += t.vx * dt;
    t.sprite.y += t.vy * dt;
    t.ringGfx.x = t.sprite.x;
    t.ringGfx.y = t.sprite.y;

    this.enemies.getChildren().slice().forEach(enemy => {
      if (!enemy.active) return;
      const dx = t.sprite.x - enemy.x;
      const dy = t.sprite.y - enemy.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 60 && dist > 0) {
        const pull = 160 * (1 - dist / 60);
        enemy.body.velocity.x += (dx / dist) * pull * dt * 60;
        enemy.body.velocity.y += (dy / dist) * pull * dt * 60;
        if (dist < 18 && t.damageTimer <= 0) {
          enemy.takeDamage(10);
          t.damageTimer = 0.12;
        }
      }
    });

    if (t.lifetime < 0.6) {
      const fade = t.lifetime / 0.6;
      t.sprite.setAlpha(fade);
      t.ringGfx.setAlpha(fade);
    }

    if (t.lifetime <= 0) {
      t.sprite.destroy();
      t.ringGfx.destroy();
      return false;
    }
    return true;
  }

  _superFire() {
    this.showMessage('INFERNO!');
    this.cameras.main.flash(250, 255, 80, 0);
    const radius = 85;
    const px = this.player.x, py = this.player.y;

    const burst = this.add.graphics({ x: px, y: py }).setDepth(30);
    burst.fillStyle(0xff6622, 0.55);
    burst.fillCircle(0, 0, radius);
    this.tweens.add({ targets: burst, alpha: 0, scaleX: 1.4, scaleY: 1.4, duration: 350, onComplete: () => burst.destroy() });

    const inner = this.add.graphics({ x: px, y: py }).setDepth(31);
    inner.fillStyle(0xffcc00, 0.7);
    inner.fillCircle(0, 0, radius * 0.45);
    this.tweens.add({ targets: inner, alpha: 0, duration: 200, onComplete: () => inner.destroy() });

    this.enemies.getChildren().slice().forEach(enemy => {
      if (!enemy.active) return;
      const dx = enemy.x - px, dy = enemy.y - py;
      if (Math.sqrt(dx * dx + dy * dy) < radius) {
        enemy.takeDamage(Math.floor(this.player.attack * 1.5));
        if (!enemy.active) return;
        // Burn: 3 ticks
        let ticks = 3;
        const burn = () => {
          if (enemy.active && ticks-- > 0) {
            enemy.takeDamage(8);
            this.time.delayedCall(500, burn);
          }
        };
        this.time.delayedCall(500, burn);
      }
    });
  }

  _superIce() {
    this.showMessage('BLIZZARD!');
    this.cameras.main.flash(300, 100, 180, 255);

    this.enemies.getChildren().forEach(enemy => {
      if (!enemy.active) return;
      enemy.frozen = true;
      enemy.setTint(0x88ccff);
      enemy.setVelocity(0, 0);
      this.time.delayedCall(2500, () => {
        if (enemy.active) { enemy.frozen = false; enemy.clearTint(); }
      });
    });

    // Crystal spread
    for (let i = 0; i < 14; i++) {
      const angle = (i / 14) * Math.PI * 2;
      const dist = 15 + Math.random() * 90;
      const cx = this.player.x + Math.cos(angle) * dist;
      const cy = this.player.y + Math.sin(angle) * dist;
      const crystal = this.add.graphics({ x: cx, y: cy }).setDepth(30);
      crystal.fillStyle(0x88ccff, 0.85);
      crystal.fillRect(-2, -7, 4, 14);
      crystal.fillRect(-7, -2, 14, 4);
      this.tweens.add({ targets: crystal, alpha: 0, duration: 2500, onComplete: () => crystal.destroy() });
    }
  }

  _superLightning() {
    this.showMessage('CHAIN STORM!');

    const sorted = this.enemies.getChildren()
      .filter(e => e.active)
      .sort((a, b) =>
        Phaser.Math.Distance.Between(this.player.x, this.player.y, a.x, a.y) -
        Phaser.Math.Distance.Between(this.player.x, this.player.y, b.x, b.y)
      ).slice(0, 5);

    const chain = [this.player, ...sorted];

    sorted.forEach((enemy, i) => {
      this.time.delayedCall(i * 90, () => {
        if (!enemy.active) return;
        const prev = chain[i];
        const midX = (prev.x + enemy.x) / 2;
        const midY = (prev.y + enemy.y) / 2;

        const bolt = this.add.graphics({ x: midX, y: midY }).setDepth(40);
        bolt.lineStyle(2.5, 0xffee22, 1);
        bolt.beginPath();
        bolt.moveTo(prev.x - midX, prev.y - midY);
        const steps = 5;
        for (let s = 1; s < steps; s++) {
          const t = s / steps;
          bolt.lineTo(
            (prev.x - midX) + (enemy.x - prev.x) * t + (Math.random() - 0.5) * 18,
            (prev.y - midY) + (enemy.y - prev.y) * t + (Math.random() - 0.5) * 18
          );
        }
        bolt.lineTo(enemy.x - midX, enemy.y - midY);
        bolt.strokePath();

        // Glow
        const glow = this.add.graphics({ x: enemy.x, y: enemy.y }).setDepth(39);
        glow.fillStyle(0xffee22, 0.6);
        glow.fillCircle(0, 0, 12);
        this.tweens.add({ targets: glow, alpha: 0, duration: 180, onComplete: () => glow.destroy() });

        enemy.takeDamage(Math.floor(this.player.attack * 2.5));
        this.cameras.main.shake(50, 0.005);

        this.tweens.add({ targets: bolt, alpha: 0, duration: 200, onComplete: () => bolt.destroy() });
      });
    });

    if (sorted.length === 0) this.showMessage('No enemies in range!');
  }

  showDashAttackEffect(x, y, radius) {
    // All Graphics positioned at (x,y) and drawn at local (0,0) to keep bounding boxes small

    // Expanding ring — drawn small, scaled up via tween
    const ring = this.add.graphics({ x, y }).setDepth(30);
    ring.lineStyle(3, 0x88ccff, 1);
    ring.strokeCircle(0, 0, 4);
    this.tweens.add({
      targets: ring,
      scaleX: radius / 4, scaleY: radius / 4,
      alpha: 0,
      duration: 320,
      ease: 'Quad.easeOut',
      onComplete: () => ring.destroy(),
    });

    // Slash lines radiating outward from local origin
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const line = this.add.graphics({ x, y }).setDepth(30);
      line.lineStyle(2, 0xffffff, 0.9);
      line.lineBetween(
        Math.cos(angle) * 8,          Math.sin(angle) * 8,
        Math.cos(angle) * radius * 0.8, Math.sin(angle) * radius * 0.8
      );
      this.tweens.add({
        targets: line, alpha: 0, duration: 280,
        onComplete: () => line.destroy(),
      });
    }

    // Shockwave flash
    const flash = this.add.graphics({ x, y }).setDepth(29);
    flash.fillStyle(0x88ccff, 0.35);
    flash.fillCircle(0, 0, radius);
    this.tweens.add({
      targets: flash, alpha: 0, duration: 200,
      onComplete: () => flash.destroy(),
    });

    this.cameras.main.shake(120, 0.007);
  }

  showAttackEffect(x, y) {
    const fx = this.add.image(x, y, 'attack_fx').setDepth(30).setAlpha(0.85);
    this.tweens.add({
      targets: fx,
      alpha: 0,
      scaleX: 2.2,
      scaleY: 2.2,
      duration: 180,
      onComplete: () => fx.destroy(),
    });
  }

  showFloatingText(x, y, text, color) {
    const t = this.add.text(x, y, text, {
      fontSize: '8px',
      fontFamily: 'monospace',
      color,
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0.5).setDepth(50);

    this.tweens.add({
      targets: t,
      y: y - 18,
      alpha: 0,
      duration: 700,
      ease: 'Quad.easeOut',
      onComplete: () => t.destroy(),
    });
  }

  showMessage(msg) {
    this.events.emit('show-message', msg);
  }

  spawnItem(x, y, itemKey) {
    const item = new Item(this, x, y, itemKey);
    this.itemsGroup.add(item);
  }
}
