class Enemy extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y, typeIndex) {
    const def = CONFIG.ENEMIES[typeIndex];
    super(scene, x, y, `enemy_${typeIndex}`);
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.body.setSize(10, 10);
    this.setDepth(9);

    const scale = 1 + (scene.currentFloor - 1) * 0.2;
    this.typeDef = def;
    this.maxHp = Math.floor(def.hp * scale);
    this.hp = this.maxHp;
    this.atk = Math.floor(def.attack * scale);
    this.speed = def.speed;

    this.state = 'idle';
    this.moveTimer = Phaser.Math.FloatBetween(0, 2);
    this.attackTimer = 0;
    this.aggroRange = 90;

    this.hpBarGfx = scene.add.graphics().setDepth(20);
  }

  update(time, delta) {
    if (!this.active) return;
    const dt = delta / 1000;
    if (this.attackTimer > 0) this.attackTimer -= dt;
    if (this.moveTimer > 0) this.moveTimer -= dt;

    const player = this.scene.player;
    if (!player || !player.active) return;

    const dx = player.x - this.x;
    const dy = player.y - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < this.aggroRange) {
      this.setVelocity((dx / dist) * this.speed, (dy / dist) * this.speed);
      if (dist < 14 && this.attackTimer <= 0) {
        this.attackTimer = 1.2;
        player.takeDamage(this.atk);
      }
    } else {
      if (this.moveTimer <= 0) {
        this.moveTimer = Phaser.Math.FloatBetween(1.5, 3);
        if (Math.random() < 0.55) {
          const angle = Math.random() * Math.PI * 2;
          this.setVelocity(Math.cos(angle) * this.speed * 0.45, Math.sin(angle) * this.speed * 0.45);
        } else {
          this.setVelocity(0, 0);
        }
      }
    }

    this._drawHpBar();
  }

  _drawHpBar() {
    this.hpBarGfx.clear();
    if (this.hp >= this.maxHp) return;
    const w = 14, h = 3;
    const bx = this.x - w / 2, by = this.y - 11;
    const frac = this.hp / this.maxHp;
    this.hpBarGfx.fillStyle(0x000000, 0.7);
    this.hpBarGfx.fillRect(bx - 1, by - 1, w + 2, h + 2);
    this.hpBarGfx.fillStyle(frac > 0.5 ? 0x44cc44 : frac > 0.25 ? 0xccaa00 : 0xcc2222);
    this.hpBarGfx.fillRect(bx, by, w * frac, h);
  }

  takeDamage(amount) {
    this.hp -= amount;
    this.scene.showFloatingText(this.x, this.y - 12, `-${amount}`, '#ffffff');
    if (this.hp <= 0) this._die();
  }

  _die() {
    // 30% chance to drop a potion
    if (Math.random() < 0.3) {
      const key = Math.random() < 0.65 ? 'POTION_SMALL' : 'POTION_LARGE';
      this.scene.spawnItem(this.x, this.y, key);
    }
    this.hpBarGfx.destroy();
    this.destroy();
  }

  destroy(fromScene) {
    if (this.hpBarGfx) { this.hpBarGfx.destroy(); this.hpBarGfx = null; }
    super.destroy(fromScene);
  }
}
