import { create } from 'zustand';
import {
  GridCell,
  ToolType,
  GRID_SIZE,
  DAY_LENGTH,
  FAULT_CHANCE,
  DAY_THRESHOLD,
  CloudWhaleData,
  CLOUD_WHALE_VISIT_INTERVAL,
  CLOUD_WHALE_APPROACH_DURATION,
  CLOUD_WHALE_LEAVE_DURATION,
  CLOUD_WHALE_MIN_DOCK_TIME,
  CLOUD_WHALE_MAX_DOCK_TIME,
  CLOUD_WHALE_WIND_BOOST,
  CLOUD_WHALE_CRYSTAL_PER_TICK,
} from '../utils/constants';
import {
  calculatePowerNetwork,
  countPoweredBuildings,
  calculateNoiseMap,
  calculatePowerStability,
  isDockingZoneSuitable,
  findBestDockingSpot,
} from '../utils/powerCalculator';

const STORAGE_KEY = 'floating-island-grid-game-save';

interface PersistedState {
  grid: GridCell[][];
  dayTime: number;
  storedPower: number;
  satisfaction: number;
  cloudCrystals: number;
  cloudWhale: CloudWhaleData;
}

interface GameState {
  grid: GridCell[][];
  dayTime: number;
  storedPower: number;
  maxStorage: number;
  satisfaction: number;
  selectedTool: ToolType;
  poweredCells: Set<string>;
  totalGeneration: number;
  totalConsumption: number;
  showSettlement: boolean;
  cloudCrystals: number;
  cloudWhale: CloudWhaleData;
  noiseMap: number[][];
  powerStability: number;
  windBoost: number;
  setSelectedTool: (tool: ToolType) => void;
  placeOrRemove: (x: number, y: number) => void;
  rotateCell: (x: number, y: number) => void;
  repairCell: (x: number, y: number) => void;
  tick: () => void;
  resetGame: () => void;
  openSettlement: () => void;
  closeSettlement: () => void;
}

function createEmptyGrid(): GridCell[][] {
  const grid: GridCell[][] = [];
  for (let y = 0; y < GRID_SIZE; y++) {
    const row: GridCell[] = [];
    for (let x = 0; x < GRID_SIZE; x++) {
      row.push({
        x,
        y,
        type: 'empty',
        rotation: 0,
        powered: false,
        faulty: false,
      });
    }
    grid.push(row);
  }
  return grid;
}

function saveToLocalStorage(state: PersistedState): void {
  try {
    const data = JSON.stringify({
      grid: state.grid,
      dayTime: state.dayTime,
      storedPower: state.storedPower,
      satisfaction: state.satisfaction,
      cloudCrystals: state.cloudCrystals,
      cloudWhale: state.cloudWhale,
    });
    localStorage.setItem(STORAGE_KEY, data);
  } catch {
    // ignore storage errors
  }
}

function loadFromLocalStorage(): PersistedState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data && data.grid && Array.isArray(data.grid)) {
      return {
        grid: data.grid,
        dayTime: data.dayTime ?? 20,
        storedPower: data.storedPower ?? 10,
        satisfaction: data.satisfaction ?? 50,
        cloudCrystals: data.cloudCrystals ?? 0,
        cloudWhale: data.cloudWhale ?? {
          state: 'away' as const,
          progress: 0,
          dockedTicks: 0,
          nextVisitIn: CLOUD_WHALE_VISIT_INTERVAL,
          satisfaction: 100,
          dockX: Math.floor(GRID_SIZE / 2),
          dockY: Math.floor(GRID_SIZE / 2),
        },
      };
    }
  } catch {
    // ignore parse errors
  }
  return null;
}

function recalcGrid(grid: GridCell[][], dayTime: number, storedPower: number, windBoost: number = 0) {
  const { poweredCells, totalGeneration, totalConsumption, batteryCapacity } =
    calculatePowerNetwork(grid, dayTime, storedPower, windBoost);

  const newGrid = grid.map((row) => row.map((c) => ({ ...c })));
  for (let yy = 0; yy < GRID_SIZE; yy++) {
    for (let xx = 0; xx < GRID_SIZE; xx++) {
      newGrid[yy][xx].powered = poweredCells.has(`${xx},${yy}`);
    }
  }

  const noiseMap = calculateNoiseMap(newGrid);
  const powerStability = calculatePowerStability(newGrid, poweredCells);

  return {
    newGrid,
    poweredCells,
    totalGeneration,
    totalConsumption,
    batteryCapacity,
    noiseMap,
    powerStability,
  };
}

