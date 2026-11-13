// Colours and sizes shared by the building's logic (building.js) and its painters (scene.js, sprites.js).
export const LEVEL_COLORS = { 1: "#5aa9ff", 2: "#3fd1c9", 3: "#35d07f", 4: "#f5b942", 5: "#b784ff" };
export const BAR_COLORS = { day: "#35d07f", pips: "#f5b942", rr: "#b784ff", win: "#5aa9ff" };
export const LEVEL_NAMES = { 1: "Analysts", 2: "Associates", 3: "Vice Presidents", 4: "Directors", 5: "Managing Directors" };
export const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

// Sizes, in world units (one unit is one CSS pixel on the whole-building picture).
export const SKY_H = 58;            // the strip of sky above the roof
export const LABEL_H = 22;          // each floor's sign strip
export const HEAD_H = 20;           // a room's header: its group, its strategy, its screen
export const CELL_H = 94;           // a desk cell: lamp and bubble space, the person, the desk, the name, four bars, the walkway
export const ROOM_H = HEAD_H + CELL_H + 4;
export const TOP_H = LABEL_H + 78;  // the top floor: the Audit desk and the CEO's office
export const GROUND_H = 10;         // the pavement between the building and its basement
export const BASE_H = 122;          // the basement: the Engine, the price history, the code room, the sandbox
export const LIFT_CAR_H = 34;

// Each floor's rooms are tinted with a very dark shade of the floor's level colour.
export const ROOM_BG = { 1: "#0e1922", 2: "#0c1d1d", 3: "#0d1d15", 4: "#1f190d", 5: "#181327", 6: "#151a1d" };
export const WOOD = "#6b5238", WOOD_LIGHT = "#86694a", WOOD_DARK = "#3f3022";
export const INK = "#0b1410", PAPER = "#e6f0ea", MUTED = "#8fb3a3", DIM = "#5f8473", LINE = "#234136";
export const GOOD = "#35d07f", BAD = "#ff5c5c", AMBER = "#f5b942", PURPLE = "#b784ff", TEAL = "#3fd1c9", BLUE = "#5aa9ff";
