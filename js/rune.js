class Rune extends Phaser.GameObjects.Container {
  constructor(scene, wx, wy) {
    super(scene, wx, wy);
    scene.add.existing(this);
    this.setDepth(5);

    this.charged = false;
    this._charge = 0;

    this._arcGfx = scene.add.graphics();
    this._glyph = scene.add.image(0, 0, 'rune_idle');
    this.add([this._arcGfx, this._glyph]);

    scene.tweens.add({
      targets: this._glyph,
      y: -3,
      duration: 900, yoyo: true, repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  addCharge(dt) {
    if (this.charged) return;
    this._charge = Math.min(1, this._charge + dt / 2);
    this._redrawArc();
    if (this._charge >= 1) {
      this.charged = true;
      this._onCharged();
      this.scene.events.emit('rune-charged');
    }
  }

  _onCharged() {
    this._glyph.setTexture('rune_charged');
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
      const px = Math.cos(a) * r;
      const py = Math.sin(a) * r;
      if (i === 0) gfx.moveTo(px, py);
      else gfx.lineTo(px, py);
    }
    gfx.strokePath();
  }

  destroy() {
    if (this._arcGfx && this._arcGfx.scene) this._arcGfx.destroy();
    super.destroy();
  }
}