function initGame(): Omit<GameState, keyof GameStateActions> {
  const saved = loadFromLocalStorage();
  const grid = saved ? saved.grid : createEmptyGrid();
  const dayTime = saved ? saved.dayTime : 20;
  const storedPower = saved ? saved.storedPower : 10;
  const satisfaction = saved ? saved.satisfaction : 50;
  const cloudCrystals = saved ? saved.cloudCrystals : 0;
  const cloudWhale = saved
    ? saved.cloudWhale
    : {
        state: 'away' as const,
        progress: 0,
        dockedTicks: 0,
        nextVisitIn: CLOUD_WHALE_VISIT_INTERVAL,
        satisfaction: 100,
        dockX: Math.floor(GRID_SIZE / 2),
        dockY: Math.floor(GRID_SIZE / 2),
      };

  const windBoost = cloudWhale.state === 'docked' ? CLOUD_WHALE_WIND_BOOST : 0;

  const { newGrid, poweredCells, totalGeneration, totalConsumption, batteryCapacity, noiseMap, powerStability } =
    recalcGrid(grid, dayTime, storedPower, windBoost);

  return {
    grid: newGrid,
    dayTime,
    storedPower,
    maxStorage: batteryCapacity,
    satisfaction,
    selectedTool: 'windmill',
    poweredCells,
    totalGeneration,
    totalConsumption,
    showSettlement: false,
    cloudCrystals,
    cloudWhale,
    noiseMap,
    powerStability,
    windBoost,
  };
}

type GameStateActions = Pick<
  GameState,
  | 'setSelectedTool'
  | 'placeOrRemove'
  | 'rotateCell'
  | 'repairCell'
  | 'tick'
  | 'resetGame'
  | 'openSettlement'
  | 'closeSettlement'
>;

function updateCloudWhale(
  state: GameState,
  grid: GridCell[][],
  poweredCells: Set<string>,
  noiseMap: number[][]
): {
  cloudWhale: CloudWhaleData;
  windBoost: number;
  cloudCrystals: number;
} {
  const whale = { ...state.cloudWhale };
  let windBoost = 0;
  let cloudCrystals = state.cloudCrystals;

  switch (whale.state) {
    case 'away':
      whale.nextVisitIn--;
      if (whale.nextVisitIn <= 0) {
        whale.state = 'approaching';
        whale.progress = 0;
        whale.satisfaction = 100;
        const bestSpot = findBestDockingSpot(grid, poweredCells, noiseMap, 2);
        whale.dockX = bestSpot.x;
        whale.dockY = bestSpot.y;
      }
      break;

    case 'approaching': {
      whale.progress++;
      if (whale.progress >= CLOUD_WHALE_APPROACH_DURATION) {
        const bestSpot = findBestDockingSpot(grid, poweredCells, noiseMap, 2);
        whale.dockX = bestSpot.x;
        whale.dockY = bestSpot.y;

        if (bestSpot.suitable) {
          whale.state = 'docked';
          whale.dockedTicks = 0;
          whale.satisfaction = 100;
        } else {
          whale.state = 'leaving';
          whale.progress = 0;
        }
      }
      break;
    }

    case 'docked': {
      whale.dockedTicks++;
      windBoost = CLOUD_WHALE_WIND_BOOST;
      cloudCrystals += CLOUD_WHALE_CRYSTAL_PER_TICK;

      const result = isDockingZoneSuitable(
        grid,
        poweredCells,
        noiseMap,
        whale.dockX,
        whale.dockY,
        2
      );

      if (!result.suitable) {
        whale.satisfaction -= result.reasons.length * 3;
      } else {
        whale.satisfaction = Math.min(100, whale.satisfaction + 0.3);
      }

      const maxDockTime = CLOUD_WHALE_MIN_DOCK_TIME +
        Math.floor(Math.random() * (CLOUD_WHALE_MAX_DOCK_TIME - CLOUD_WHALE_MIN_DOCK_TIME));

      if (whale.satisfaction <= 0 || whale.dockedTicks >= maxDockTime) {
        whale.state = 'leaving';
        whale.progress = 0;
      }
      break;
    }

    case 'leaving':
      whale.progress++;
      if (whale.progress >= CLOUD_WHALE_LEAVE_DURATION) {
        whale.state = 'away';
        whale.nextVisitIn = CLOUD_WHALE_VISIT_INTERVAL +
          Math.floor(Math.random() * CLOUD_WHALE_VISIT_INTERVAL * 0.5);
        whale.progress = 0;
        whale.dockedTicks = 0;
      }
      break;
  }

  return { cloudWhale: whale, windBoost, cloudCrystals };
}

