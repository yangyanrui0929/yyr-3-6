import {
  GridCell,
  GRID_SIZE,
  WIRE_CONNECTIONS,
  DIR_OFFSETS,
  BUILDING_STATS,
  DAY_THRESHOLD,
  NOISE_THRESHOLD,
  POWER_STABILITY_THRESHOLD,
  COMFORT_LAMP_THRESHOLD,
} from './constants';

export function isWireConnected(wire: GridCell, direction: number): boolean {
  if (wire.type !== 'wire') return false;
  const connections = WIRE_CONNECTIONS[wire.rotation % 6];
  if (!connections) return false;
  return connections[direction];
}

export function getOppositeDirection(dir: number): number {
  return (dir + 2) % 4;
}

export function calculatePowerNetwork(
  grid: GridCell[][],
  dayTime: number,
  storedPower: number,
  windBoost: number = 0
): {
  poweredCells: Set<string>;
  totalGeneration: number;
  totalConsumption: number;
  batteryCapacity: number;
} {
  const isDay = dayTime < DAY_THRESHOLD;
  let totalGeneration = 0;
  let totalConsumption = 0;
  let batteryCapacity = 0;

  const windmillSources: Array<{ x: number; y: number; gen: number }> = [];
  const batterySources: Array<{ x: number; y: number; discharge: number }> = [];

  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      const cell = grid[y][x];
      if (cell.faulty) continue;

      if (cell.type === 'windmill') {
        const baseGen = isDay
          ? BUILDING_STATS.windmill.dayGen
          : BUILDING_STATS.windmill.nightGen;
        const gen = baseGen + windBoost;
        totalGeneration += gen;
        windmillSources.push({ x, y, gen });
      }
      if (cell.type === 'battery') {
        batteryCapacity += BUILDING_STATS.battery.storage;
      }
      if (cell.type === 'house') {
        totalConsumption += BUILDING_STATS.house.consumption;
      }
      if (cell.type === 'factory') {
        totalConsumption += BUILDING_STATS.factory.consumption;
      }
      if (cell.type === 'lamp') {
        totalConsumption += BUILDING_STATS.lamp.consumption;
      }
    }
  }

  const availableFromBatteries = Math.max(0, storedPower);
  const totalAvailable = totalGeneration + availableFromBatteries;

  if (availableFromBatteries > 0) {
    const batteryCount = grid.flat().filter(
      (c) => c.type === 'battery' && !c.faulty
    ).length;
    if (batteryCount > 0) {
      const dischargePerBattery = availableFromBatteries / batteryCount;
      for (let y = 0; y < GRID_SIZE; y++) {
        for (let x = 0; x < GRID_SIZE; x++) {
          const cell = grid[y][x];
          if (cell.type === 'battery' && !cell.faulty) {
            batterySources.push({ x, y, discharge: dischargePerBattery });
          }
        }
      }
    }
  }

  const allSources = [
    ...windmillSources.map((s) => ({ x: s.x, y: s.y })),
    ...batterySources.map((s) => ({ x: s.x, y: s.y })),
  ];

  const connectedCells = new Set<string>();
  const visited = new Set<string>();
  const queue: Array<{ x: number; y: number }> = [...allSources];

  for (const s of allSources) {
    visited.add(`${s.x},${s.y}`);
    connectedCells.add(`${s.x},${s.y}`);
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentCell = grid[current.y][current.x];

    for (let dir = 0; dir < 4; dir++) {
      const [dx, dy] = DIR_OFFSETS[dir];
      const nx = current.x + dx;
      const ny = current.y + dy;

      if (nx < 0 || nx >= GRID_SIZE || ny < 0 || ny >= GRID_SIZE) continue;

      const neighbor = grid[ny][nx];
      if (neighbor.faulty) continue;

      const key = `${nx},${ny}`;
      if (visited.has(key)) continue;

      let canConnectFromCurrent = false;
      if (currentCell.type === 'wire') {
        canConnectFromCurrent = isWireConnected(currentCell, dir);
      } else if (
        currentCell.type === 'windmill' ||
        currentCell.type === 'house' ||
        currentCell.type === 'factory' ||
        currentCell.type === 'battery' ||
        currentCell.type === 'lamp'
      ) {
        canConnectFromCurrent = true;
      }

      let canConnectFromNeighbor = false;
      if (neighbor.type === 'wire') {
        canConnectFromNeighbor = isWireConnected(neighbor, getOppositeDirection(dir));
      } else if (
        neighbor.type === 'windmill' ||
        neighbor.type === 'house' ||
        neighbor.type === 'factory' ||
        neighbor.type === 'battery' ||
        neighbor.type === 'lamp'
      ) {
        canConnectFromNeighbor = true;
      }

      if (canConnectFromCurrent && canConnectFromNeighbor) {
        visited.add(key);
        connectedCells.add(key);
        if (neighbor.type === 'wire') {
          queue.push({ x: nx, y: ny });
        }
      }
    }
  }

  const poweredCells = new Set<string>();

  for (const s of allSources) {
    poweredCells.add(`${s.x},${s.y}`);
  }

  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      const cell = grid[y][x];
      if (cell.type === 'wire' && connectedCells.has(`${x},${y}`)) {
        poweredCells.add(`${x},${y}`);
      }
    }
  }

  const connectedConsumers: Array<{
    x: number;
    y: number;
    consumption: number;
    priority: number;
  }> = [];
  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      const cell = grid[y][x];
      if (!connectedCells.has(`${x},${y}`)) continue;

      if (cell.type === 'house') {
        connectedConsumers.push({
          x,
          y,
          consumption: BUILDING_STATS.house.consumption,
          priority: 1,
        });
      }
      if (cell.type === 'lamp') {
        connectedConsumers.push({
          x,
          y,
          consumption: BUILDING_STATS.lamp.consumption,
          priority: 2,
        });
      }
      if (cell.type === 'factory') {
        connectedConsumers.push({
          x,
          y,
          consumption: BUILDING_STATS.factory.consumption,
          priority: 3,
        });
      }
    }
  }

  let remainingPower = totalAvailable;
  connectedConsumers.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return a.consumption - b.consumption;
  });

  for (const consumer of connectedConsumers) {
    if (remainingPower >= consumer.consumption) {
      remainingPower -= consumer.consumption;
      poweredCells.add(`${consumer.x},${consumer.y}`);
    }
  }

  return { poweredCells, totalGeneration, totalConsumption, batteryCapacity };
}

