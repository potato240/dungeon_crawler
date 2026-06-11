const CONFIG = {
  TILE_SIZE: 16,
  MAP_COLS: 80,
  MAP_ROWS: 60,

  TILES: {
    EMPTY: 0,
    WALL: 1,
    FLOOR: 2,
    STAIRS: 3,
    PIT: 4,
  },

  PLAYER: {
    SPEED: 90,
    HP: 100,
    ATTACK: 15,
    ATTACK_RANGE: 26,
    DASH_SPEED: 420,
    DASH_DURATION: 0.17,
    DASH_COOLDOWN: 1.2,
  },

  ENEMIES: [
    { name: 'Slime',  hp: 20,  attack: 6,  speed: 50, color: 0x44dd44, xp: 10 },
    { name: 'Goblin', hp: 40,  attack: 12, speed: 70, color: 0xff8833, xp: 20 },
    { name: 'Troll',  hp: 90,  attack: 22, speed: 45, color: 0xaa3333, xp: 40 },
  ],

  ITEMS: {
    POTION_SMALL: { name: 'Small Potion',   color: 0xff3333, heal: 25 },
    POTION_LARGE: { name: 'Large Potion',   color: 0xcc0000, heal: 50 },
    SWORD:        { name: 'Iron Sword',     color: 0xaaaaee, attackBonus: 10 },
    SHIELD:       { name: 'Leather Shield', color: 0xaa8833, defenseBonus: 5 },
  },
};
