class DungeonGenerator {
  constructor(cols, rows) {
    this.cols = cols;
    this.rows = rows;
  }

  generate(floor, opts = {}) {
    const { WALL, FLOOR, STAIRS } = CONFIG.TILES;
    const map = Array.from({ length: this.rows }, () => new Array(this.cols).fill(WALL));

    const roomCount = 7 + Math.min(Math.floor(floor * 0.5), 5);
    const rooms = this._generateRooms(roomCount);

    rooms.forEach(r => this._carveRoom(map, r));

    // Sort rooms roughly by distance and connect sequentially
    rooms.sort((a, b) => (a.cx + a.cy) - (b.cx + b.cy));
    for (let i = 1; i < rooms.length; i++) {
      this._connectRooms(map, rooms[i - 1], rooms[i]);
    }

    // Player starts in first room
    const playerStart = { x: rooms[0].cx, y: rooms[0].cy };

    // Stairs in last room, offset from center
    const last = rooms[rooms.length - 1];
    const stairs = { x: last.cx, y: last.cy };
    map[stairs.y][stairs.x] = STAIRS;

    // Enemies (skip first room)
    const enemies = [];
    for (let i = 1; i < rooms.length; i++) {
      const count = 1 + Math.floor(Math.random() * 3);
      for (let j = 0; j < count; j++) {
        const ex = rooms[i].x + 1 + Math.floor(Math.random() * (rooms[i].w - 2));
        const ey = rooms[i].y + 1 + Math.floor(Math.random() * (rooms[i].h - 2));
        const maxType = Math.min(Math.floor((floor - 1) * 0.6), 2);
        const type = Math.floor(Math.random() * (maxType + 1));
        enemies.push({ x: ex, y: ey, type });
      }
    }

    // Items (skip first room, ~50% chance per room)
    const items = [];
    const itemKeys = Object.keys(CONFIG.ITEMS);
    for (let i = 1; i < rooms.length; i++) {
      if (Math.random() < 0.5) {
        const ix = rooms[i].x + 1 + Math.floor(Math.random() * (rooms[i].w - 2));
        const iy = rooms[i].y + 1 + Math.floor(Math.random() * (rooms[i].h - 2));
        const key = itemKeys[Math.floor(Math.random() * itemKeys.length)];
        items.push({ x: ix, y: iy, type: key });
      }
    }

    // Mark hazard rooms
    if (!opts.noHazard) this._addHazardRooms(rooms, floor);

    // Place pits in narrow corridors
    if (!opts.noPits) this._addPits(map, playerStart, stairs);

    return { map, rooms, playerStart, stairs, enemies, items };
  }

  _addHazardRooms(rooms, floor) {
    const types = ['FIRE', 'ICE', 'WIND', 'LIGHTNING'];
    const count = 1 + Math.floor(floor / 3);
    // Eligible: skip first (spawn) and last (stairs) rooms
    const eligible = rooms.slice(1, -1).slice();
    for (let i = eligible.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [eligible[i], eligible[j]] = [eligible[j], eligible[i]];
    }
    for (let i = 0; i < Math.min(count, eligible.length); i++) {
      eligible[i].hazard = types[Math.floor(Math.random() * types.length)];
    }
  }

  _addPits(map, playerStart, stairs) {
    const { FLOOR, PIT } = CONFIG.TILES;
    const pitTarget = 4 + Math.floor(Math.random() * 4);
    let placed = 0;

    for (let y = 2; y < this.rows - 2 && placed < pitTarget; y++) {
      for (let x = 2; x < this.cols - 2 && placed < pitTarget; x++) {
        if (map[y][x] !== FLOOR) continue;

        // Skip near player start or stairs
        if (Math.abs(x - playerStart.x) < 4 && Math.abs(y - playerStart.y) < 4) continue;
        if (Math.abs(x - stairs.x) < 4 && Math.abs(y - stairs.y) < 4) continue;

        // Horizontal corridor: floor left+right, wall above+below, run-up space
        const isHCorridor =
          map[y][x - 1] === FLOOR && map[y][x + 1] === FLOOR &&
          map[y][x - 2] === FLOOR && map[y][x + 2] === FLOOR &&
          map[y - 1]?.[x] !== FLOOR && map[y + 1]?.[x] !== FLOOR;

        // Vertical corridor: floor above+below, wall left+right, run-up space
        const isVCorridor =
          map[y - 1]?.[x] === FLOOR && map[y + 1]?.[x] === FLOOR &&
          map[y - 2]?.[x] === FLOOR && map[y + 2]?.[x] === FLOOR &&
          map[y][x - 1] !== FLOOR && map[y][x + 1] !== FLOOR;

        if ((isHCorridor || isVCorridor) && Math.random() < 0.25) {
          map[y][x] = PIT;
          placed++;
        }
      }
    }
  }

  _generateRooms(count) {
    const rooms = [];
    for (let i = 0; i < count; i++) {
      let placed = false;
      for (let attempt = 0; attempt < 120 && !placed; attempt++) {
        const w = 5 + Math.floor(Math.random() * 9);
        const h = 4 + Math.floor(Math.random() * 7);
        const x = 2 + Math.floor(Math.random() * (this.cols - w - 4));
        const y = 2 + Math.floor(Math.random() * (this.rows - h - 4));
        const room = { x, y, w, h, cx: Math.floor(x + w / 2), cy: Math.floor(y + h / 2) };
        if (!rooms.some(r => this._overlaps(r, room, 2))) {
          rooms.push(room);
          placed = true;
        }
      }
    }
    return rooms;
  }

  _overlaps(a, b, pad) {
    return !(a.x + a.w + pad <= b.x || b.x + b.w + pad <= a.x ||
             a.y + a.h + pad <= b.y || b.y + b.h + pad <= a.y);
  }

  _carveRoom(map, room) {
    const { FLOOR } = CONFIG.TILES;
    for (let y = room.y; y < room.y + room.h; y++) {
      for (let x = room.x; x < room.x + room.w; x++) {
        map[y][x] = FLOOR;
      }
    }
  }

  _connectRooms(map, a, b) {
    const { FLOOR } = CONFIG.TILES;
    let cx = a.cx, cy = a.cy;

    const setFloor = (x, y) => {
      if (map[y] && map[y][x] !== undefined && map[y][x] !== CONFIG.TILES.STAIRS)
        map[y][x] = FLOOR;
    };

    if (Math.random() < 0.5) {
      while (cx !== b.cx) { setFloor(cx, cy); cx += cx < b.cx ? 1 : -1; }
      while (cy !== b.cy) { setFloor(cx, cy); cy += cy < b.cy ? 1 : -1; }
    } else {
      while (cy !== b.cy) { setFloor(cx, cy); cy += cy < b.cy ? 1 : -1; }
      while (cx !== b.cx) { setFloor(cx, cy); cx += cx < b.cx ? 1 : -1; }
    }
    setFloor(cx, cy);
  }
}
