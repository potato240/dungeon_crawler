class ElementSelectScene extends Phaser.Scene {
  constructor() { super('ElementSelect'); }

  create() {
    const W = this.cameras.main.width;
    const H = this.cameras.main.height;

    this.add.text(W / 2, 50, 'CHOOSE YOUR ELEMENT', {
      fontSize: '20px', fontFamily: 'monospace',
      color: '#ffffff', stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5);

    this.add.text(W / 2, 82, 'Deal damage to charge  ·  press Q to unleash', {
      fontSize: '11px', fontFamily: 'monospace', color: '#888888',
    }).setOrigin(0.5);

    const keys = Object.keys(CONFIG.ELEMENTS);
    const cardW = 160, cardH = 190, gap = 18;
    const totalW = keys.length * cardW + (keys.length - 1) * gap;
    const startX = (W - totalW) / 2 + cardW / 2;

    keys.forEach((key, i) => {
      const def = CONFIG.ELEMENTS[key];
      const x = startX + i * (cardW + gap);
      const y = H / 2 + 20;

      const card = this.add.graphics();
      this._drawCard(card, x, y, cardW, cardH, def.color, false);

      this.add.image(x, y - 55, `element_${key}`).setScale(2.5);

      this.add.text(x, y - 10, def.name, {
        fontSize: '15px', fontFamily: 'monospace',
        color: `#${def.color.toString(16).padStart(6, '0')}`,
        stroke: '#000000', strokeThickness: 2,
      }).setOrigin(0.5);

      this.add.text(x, y + 42, def.desc, {
        fontSize: '10px', fontFamily: 'monospace',
        color: '#bbbbbb', align: 'center',
      }).setOrigin(0.5);

      const zone = this.add.zone(x, y, cardW, cardH).setInteractive({ useHandCursor: true });
      zone.on('pointerover', () => this._drawCard(card, x, y, cardW, cardH, def.color, true));
      zone.on('pointerout',  () => this._drawCard(card, x, y, cardW, cardH, def.color, false));
      zone.on('pointerdown', () => {
        this.registry.set('element', key);
        this.cameras.main.fadeOut(300, 0, 0, 0);
        this.time.delayedCall(300, () => this.scene.start('Game'));
      });
    });
  }

  _drawCard(gfx, x, y, w, h, color, hover) {
    gfx.clear();
    gfx.fillStyle(hover ? 0x1a1a2e : 0x0d0d1a, hover ? 0.95 : 0.85);
    gfx.fillRoundedRect(x - w / 2, y - h / 2, w, h, 8);
    gfx.lineStyle(hover ? 2.5 : 1.5, color, hover ? 1 : 0.6);
    gfx.strokeRoundedRect(x - w / 2, y - h / 2, w, h, 8);
  }
}