export const useGameStore = create<GameState>((set, get) => ({
  ...initGame(),

  setSelectedTool: (tool) => set({ selectedTool: tool }),

  placeOrRemove: (x, y) => {
    const state = get();
    const newGrid = state.grid.map((row) => row.map((c) => ({ ...c })));
    const cell = newGrid[y][x];
    const tool = state.selectedTool;

    if (tool === 'remove') {
      if (cell.type !== 'empty') {
        newGrid[y][x] = {
          ...cell,
          type: 'empty',
          rotation: 0,
          powered: false,
          faulty: false,
        };
      }
    } else {
      newGrid[y][x] = {
        ...cell,
        type: tool,
        rotation: tool === 'wire' ? cell.rotation % 6 : 0,
        powered: false,
        faulty: false,
      };
    }

    const windBoost = state.cloudWhale.state === 'docked' ? CLOUD_WHALE_WIND_BOOST : 0;
    const result = recalcGrid(newGrid, state.dayTime, state.storedPower, windBoost);

    const nextState = {
      grid: result.newGrid,
      poweredCells: result.poweredCells,
      totalGeneration: result.totalGeneration,
      totalConsumption: result.totalConsumption,
      maxStorage: result.batteryCapacity,
      noiseMap: result.noiseMap,
      powerStability: result.powerStability,
    };

    saveToLocalStorage({
      grid: result.newGrid,
      dayTime: state.dayTime,
      storedPower: state.storedPower,
      satisfaction: state.satisfaction,
      cloudCrystals: state.cloudCrystals,
      cloudWhale: state.cloudWhale,
    });

    set(nextState);
  },

  rotateCell: (x, y) => {
    const state = get();
    const cell = state.grid[y][x];
    if (cell.type !== 'wire') return;

    const newGrid = state.grid.map((row) => row.map((c) => ({ ...c })));
    newGrid[y][x].rotation = (cell.rotation + 1) % 6;

    const windBoost = state.cloudWhale.state === 'docked' ? CLOUD_WHALE_WIND_BOOST : 0;
    const result = recalcGrid(newGrid, state.dayTime, state.storedPower, windBoost);

    const nextState = {
      grid: result.newGrid,
      poweredCells: result.poweredCells,
      totalGeneration: result.totalGeneration,
      totalConsumption: result.totalConsumption,
      maxStorage: result.batteryCapacity,
      noiseMap: result.noiseMap,
      powerStability: result.powerStability,
    };

    saveToLocalStorage({
      grid: result.newGrid,
      dayTime: state.dayTime,
      storedPower: state.storedPower,
      satisfaction: state.satisfaction,
      cloudCrystals: state.cloudCrystals,
      cloudWhale: state.cloudWhale,
    });

    set(nextState);
  },

  repairCell: (x, y) => {
    const state = get();
    const cell = state.grid[y][x];
    if (!cell.faulty) return;

    const newGrid = state.grid.map((row) => row.map((c) => ({ ...c })));
    newGrid[y][x].faulty = false;

    const windBoost = state.cloudWhale.state === 'docked' ? CLOUD_WHALE_WIND_BOOST : 0;
    const result = recalcGrid(newGrid, state.dayTime, state.storedPower, windBoost);

    const nextState = {
      grid: result.newGrid,
      poweredCells: result.poweredCells,
      totalGeneration: result.totalGeneration,
      totalConsumption: result.totalConsumption,
      maxStorage: result.batteryCapacity,
      noiseMap: result.noiseMap,
      powerStability: result.powerStability,
    };

    saveToLocalStorage({
      grid: result.newGrid,
      dayTime: state.dayTime,
      storedPower: state.storedPower,
      satisfaction: state.satisfaction,
      cloudCrystals: state.cloudCrystals,
      cloudWhale: state.cloudWhale,
    });

    set(nextState);
  },

  tick: () => {
    const state = get();
    const newGrid = state.grid.map((row) => row.map((c) => ({ ...c })));

    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        const cell = newGrid[y][x];
        if (cell.type !== 'empty' && !cell.faulty && Math.random() < FAULT_CHANCE) {
          newGrid[y][x].faulty = true;
        }
      }
    }

    const newDayTime = (state.dayTime + 0.5) % DAY_LENGTH;

    const baseResult = calculatePowerNetwork(newGrid, newDayTime, state.storedPower, 0);
    const baseNoiseMap = calculateNoiseMap(newGrid);

    const { cloudWhale, windBoost, cloudCrystals } = updateCloudWhale(
      state,
      newGrid,
      baseResult.poweredCells,
      baseNoiseMap
    );

    const finalResult = windBoost > 0
      ? calculatePowerNetwork(newGrid, newDayTime, state.storedPower, windBoost)
      : baseResult;

    const { poweredCells, totalGeneration, totalConsumption, batteryCapacity } = finalResult;

    for (let yy = 0; yy < GRID_SIZE; yy++) {
      for (let xx = 0; xx < GRID_SIZE; xx++) {
        newGrid[yy][xx].powered = poweredCells.has(`${xx},${yy}`);
      }
    }

    const noiseMap = calculateNoiseMap(newGrid);
    const powerStability = calculatePowerStability(newGrid, poweredCells);

    const netPower = totalGeneration - totalConsumption;
    let newStoredPower = state.storedPower;
    const isDay = newDayTime < DAY_THRESHOLD;

    if (batteryCapacity > 0) {
      if (netPower > 0) {
        newStoredPower = Math.min(batteryCapacity, state.storedPower + netPower * 0.3);
      } else if (netPower < 0 && !isDay) {
        const deficit = -netPower;
        const discharge = Math.min(state.storedPower, deficit * 0.5);
        newStoredPower = Math.max(0, state.storedPower - discharge);
      }
    }

    const { houses, poweredHouses, factories, poweredFactories } = countPoweredBuildings(
      newGrid,
      poweredCells
    );
    const totalBuildings = houses + factories;
    const totalPowered = poweredHouses + poweredFactories;
    const coverage = totalBuildings > 0 ? totalPowered / totalBuildings : 1;

    let newSatisfaction = state.satisfaction;
    if (coverage >= 0.8) {
      newSatisfaction = Math.min(100, state.satisfaction + 0.2);
    } else if (coverage >= 0.5) {
      newSatisfaction = Math.min(100, state.satisfaction + 0.05);
    } else {
      newSatisfaction = Math.max(0, state.satisfaction - 0.3);
    }

    if (cloudWhale.state === 'docked') {
      newSatisfaction = Math.min(100, newSatisfaction + 0.1);
    }

    saveToLocalStorage({
      grid: newGrid,
      dayTime: newDayTime,
      storedPower: newStoredPower,
      satisfaction: newSatisfaction,
      cloudCrystals,
      cloudWhale,
    });

    set({
      grid: newGrid,
      dayTime: newDayTime,
      storedPower: newStoredPower,
      maxStorage: batteryCapacity,
      satisfaction: newSatisfaction,
      poweredCells,
      totalGeneration,
      totalConsumption,
      cloudCrystals,
      cloudWhale,
      noiseMap,
      powerStability,
      windBoost,
    });
  },

  resetGame: () => {
    localStorage.removeItem(STORAGE_KEY);
    const fresh = createEmptyGrid();
    const result = recalcGrid(fresh, 20, 10, 0);
    const initialWhale: CloudWhaleData = {
      state: 'away',
      progress: 0,
      dockedTicks: 0,
      nextVisitIn: CLOUD_WHALE_VISIT_INTERVAL,
      satisfaction: 100,
      dockX: Math.floor(GRID_SIZE / 2),
      dockY: Math.floor(GRID_SIZE / 2),
    };
    set({
      grid: result.newGrid,
      dayTime: 20,
      storedPower: 10,
      maxStorage: result.batteryCapacity,
      satisfaction: 50,
      selectedTool: 'windmill',
      poweredCells: result.poweredCells,
      totalGeneration: result.totalGeneration,
      totalConsumption: result.totalConsumption,
      showSettlement: false,
      cloudCrystals: 0,
      cloudWhale: initialWhale,
      noiseMap: result.noiseMap,
      powerStability: result.powerStability,
      windBoost: 0,
    });
  },

  openSettlement: () => set({ showSettlement: true }),
  closeSettlement: () => set({ showSettlement: false }),
}));
