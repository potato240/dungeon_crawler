class Item extends Phaser.GameObjects.Image {
  constructor(scene, x, y, itemKey) {
    super(scene, x, y, `item_${itemKey}`);
    scene.add.existing(this);
    this.setDepth(5);

    this.itemKey = itemKey;
    this.def = CONFIG.ITEMS[itemKey];

    this._baseY = y;
    scene.tweens.add({
      targets: this,
      y: y - 4,
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  collect(player) {
    const def = this.def;
    if (def.heal) {
      player.heal(def.heal);
      this.scene.showMessage(`Picked up ${def.name} (+${def.heal} HP)`);
    }
    if (def.attackBonus) {
      player.attack += def.attackBonus;
      this.scene.showMessage(`Equipped ${def.name}! ATK +${def.attackBonus}`);
      this.scene.events.emit('player-healed', player);
    }
    if (def.defenseBonus) {
      player.defense += def.defenseBonus;
      this.scene.showMessage(`Equipped ${def.name}! DEF +${def.defenseBonus}`);
      this.scene.events.emit('player-healed', player);
    }
    this.scene.tweens.killTweensOf(this);
    this.destroy();
  }
}
