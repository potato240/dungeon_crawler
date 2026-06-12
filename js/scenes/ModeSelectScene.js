class ModeSelectScene extends Phaser.Scene {
  constructor() { super('ModeSelect'); }

  create() {
    const W = this.cameras.main.width;
    const H = this.cameras.main.height;

    this.add.rectangle(W / 2, H / 2, W, H, 0x0a0808);

    this.add.text(W / 2, 70, 'DUNGEON CRAWLER', {
      fontSize: '22px', fontFamily: 'monospace',
      color: '#ffffff', stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5);

    this.add.text(W / 2, 100, 'Choose a mode', {
      fontSize: '11px', fontFamily: 'monospace', color: '#888888',
    }).setOrigin(0.5);

    this._makeCard(W / 2 - 130, H / 2, 'COMBAT', [
      'Battle through floors',
      'Attack enemies',
      'Collect loot',
      'Elemental powers',
    ], 0xcc4422, () => {
      this.registry.set('mode', 'combat');
      this.scene.start('ElementSelect');
    });

    this._makeCard(W / 2 + 130, H / 2, 'RUNE SEEKER', [
      'No combat',
      'Find & charge runes',
      'Avoid enemies',
      'Unlock the stairs',
    ], 0x6644cc, () => {
      this.registry.set('mode', 'rune');
      this.scene.start('Game');
    });
  }

  _makeCard(x, y, title, lines, color, onClick) {
    const W = 200, H = 200;
    const bg = this.add.rectangle(x, y, W, H, 0x111111).setInteractive({ useHandCursor: true });
    const border = this.add.rectangle(x, y, W, H).setStrokeStyle(2, color, 0.6).setFillStyle();

    this.add.text(x, y - 70, title, {
      fontSize: '14px', fontFamily: 'monospace',
      color: `#${color.toString(16).padStart(6, '0')}`,
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5);

    lines.forEach((line, i) => {
      this.add.text(x, y - 30 + i * 22, `• ${line}`, {
        fontSize: '10px', fontFamily: 'monospace', color: '#aaaaaa',
      }).setOrigin(0.5);
    });

    bg.on('pointerover', () => {
      bg.setFillColor(0x222233);
      border.setStrokeStyle(2, color, 1);
    });
    bg.on('pointerout', () => {
      bg.setFillColor(0x111111);
      border.setStrokeStyle(2, color, 0.6);
    });
    bg.on('pointerdown', () => {
      this.cameras.main.fadeOut(300, 0, 0, 0);
      this.time.delayedCall(300, onClick);
    });
  }
}
