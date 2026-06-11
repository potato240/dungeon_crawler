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

    this._buildFloor();

    this.scene.launch('UI');
    this.scene.bringToTop('UI');

    this.showMessage('WASD: Move  |  SPACE: Attack  |  SHIFT: Dash over gaps');
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

    // Pit check
    const currentTile = this.groundLayer?.getTileAtWorldXY(this.player.x, this.player.y);
    if (currentTile) {
      if (currentTile.index === CONFIG.TILES.PIT && !this.player.dashing) {
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
