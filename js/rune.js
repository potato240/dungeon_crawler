class Rune extends Phaser.GameObjects.Container {
  constructor(scene, wx, wy, isSkillCheck = false) {
    super(scene, wx, wy);
    scene.add.existing(this);
    this.setDepth(5);

    this.charged = false;
    this.isSkillCheck = isSkillCheck;
    this._charge = 0;

    this._arcGfx = scene.add.graphics();
    this._glyph = scene.add.image(0, 0, 'rune_idle');
    if (isSkillCheck) this._glyph.setTint(0xff9900);
    this.add([this._arcGfx, this._glyph]);

    if (!isSkillCheck) {
      scene.tweens.add({
        targets: this._glyph,
        y: -3, duration: 900, yoyo: true, repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }

    if (isSkillCheck) {
      this._needleAngle = 0;
      this._needleSpeed = 1.8;
      this._successStart = Math.random() * Math.PI * 2;
      this._successArc = 0.38;
      this._scGfx = scene.add.graphics();
      this.add(this._scGfx);
    }
  }

  addCharge(dt) {
    if (this.charged || this.isSkillCheck) return;
    this._charge = Math.min(1, this._charge + dt / 3);
    this._redrawArc();
    if (this._charge >= 1) {
      this.charged = true;
      this._onCharged();
      this.scene.events.emit('rune-charged');
    }
  }

  updateSkillCheck(dt, playerNear) {
    if (this.charged || !this.isSkillCheck) return;
    if (playerNear) this._needleAngle = (this._needleAngle + this._needleSpeed * dt) % (Math.PI * 2);
    this._redrawSkillCheck(playerNear);
  }

  attemptSkillCheck() {
    if (this.charged || !this.isSkillCheck) return;
    const n = ((this._needleAngle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const s = ((this._successStart % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const e = (s + this._successArc) % (Math.PI * 2);
    const hit = s <= e ? (n >= s && n <= e) : (n >= s || n <= e);

    if (hit) {
      this.charged = true;
      if (this._scGfx) this._scGfx.clear();
      this._onCharged();
      this.scene.events.emit('rune-charged');
    } else {
      this._glyph.setTint(0xff2222);
      this.scene.time.delayedCall(220, () => { if (this._glyph) this._glyph.setTint(0xff9900); });
      this._needleSpeed = Math.min(this._needleSpeed + 0.25, 4.0);
    }
  }

  _redrawSkillCheck(visible) {
    const gfx = this._scGfx;
    gfx.clear();
    if (!visible || this.charged) return;

    const r = 13;

    // Outer ring
    gfx.lineStyle(1, 0x888888, 0.5);
    gfx.beginPath();
    for (let i = 0; i <= 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      i === 0 ? gfx.moveTo(Math.cos(a) * r, Math.sin(a) * r)
              : gfx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    gfx.closePath();
    gfx.strokePath();

    // Success zone
    gfx.lineStyle(3, 0x44ff88, 1);
    gfx.beginPath();
    for (let i = 0; i <= 10; i++) {
      const a = this._successStart + this._successArc * (i / 10);
      i === 0 ? gfx.moveTo(Math.cos(a) * r, Math.sin(a) * r)
              : gfx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    gfx.strokePath();

    // Needle
    gfx.lineStyle(2, 0xffffff, 1);
    gfx.lineBetween(0, 0, Math.cos(this._needleAngle) * r, Math.sin(this._needleAngle) * r);
  }

  _onCharged() {
    this._glyph.setTexture('rune_charged');
    this._glyph.clearTint();
    this._arcGfx.clear();
    this.scene.tweens.add({
      targets: this._glyph,
      scaleX: 1.5, scaleY: 1.5,
      duration: 200, yoyo: true,
    });
  }

  _redrawArc() {
    const gfx = this._arcGfx;
    gfx.clear();
    if (this._charge <= 0) return;
    gfx.lineStyle(2, 0x88ffcc, 0.9);
    const steps = Math.max(2, Math.ceil(this._charge * 28));
    const startAngle = -Math.PI / 2;
    const sweep = this._charge * Math.PI * 2;
    const r = 10;
    gfx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const a = startAngle + sweep * (i / steps);
      i === 0 ? gfx.moveTo(Math.cos(a) * r, Math.sin(a) * r)
              : gfx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    gfx.strokePath();
  }

  destroy() {
    if (this._arcGfx && this._arcGfx.scene) this._arcGfx.destroy();
    if (this._scGfx && this._scGfx.scene) this._scGfx.destroy();
    super.destroy();
  }
}