export function countPoweredBuildings(
  grid: GridCell[][],
  poweredCells: Set<string>
): { houses: number; poweredHouses: number; factories: number; poweredFactories: number } {
  let houses = 0;
  let poweredHouses = 0;
  let factories = 0;
  let poweredFactories = 0;

  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      const cell = grid[y][x];
      if (cell.type === 'house') {
        houses++;
        if (poweredCells.has(`${x},${y}`)) poweredHouses++;
      }
      if (cell.type === 'factory') {
        factories++;
        if (poweredCells.has(`${x},${y}`)) poweredFactories++;
      }
    }
  }

  return { houses, poweredHouses, factories: factories, poweredFactories };
}

export function calculateNoiseMap(grid: GridCell[][]): number[][] {
  const noiseMap: number[][] = [];
  for (let y = 0; y < GRID_SIZE; y++) {
    const row: number[] = [];
    for (let x = 0; x < GRID_SIZE; x++) {
      row.push(0);
    }
    noiseMap.push(row);
  }

  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      const cell = grid[y][x];
      if (cell.faulty) continue;
      const stats = BUILDING_STATS[cell.type];
      if (!stats || !('noise' in stats)) continue;
      const noiseLevel = (stats as { noise: number }).noise;
      if (noiseLevel <= 0) continue;

      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || nx >= GRID_SIZE || ny < 0 || ny >= GRID_SIZE) continue;
          const distance = Math.sqrt(dx * dx + dy * dy);
          if (distance > 2) continue;
          const falloff = 1 - distance / 2.5;
          noiseMap[ny][nx] += noiseLevel * Math.max(0, falloff);
        }
      }
    }
  }

  return noiseMap;
}

