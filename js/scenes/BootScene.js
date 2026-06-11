class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }

  create() {
    const T = CONFIG.TILE_SIZE;

    // Tileset: wall(1), floor(2), stairs(3) — index 0 = empty
    // Image is 4*T wide, T tall: positions 0=empty 1=wall 2=floor 3=stairs
    const tg = this.make.graphics({ add: false });

    // Slot 0: empty (transparent — leave blank)

    // Slot 1: wall
    tg.fillStyle(0x1a1008);
    tg.fillRect(T, 0, T, T);
    tg.fillStyle(0x2e1e0e);
    tg.fillRect(T + 1, 1, T - 2, T - 2);
    tg.fillStyle(0x3a2810);
    tg.fillRect(T + 2, 2, T - 4, T - 4);

    // Slot 2: floor
    tg.fillStyle(0x383030);
    tg.fillRect(T * 2, 0, T, T);
    tg.fillStyle(0x484040);
    tg.fillRect(T * 2 + 1, 1, T - 2, T - 2);
    // subtle tile grout lines
    tg.fillStyle(0x302828);
    tg.fillRect(T * 2, T / 2, T, 1);
    tg.fillRect(T * 2 + T / 2, 0, 1, T);

    // Slot 3: stairs
    tg.fillStyle(0x484040);
    tg.fillRect(T * 3, 0, T, T);
    // stair steps
    tg.fillStyle(0xddaa00);
    for (let i = 0; i < 4; i++) {
      tg.fillRect(T * 3 + 2 + i, 2 + i * 3, T - 4 - i * 2, 2);
    }
    tg.fillStyle(0xffcc44);
    tg.fillRect(T * 3 + 4, T - 5, T - 8, 3);

    tg.generateTexture('tiles', T * 4, T);
    tg.destroy();

    // Player
    const pg = this.make.graphics({ add: false });
    pg.fillStyle(0x2255cc);
    pg.fillRect(0, 0, T, T);
    pg.fillStyle(0x4477ff);
    pg.fillRect(1, 3, T - 2, T - 4);
    // direction nub (faces right by default)
    pg.fillStyle(0xaaccff);
    pg.fillTriangle(T - 3, T / 2 - 2, T - 3, T / 2 + 2, T, T / 2);
    pg.generateTexture('player', T, T);
    pg.destroy();

    // Enemies
    CONFIG.ENEMIES.forEach((def, i) => {
      const eg = this.make.graphics({ add: false });
      const c = def.color;
      eg.fillStyle(c);
      eg.fillRect(0, 0, T, T);
      // slightly lighter body
      const r = ((c >> 16) & 0xff), g = ((c >> 8) & 0xff), b = c & 0xff;
      const lighter = (Math.min(r + 30, 255) << 16) | (Math.min(g + 30, 255) << 8) | Math.min(b + 30, 255);
      eg.fillStyle(lighter);
      eg.fillRect(2, 2, T - 4, T - 5);
      // eyes
      eg.fillStyle(0xffffff);
      eg.fillRect(3, 4, 3, 3);
      eg.fillRect(T - 6, 4, 3, 3);
      eg.fillStyle(0x000000);
      eg.fillRect(4, 5, 1, 1);
      eg.fillRect(T - 5, 5, 1, 1);
      eg.generateTexture(`enemy_${i}`, T, T);
      eg.destroy();
    });

    // Items
    Object.entries(CONFIG.ITEMS).forEach(([key, def]) => {
      const ig = this.make.graphics({ add: false });
      ig.fillStyle(def.color);
      if (key.startsWith('POTION')) {
        // flask silhouette
        ig.fillCircle(T / 2, T / 2 + 3, 5);
        ig.fillRect(T / 2 - 2, 2, 4, 7);
        ig.fillStyle(0xffffff, 0.4);
        ig.fillCircle(T / 2 - 1, T / 2 + 1, 2);
      } else {
        // rectangle icon for gear
        ig.fillRect(2, 2, T - 4, T - 4);
        ig.fillStyle(0xffffff, 0.3);
        ig.fillRect(3, 3, 4, T - 6);
      }
      ig.generateTexture(`item_${key}`, T, T);
      ig.destroy();
    });

    // Attack flash
    const ag = this.make.graphics({ add: false });
    ag.fillStyle(0xffffff, 0.85);
    ag.fillCircle(10, 10, 10);
    ag.generateTexture('attack_fx', 20, 20);
    ag.destroy();

    this.scene.start('Game');
  }
}
