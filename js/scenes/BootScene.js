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

    // Slot 4: pit (void)
    tg.fillStyle(0x06060f);
    tg.fillRect(T * 4, 0, T, T);
    tg.fillStyle(0x0c0c22);
    tg.fillRect(T * 4 + 1, 1, T - 2, T - 2);
    tg.fillStyle(0x050510);
    tg.fillRect(T * 4 + 3, 3, T - 6, T - 6);
    // purple shimmer edges
    tg.fillStyle(0x2a1055);
    tg.fillRect(T * 4 + 1, 1, T - 2, 1);
    tg.fillRect(T * 4 + 1, T - 2, T - 2, 1);
    tg.fillRect(T * 4 + 1, 1, 1, T - 2);
    tg.fillRect(T * 4 + T - 2, 1, 1, T - 2);

    // Slot 5: lava
    tg.fillStyle(0x1a0200);
    tg.fillRect(T * 5, 0, T, T);
    tg.fillStyle(0x8b1500);
    tg.fillRect(T * 5 + 1, 1, T - 2, T - 2);
    // lava glow blobs
    tg.fillStyle(0xff4400);
    tg.fillRect(T * 5 + 2, 2, T - 4, 4);
    tg.fillRect(T * 5 + 2, T - 6, T - 4, 4);
    tg.fillStyle(0xff8800);
    tg.fillRect(T * 5 + 4, 4, 4, 4);
    tg.fillRect(T * 5 + T - 8, T - 8, 4, 4);
    tg.fillStyle(0xffcc00, 0.8);
    tg.fillRect(T * 5 + 6, 6, 2, 2);
    tg.fillRect(T * 5 + T - 8, 5, 2, 2);

    tg.generateTexture('tiles', T * 6, T);
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

    // Tornado super texture (32x32 vortex)
    const tvg = this.make.graphics({ add: false });
    tvg.fillStyle(0x446688); tvg.fillCircle(16, 16, 15);
    tvg.fillStyle(0x334455); tvg.fillCircle(16, 16, 11);
    tvg.fillStyle(0x223344); tvg.fillCircle(16, 16, 7);
    tvg.fillStyle(0x112233); tvg.fillCircle(16, 16, 4);
    // swirl arms
    tvg.fillStyle(0x88aacc);
    tvg.fillRect(15, 2,  3, 10);
    tvg.fillRect(20, 15, 10, 3);
    tvg.fillRect(13, 20, 3, 10);
    tvg.fillRect(2,  13, 10, 3);
    tvg.generateTexture('tornado_super', 32, 32);
    tvg.destroy();

    // Element icons (20x20 each)
    const elDefs = [
      ['AIR',       0x88ddff, (g) => { // wind swirl
        g.fillStyle(0x88ddff); g.fillCircle(10, 10, 8);
        g.fillStyle(0x223344); g.fillCircle(10, 10, 4);
        g.fillStyle(0xaaeeff); g.fillRect(9, 1, 3, 7); g.fillRect(13, 9, 7, 3);
      }],
      ['FIRE',      0xff6622, (g) => { // flame
        g.fillStyle(0xff2200); g.fillTriangle(10, 1, 2, 19, 18, 19);
        g.fillStyle(0xff8800); g.fillTriangle(10, 5, 5, 17, 15, 17);
        g.fillStyle(0xffcc00); g.fillCircle(10, 14, 4);
      }],
      ['ICE',       0x44aaff, (g) => { // crystal
        g.fillStyle(0x44aaff); g.fillRect(9, 1, 3, 18); g.fillRect(1, 9, 18, 3);
        g.fillStyle(0x88ccff); g.fillRect(4, 4, 3, 3); g.fillRect(13, 4, 3, 3);
        g.fillRect(4, 13, 3, 3); g.fillRect(13, 13, 3, 3);
        g.fillStyle(0xffffff); g.fillCircle(10, 10, 3);
      }],
      ['LIGHTNING', 0xffee22, (g) => { // bolt
        g.fillStyle(0xffee22);
        g.fillTriangle(13, 1, 6, 11, 11, 11);
        g.fillTriangle(14, 9, 9, 19, 16, 9);
      }],
    ];
    elDefs.forEach(([key, , draw]) => {
      const eg2 = this.make.graphics({ add: false });
      draw(eg2);
      eg2.generateTexture(`element_${key}`, 20, 20);
      eg2.destroy();
    });

    // Rune idle (16x16 purple diamond with cross)
    const rig = this.make.graphics({ add: false });
    rig.fillStyle(0x220033, 1);
    rig.fillTriangle(8, 1, 15, 8, 8, 15);
    rig.fillTriangle(8, 1, 1, 8, 8, 15);
    rig.lineStyle(1, 0xaa77ee, 1);
    rig.lineBetween(8, 1, 15, 8); rig.lineBetween(15, 8, 8, 15);
    rig.lineBetween(8, 15, 1, 8); rig.lineBetween(1, 8, 8, 1);
    rig.lineStyle(1, 0xcc99ff, 0.9);
    rig.lineBetween(8, 3, 8, 13); rig.lineBetween(3, 8, 13, 8);
    rig.generateTexture('rune_idle', 16, 16);
    rig.destroy();

    // Rune charged (16x16 cyan diamond)
    const rcg = this.make.graphics({ add: false });
    rcg.fillStyle(0x003322, 1);
    rcg.fillTriangle(8, 1, 15, 8, 8, 15);
    rcg.fillTriangle(8, 1, 1, 8, 8, 15);
    rcg.lineStyle(1, 0x44ffcc, 1);
    rcg.lineBetween(8, 1, 15, 8); rcg.lineBetween(15, 8, 8, 15);
    rcg.lineBetween(8, 15, 1, 8); rcg.lineBetween(1, 8, 8, 1);
    rcg.lineStyle(1, 0xaaffee, 1);
    rcg.lineBetween(8, 3, 8, 13); rcg.lineBetween(3, 8, 13, 8);
    rcg.fillStyle(0xffffff, 1); rcg.fillCircle(8, 8, 2);
    rcg.generateTexture('rune_charged', 16, 16);
    rcg.destroy();

    this.scene.start('ModeSelect');
  }
}
