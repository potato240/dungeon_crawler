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

    this._buildFloor();

    this.qKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.Q);

    this.scene.launch('UI');
    this.scene.bringToTop('UI');

    this.showMessage('WASD: Move  |  SPACE: Attack  |  SHIFT: Dash  |  Q: Elemental Super');
  }

  _buildFloor() {
    this._cleanup();

    const gen = new DungeonGenerator(CONFIG.MAP_COLS, CONFIG.MAP_ROWS);
    const data = gen.generate(this.currentFloor);
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

    // Spawn enemies
    data.enemies.forEach(e => {
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
  }

  update(time, delta) {
    if (!this.player || !this.player.active) return;

    this.player.update(time, delta);

    this.enemies.getChildren().forEach(e => { if (e.active) e.update(time, delta); });

    // Super attack
    if (this.player.charge >= CONFIG.CHARGE_REQUIRED && Phaser.Input.Keyboard.JustDown(this.qKey)) {
      this._activateSuper();
    }

    // Update active tornadoes
    this._activeTornadoes = this._activeTornadoes.filter(t => this._updateTornado(t, delta));

    // Pit check
    const currentTile = this.groundLayer?.getTileAtWorldXY(this.player.x, this.player.y);
    if (currentTile) {
      if (currentTile.index === CONFIG.TILES.PIT && !this.player.dashing && this.player.postDashGrace <= 0) {
        this.player.takeDamage(20);
        this.player.setPosition(this._lastSafeX, this._lastSafeY);
        this.player.setVelocity(0, 0);
        this.showMessage('Watch the gaps! SHIFT to dash across.');
      } else if (currentTile.index === CONFIG.TILES.FLOOR || currentTile.index === CONFIG.TILES.STAIRS) {
        this._lastSafeX = this.player.x;
        this._lastSafeY = this.player.y;
      }
    }

    // Enemy pit deaths
    this.enemies.getChildren().forEach(e => {
      if (!e.active) return;
      const t = this.groundLayer?.getTileAtWorldXY(e.x, e.y);
      if (t && t.index === CONFIG.TILES.PIT) e.takeDamage(999);
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

    if (onStairs && !this._onStairs) {
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
