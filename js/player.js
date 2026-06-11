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

    this.attackCooldown = 0;
    this.invincibleTimer = 0;
    this.facing = { x: 1, y: 0 };

    this.cursors = scene.input.keyboard.createCursorKeys();
    this.wasd = scene.input.keyboard.addKeys('W,A,S,D');
    this.attackKey = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
  }

  update(time, delta) {
    const dt = delta / 1000;

    if (this.attackCooldown > 0) this.attackCooldown -= dt;
    if (this.invincibleTimer > 0) {
      this.invincibleTimer -= dt;
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

    if (Phaser.Input.Keyboard.JustDown(this.attackKey) && this.attackCooldown <= 0) {
      this._doAttack();
    }
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