export function getAverageNoise(noiseMap: number[][]): number {
  let total = 0;
  let count = 0;
  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      total += noiseMap[y][x];
      count++;
    }
  }
  return count > 0 ? total / count : 0;
}

export function countPoweredLamps(
  grid: GridCell[][],
  poweredCells: Set<string>
): { lamps: number; poweredLamps: number } {
  let lamps = 0;
  let poweredLamps = 0;

  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      const cell = grid[y][x];
      if (cell.type === 'lamp') {
        lamps++;
        if (poweredCells.has(`${x},${y}`)) poweredLamps++;
      }
    }
  }

  return { lamps, poweredLamps };
}

export function calculatePowerStability(
  grid: GridCell[][],
  poweredCells: Set<string>
): number {
  const { houses, poweredHouses } = countPoweredBuildings(grid, poweredCells);
  const { lamps, poweredLamps } = countPoweredLamps(grid, poweredCells);
  const totalBuildings = houses + lamps;
  const totalPowered = poweredHouses + poweredLamps;

  const hasFlicker = grid.some((row) => row.some((cell) => cell.faulty && cell.type === 'wire'));

  const baseStability = totalBuildings > 0 ? totalPowered / totalBuildings : 1;
  const flickerPenalty = hasFlicker ? 0.3 : 0;

  return Math.max(0, baseStability - flickerPenalty);
}

export function isDockingZoneSuitable(
  grid: GridCell[][],
  poweredCells: Set<string>,
  noiseMap: number[][],
  centerX: number,
  centerY: number,
  radius: number
): { suitable: boolean; reasons: string[]; score: number } {
  const reasons: string[] = [];
  let score = 0;

  let totalNoise = 0;
  let cellCount = 0;
  let comfortLamps = 0;

  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const nx = centerX + dx;
      const ny = centerY + dy;
      if (nx < 0 || nx >= GRID_SIZE || ny < 0 || ny >= GRID_SIZE) continue;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance > radius) continue;

      totalNoise += noiseMap[ny][nx];
      cellCount++;

      const cell = grid[ny][nx];
      if (cell.type === 'lamp' && poweredCells.has(`${nx},${ny}`) && !cell.faulty) {
        comfortLamps++;
      }
    }
  }

  const avgNoise = cellCount > 0 ? totalNoise / cellCount : 0;
  const stability = calculatePowerStability(grid, poweredCells);

  if (avgNoise > NOISE_THRESHOLD) {
    reasons.push('噪声过高');
  } else {
    score += (NOISE_THRESHOLD - avgNoise) * 10;
  }
  if (stability < POWER_STABILITY_THRESHOLD) {
    reasons.push('供电不稳定');
  } else {
    score += stability * 20;
  }
  if (comfortLamps < COMFORT_LAMP_THRESHOLD) {
    reasons.push('照明不足');
  } else {
    score += comfortLamps * 5;
  }

  return {
    suitable: reasons.length === 0,
    reasons,
    score,
  };
}

export function findBestDockingSpot(
  grid: GridCell[][],
  poweredCells: Set<string>,
  noiseMap: number[][],
  radius: number = 2
): { x: number; y: number; suitable: boolean; score: number; reasons: string[] } {
  let bestSpot = { x: Math.floor(GRID_SIZE / 2), y: Math.floor(GRID_SIZE / 2), suitable: false, score: -Infinity, reasons: [] as string[] };

  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      const result = isDockingZoneSuitable(grid, poweredCells, noiseMap, x, y, radius);
      if (result.score > bestSpot.score) {
        bestSpot = { x, y, suitable: result.suitable, score: result.score, reasons: result.reasons };
      }
    }
  }

  return bestSpot;
}
