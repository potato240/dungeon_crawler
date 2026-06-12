class UIScene extends Phaser.Scene {
  constructor() { super({ key: 'UI', active: false }); }

  create() {
    const W = this.cameras.main.width;

    // Floor label
    this.floorLabel = this.add.text(10, 8, 'Floor 1', {
      fontSize: '13px', fontFamily: 'monospace',
      color: '#ffffff', stroke: '#000000', strokeThickness: 3,
    }).setScrollFactor(0).setDepth(100);

    // HP bar background + fill
    this.hpBarBg = this.add.graphics().setDepth(100);
    this.hpBarFg = this.add.graphics().setDepth(101);
    this._drawHpBar(1);

    // Stats text
    this.statsText = this.add.text(10, 48, '', {
      fontSize: '10px', fontFamily: 'monospace',
      color: '#cccccc', stroke: '#000000', strokeThickness: 2,
    }).setScrollFactor(0).setDepth(100);

    const isRuneMode = this.scene.get('Game')?.registry?.get('mode') === 'rune';

    // Charge bar (combat only)
    this.chargeBg = this.add.graphics().setDepth(100);
    this.chargeFg = this.add.graphics().setDepth(101);
    this.chargeLabel = this.add.text(10, 68, 'Q', {
      fontSize: '10px', fontFamily: 'monospace',
      color: '#888888', stroke: '#000000', strokeThickness: 2,
    }).setScrollFactor(0).setDepth(102);
    if (isRuneMode) {
      this.chargeBg.setVisible(false);
      this.chargeFg.setVisible(false);
      this.chargeLabel.setVisible(false);
    } else {
      this._drawChargeBar(0);
    }

    // Element icon in top-right (combat only)
    const element = this.scene.get('Game')?.registry?.get('element') || 'AIR';
    const elDef = CONFIG.ELEMENTS[element];
    this.elementIcon = this.add.image(W - 30, 20, `element_${element}`).setDepth(100).setScale(1.4);
    this.elementLabel = this.add.text(W - 55, 36, elDef.name, {
      fontSize: '9px', fontFamily: 'monospace',
      color: `#${elDef.color.toString(16).padStart(6, '0')}`,
    }).setScrollFactor(0).setDepth(100);
    if (isRuneMode) {
      this.elementIcon.setVisible(false);
      this.elementLabel.setVisible(false);
    }

    // Rune counter (rune mode only)
    this.runeLabel = this.add.text(W - 10, 10, '', {
      fontSize: '11px', fontFamily: 'monospace',
      color: '#88ffcc', stroke: '#000000', strokeThickness: 3,
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(102).setVisible(isRuneMode);

    // Stairs arrow (rune mode only) — drawn once, repositioned via event
    this.stairsArrow = this.add.graphics().setDepth(110).setVisible(false);
    this.stairsArrow.fillStyle(0xffee44, 1);
    this.stairsArrow.fillTriangle(-12, -8, -12, 8, 10, 0);
    this.stairsArrow.lineStyle(2, 0xffffff, 0.8);
    this.stairsArrow.strokeTriangle(-12, -8, -12, 8, 10, 0);

    // Message bar at bottom
    this.msgText = this.add.text(W / 2, this.cameras.main.height - 8, '', {
      fontSize: '11px', fontFamily: 'monospace',
      color: '#ffee77', stroke: '#000000', strokeThickness: 3,
      align: 'center', wordWrap: { width: W - 20 },
    }).setOrigin(0.5, 1).setScrollFactor(0).setDepth(100).setAlpha(0);

    this.msgTween = null;

    // Wire up game events
    const game = this.scene.get('Game');
    game.events.on('update-ui',      this._onUpdateUi,     this);
    game.events.on('player-hurt',    this._onPlayerHurt,   this);
    game.events.on('player-healed',  this._onPlayerHealed, this);
    game.events.on('floor-changed',  this._onFloorChanged, this);
    game.events.on('show-message',   this._onShowMessage,  this);
    game.events.on('charge-updated', this._onChargeUpdate, this);
    game.events.on('rune-progress',  this._onRuneProgress,  this);
    game.events.on('stairs-arrow',   this._onStairsArrow,   this);
  }

  _drawHpBar(frac) {
    const bx = 10, by = 26, bw = 140, bh = 12;
    this.hpBarBg.clear();
    this.hpBarBg.fillStyle(0x000000, 0.75);
    this.hpBarBg.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
    this.hpBarBg.fillStyle(0x440000);
    this.hpBarBg.fillRect(bx, by, bw, bh);

    this.hpBarFg.clear();
    const color = frac > 0.5 ? 0x44cc44 : frac > 0.25 ? 0xccaa00 : 0xcc2222;
    this.hpBarFg.fillStyle(color);
    this.hpBarFg.fillRect(bx, by, Math.max(0, bw * frac), bh);
  }

  _onUpdateUi(player) {
    if (!player) return;
    const frac = player.hp / player.maxHp;
    this._drawHpBar(frac);
    this.statsText.setText(`HP ${player.hp}/${player.maxHp}   ATK ${player.attack}   DEF ${player.defense}`);
  }

  _drawChargeBar(charge) {
    const element = this.scene.get('Game')?.registry?.get('element') || 'AIR';
    const elColor = CONFIG.ELEMENTS[element]?.color || 0x88ddff;
    const frac = charge / CONFIG.CHARGE_REQUIRED;
    const bx = 22, by = 66, bw = 128, bh = 10;
    this.chargeBg.clear();
    this.chargeBg.fillStyle(0x000000, 0.7);
    this.chargeBg.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
    this.chargeBg.fillStyle(0x111111);
    this.chargeBg.fillRect(bx, by, bw, bh);
    this.chargeFg.clear();
    if (frac >= 1) {
      // Pulse when ready
      this.chargeFg.fillStyle(elColor, 0.9 + Math.sin(Date.now() * 0.006) * 0.1);
      this.chargeFg.fillRect(bx, by, bw, bh);
      this.chargeLabel.setColor(`#${elColor.toString(16).padStart(6,'0')}`);
    } else {
      this.chargeFg.fillStyle(elColor, 0.7);
      this.chargeFg.fillRect(bx, by, bw * frac, bh);
      this.chargeLabel.setColor('#555555');
    }
  }

  _onChargeUpdate(charge) { this._drawChargeBar(charge); }
  _onRuneProgress(powered, total) {
    if (this.runeLabel) this.runeLabel.setText(`Runes ${powered}/${total}`);
  }

  _onStairsArrow({ angle, onScreen }) {
    if (!this.stairsArrow) return;
    if (onScreen) { this.stairsArrow.setVisible(false); return; }
    const W = this.cameras.main.width, H = this.cameras.main.height;
    const margin = 30;
    const halfW = W / 2 - margin, halfH = H / 2 - margin;
    const cosA = Math.cos(angle), sinA = Math.sin(angle);
    const s = Math.min(
      Math.abs(cosA) > 0.001 ? halfW / Math.abs(cosA) : Infinity,
      Math.abs(sinA) > 0.001 ? halfH / Math.abs(sinA) : Infinity
    );
    this.stairsArrow.setVisible(true);
    this.stairsArrow.x = W / 2 + cosA * s;
    this.stairsArrow.y = H / 2 + sinA * s;
    this.stairsArrow.rotation = angle;
  }
  _onPlayerHurt(player) { this._onUpdateUi(player); }
  _onPlayerHealed(player) { this._onUpdateUi(player); }

  _onFloorChanged(floor) {
    this.floorLabel.setText(`Floor ${floor}`);
  }

  _onShowMessage(msg) {
    if (this.msgTween) this.msgTween.stop();
    this.msgText.setText(msg).setAlpha(1);
    this.msgTween = this.tweens.add({
      targets: this.msgText,
      alpha: 0,
      delay: 2800,
      duration: 600,
    });
  }
}
