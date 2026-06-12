class Player extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y) {
    super(scene, x, y, 'player');
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.body.setSize(10, 10);
    this.setDepth(10);

    this.maxHp = CONFIG.PLAYER.HP;
    this.hp = this.maxHp;
    this.attack = CONFIG.PLAYER.ATTACK;
    this.defense = 0;
    this.speed = CONFIG.PLAYER.SPEED;

    this.charge = 0;
    this.attackCooldown = 0;
    this.invincibleTimer = 0;
    this.dashing = false;
    this.dashTimer = 0;
    this.dashCooldown = 0;
    this.dashTrailTimer = 0;
    this.postDashGrace = 0;
    this.facing = { x: 1, y: 0 };

    this.cursors = scene.input.keyboard.createCursorKeys();
    this.wasd = scene.input.keyboard.addKeys('W,A,S,D');
    this.attackKey = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.dashKey = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
  }

  update(time, delta) {
    const dt = delta / 1000;

    if (this.attackCooldown > 0) this.attackCooldown -= dt;
    if (this.dashCooldown > 0) this.dashCooldown -= dt;
    if (this.invincibleTimer > 0) this.invincibleTimer -= dt;
    if (this.postDashGrace > 0) this.postDashGrace -= dt;

    // During dash: maintain velocity, spawn trail, then end
    if (this.dashing) {
      this.dashTimer -= dt;
      this.dashTrailTimer -= dt;
      if (this.dashTrailTimer <= 0) {
        this.dashTrailTimer = 0.03;
        this._spawnTrail();
      }
      if (Phaser.Input.Keyboard.JustDown(this.attackKey)) {
        this._doDashAttack();
        return;
      }
      if (this.dashTimer <= 0) {
        this.dashing = false;
        this.postDashGrace = 0.12;
        this.setTint(0xffffff);
      }
      return;
    }

    let vx = 0, vy = 0;
    if (this.cursors.left.isDown  || this.wasd.A.isDown)  vx = -1;
    else if (this.cursors.right.isDown || this.wasd.D.isDown) vx =  1;
    if (this.cursors.up.isDown    || this.wasd.W.isDown)   vy = -1;
    else if (this.cursors.down.isDown  || this.wasd.S.isDown)  vy =  1;

    if (vx !== 0 && vy !== 0) { vx *= 0.707; vy *= 0.707; }
    if (vx !== 0 || vy !== 0) this.facing = { x: Math.sign(vx) || 0, y: Math.sign(vy) || 0 };

    this.setVelocity(vx * this.speed, vy * this.speed);

    // Invincible flicker
    this.setAlpha(this.invincibleTimer > 0 && Math.floor(time / 80) % 2 === 0 ? 0.4 : 1);

    if (Phaser.Input.Keyboard.JustDown(this.dashKey) && this.dashCooldown <= 0) {
      this._doDash();
    }

    if (Phaser.Input.Keyboard.JustDown(this.attackKey)) {
      if (this.attackCooldown <= 0) this._doAttack();
    }
  }

  _doDash() {
    this.dashing = true;
    this.dashTimer = CONFIG.PLAYER.DASH_DURATION;
    this.dashCooldown = CONFIG.PLAYER.DASH_COOLDOWN;
    this.dashTrailTimer = 0;
    this.invincibleTimer = Math.max(this.invincibleTimer, CONFIG.PLAYER.DASH_DURATION);

    const fx = this.facing.x || 0;
    const fy = this.facing.y || 0;
    const len = Math.sqrt(fx * fx + fy * fy) || 1;
    this.setVelocity((fx / len) * CONFIG.PLAYER.DASH_SPEED, (fy / len) * CONFIG.PLAYER.DASH_SPEED);
    this.setTint(0xaaddff);
  }

  _doDashAttack() {
    // Cancel dash, enter attack cooldown
    this.dashing = false;
    this.dashTimer = 0;
    this.attackCooldown = 0.6;
    this.setTint(0xffffff);
    this.setVelocity(0, 0);

    const radius = 48;
    this.scene.showDashAttackEffect(this.x, this.y, radius);

    this.scene.enemies.getChildren().slice().forEach(enemy => {
      if (!enemy.active) return;
      const dx = enemy.x - this.x;
      const dy = enemy.y - this.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < radius) {
        this.addCharge(this.attack * 2);
        enemy.takeDamage(this.attack * 2);
        if (!enemy.active) return; // died from the hit
        // Knockback
        if (dist > 0) {
          const nx = dx / dist, ny = dy / dist;
          enemy.setVelocity(nx * 260, ny * 260);
          this.scene.time.delayedCall(200, () => {
            if (enemy.active) enemy.setVelocity(0, 0);
          });
        }
      }
    });
  }

  _spawnTrail() {
    const ghost = this.scene.add.image(this.x, this.y, 'player')
      .setAlpha(0.45)
      .setTint(0x4488ff)
      .setDepth(7);
    this.scene.tweens.add({
      targets: ghost,
      alpha: 0,
      duration: 160,
      onComplete: () => ghost.destroy(),
    });
  }

  addCharge(amount) {
    this.charge = Math.min(CONFIG.CHARGE_REQUIRED, this.charge + amount);
    this.scene.events.emit('charge-updated', this.charge);
  }

  _doAttack() {
    this.attackCooldown = 0.45;
    const range = CONFIG.PLAYER.ATTACK_RANGE;
    const cx = this.x + this.facing.x * range * 0.6;
    const cy = this.y + this.facing.y * range * 0.6;

    this.scene.showAttackEffect(cx, cy);

    this.scene.enemies.getChildren().forEach(enemy => {
      if (!enemy.active) return;
      const dx = enemy.x - cx;
      const dy = enemy.y - cy;
      if (Math.sqrt(dx * dx + dy * dy) < range) {
        this.addCharge(this.attack);
        enemy.takeDamage(this.attack);
      }
    });
  }

  takeDamage(amount) {
    if (this.invincibleTimer > 0) return;
    const dmg = Math.max(1, amount - this.defense);
    this.hp = Math.max(0, this.hp - dmg);
    this.invincibleTimer = 1.0;

    this.scene.showFloatingText(this.x, this.y - 10, `-${dmg}`, '#ff4444');
    this.scene.events.emit('player-hurt', this);

    if (this.hp <= 0) this.scene.events.emit('player-dead');
  }

  heal(amount) {
    this.hp = Math.min(this.maxHp, this.hp + amount);
    this.scene.showFloatingText(this.x, this.y - 10, `+${amount}`, '#44ff44');
    this.scene.events.emit('player-healed', this);
  }
}
