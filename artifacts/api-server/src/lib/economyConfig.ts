export type EconomyRarity = "common" | "rare" | "epic" | "legendary";
export type StoreCategory =
  | "profile_customization"
  | "pet_cosmetics"
  | "focus_items"
  | "chest_items"
  | "reward_effects"
  | "limited_items"
  | "momentum_cosmetics";
export type RewardKind =
  | "frame"
  | "pet"
  | "title"
  | "completion_effect"
  | "transition"
  | "profile_theme"
  | "focus_sound"
  | "badge_display"
  | "momentum_cosmetic"
  | "chest_key";

export type EconomyItem = {
  id: string;
  name: string;
  description: string;
  kind: RewardKind;
  category: StoreCategory;
  priceBp: number;
  style: string;
  rarity: EconomyRarity;
  source?: "store" | "chest" | "default";
  chestRarity?: EconomyRarity;
  minimumTier?: number;
  minimumMomentum?: number;
  repeatable?: boolean;
  equipable?: boolean;
  limited?: boolean;
};

export const VP_RULES = {
  tierSize: 100,
  defaultTask: 10,
  checklistItem: 2,
  weeklyReview: 40,
  focus: { perMinute: 1, fiftyMinuteBonus: 10, ninetyMinuteBonus: 20 },
} as const;

export const BP_RULES = {
  dailyCompletion: 4,
  weeklyReview: 35,
  achievementUnlock: 15,
  momentumMilestones: {
    3: 20,
    7: 35,
    14: 50,
    30: 80,
    60: 120,
    100: 200,
    180: 300,
    365: 500,
  } as Record<number, number>,
  chestBpRanges: {
    common: [30, 60],
    rare: [75, 130],
    epic: [180, 280],
    legendary: [400, 650],
  } as Record<EconomyRarity, readonly [number, number]>,
  chestRewardWeights: {
    common: { item: 0.55, bp: 0.4, key: 0.05 },
    rare: { item: 0.6, bp: 0.32, key: 0.08 },
    epic: { item: 0.68, bp: 0.22, key: 0.1 },
    legendary: { item: 0.75, bp: 0.15, key: 0.1 },
  } as Record<EconomyRarity, { item: number; bp: number; key: number }>,
  chestUpgradeChances: {
    common: { rare: 0.12, epic: 0.025, legendary: 0.005 },
    rare: { epic: 0.08, legendary: 0.01 },
    epic: { legendary: 0.04 },
    legendary: {},
  } as Record<EconomyRarity, Partial<Record<EconomyRarity, number>>>,
} as const;

const store = (
  item: Omit<EconomyItem, "source">,
): EconomyItem => ({ ...item, source: "store" });
const chest = (
  item: Omit<EconomyItem, "source" | "priceBp" | "chestRarity"> & { chestRarity: EconomyRarity },
): EconomyItem => ({ ...item, source: "chest", priceBp: 0, chestRarity: item.chestRarity });

export const DEFAULT_ITEMS: EconomyItem[] = [
  { id: "clean-confetti", name: "Clean Confetti", description: "A restrained completion burst.", kind: "completion_effect", category: "reward_effects", priceBp: 0, style: "clean-confetti", rarity: "common", source: "default", equipable: true },
  { id: "velocity-slide", name: "Velocity Slide", description: "The standard workspace transition.", kind: "transition", category: "reward_effects", priceBp: 0, style: "velocity-slide", rarity: "common", source: "default", equipable: true },
];

export const STORE_ITEMS: EconomyItem[] = [
  store({ id: "orbit-frame", name: "Orbit Frame", description: "A quiet orbital profile border.", kind: "frame", category: "profile_customization", priceBp: 90, style: "orbit", rarity: "common", equipable: true }),
  store({ id: "signal-ring", name: "Signal Ring", description: "A crisp signal-line frame.", kind: "frame", category: "profile_customization", priceBp: 150, style: "signal", rarity: "rare", equipable: true }),
  store({ id: "precision-frame", name: "Precision Frame", description: "A technical double-line frame.", kind: "frame", category: "profile_customization", priceBp: 240, style: "precision", rarity: "rare", minimumTier: 3, equipable: true }),
  store({ id: "nova-frame", name: "Nova Frame", description: "A bright high-tier profile edge.", kind: "frame", category: "profile_customization", priceBp: 420, style: "nova", rarity: "epic", minimumTier: 5, equipable: true }),
  store({ id: "studio-frame", name: "Studio Frame", description: "A warm studio profile frame.", kind: "frame", category: "profile_customization", priceBp: 460, style: "studio", rarity: "epic", minimumTier: 5, equipable: true }),
  store({ id: "summit-frame", name: "Summit Frame", description: "A cool high-altitude profile edge.", kind: "frame", category: "profile_customization", priceBp: 520, style: "summit", rarity: "epic", minimumTier: 6, equipable: true }),
  store({ id: "terminal-frame", name: "Terminal Frame", description: "A structured terminal-inspired frame.", kind: "frame", category: "limited_items", priceBp: 620, style: "terminal", rarity: "legendary", minimumTier: 8, equipable: true, limited: true }),
  store({ id: "honor-frame", name: "Honor Frame", description: "A formal achievement frame.", kind: "frame", category: "profile_customization", priceBp: 680, style: "honor", rarity: "legendary", minimumTier: 10, equipable: true }),
  store({ id: "zen-frame", name: "Zen Frame", description: "A calm teal profile frame.", kind: "frame", category: "profile_customization", priceBp: 740, style: "zen", rarity: "legendary", minimumMomentum: 30, equipable: true }),
  store({ id: "velocity-frame", name: "Velocity Frame", description: "The signature high-tier profile frame.", kind: "frame", category: "limited_items", priceBp: 900, style: "velocity", rarity: "legendary", minimumTier: 15, equipable: true, limited: true }),
  store({ id: "pixel-spark", name: "Pixel Spark", description: "A compact animated profile pet.", kind: "pet", category: "pet_cosmetics", priceBp: 170, style: "spark", rarity: "common", equipable: true }),
  store({ id: "cloud-bit", name: "Cloud Bit", description: "A calm cloud pet with a charged state.", kind: "pet", category: "pet_cosmetics", priceBp: 260, style: "cloud", rarity: "rare", equipable: true }),
  store({ id: "focus-cube", name: "Focus Cube", description: "A minimal focus desk pet.", kind: "pet", category: "pet_cosmetics", priceBp: 390, style: "cube", rarity: "epic", minimumTier: 4, equipable: true }),
  store({ id: "study-bot", name: "Study Bot", description: "A precise study-session pet.", kind: "pet", category: "pet_cosmetics", priceBp: 330, style: "bot", rarity: "rare", minimumTier: 3, equipable: true }),
  store({ id: "leafling", name: "Leafling", description: "A low-key growing desk pet.", kind: "pet", category: "pet_cosmetics", priceBp: 210, style: "leaf", rarity: "common", equipable: true }),
  store({ id: "orbit-orb", name: "Orbit Orb", description: "A slowly orbiting profile pet.", kind: "pet", category: "pet_cosmetics", priceBp: 290, style: "orb", rarity: "rare", equipable: true }),
  store({ id: "book-bit", name: "Book Bit", description: "A compact reading pet.", kind: "pet", category: "pet_cosmetics", priceBp: 340, style: "book", rarity: "rare", minimumTier: 2, equipable: true }),
  store({ id: "tempo-dot", name: "Tempo Dot", description: "A rhythm-driven focus pet.", kind: "pet", category: "pet_cosmetics", priceBp: 430, style: "tempo", rarity: "epic", minimumTier: 4, equipable: true }),
  store({ id: "comet", name: "Comet", description: "A fast-moving profile pet.", kind: "pet", category: "pet_cosmetics", priceBp: 520, style: "comet", rarity: "epic", minimumTier: 6, equipable: true }),
  store({ id: "pebble", name: "Pebble", description: "A steady minimalist profile pet.", kind: "pet", category: "pet_cosmetics", priceBp: 580, style: "pebble", rarity: "epic", minimumMomentum: 30, equipable: true }),
  store({ id: "scholar-grid", name: "Scholar Grid", description: "A clean profile surface with study-grid details.", kind: "profile_theme", category: "profile_customization", priceBp: 120, style: "scholar-grid", rarity: "common", equipable: true }),
  store({ id: "carbon-profile", name: "Carbon Profile", description: "A dark technical profile treatment.", kind: "profile_theme", category: "profile_customization", priceBp: 280, style: "carbon-profile", rarity: "rare", minimumTier: 3, equipable: true }),
  store({ id: "library-after-hours", name: "Library After Hours", description: "A layered library focus sound pack.", kind: "focus_sound", category: "focus_items", priceBp: 160, style: "library-after-hours", rarity: "common", equipable: true }),
  store({ id: "deep-rain-pack", name: "Deep Rain Pack", description: "A low-frequency rain focus sound pack.", kind: "focus_sound", category: "focus_items", priceBp: 250, style: "deep-rain", rarity: "rare", minimumTier: 2, equipable: true }),
  store({ id: "signal-finish", name: "Signal Finish", description: "A clean ring animation for completed work.", kind: "completion_effect", category: "reward_effects", priceBp: 140, style: "signal-finish", rarity: "common", equipable: true }),
  store({ id: "prism-check", name: "Prism Check", description: "A compact prismatic completion effect.", kind: "completion_effect", category: "reward_effects", priceBp: 300, style: "prism-check", rarity: "epic", minimumTier: 4, equipable: true }),
  store({ id: "badge-shelf", name: "Badge Shelf", description: "Highlights an earned badge on your profile.", kind: "badge_display", category: "profile_customization", priceBp: 200, style: "badge-shelf", rarity: "rare", minimumTier: 2, equipable: true }),
  store({ id: "momentum-trace", name: "Momentum Trace", description: "A cosmetic profile trace for 14 Momentum days.", kind: "momentum_cosmetic", category: "momentum_cosmetics", priceBp: 180, style: "momentum-trace", rarity: "rare", minimumMomentum: 14, equipable: true }),
  store({ id: "momentum-halo", name: "Momentum Halo", description: "A restrained profile aura for long-term consistency.", kind: "momentum_cosmetic", category: "momentum_cosmetics", priceBp: 480, style: "momentum-halo", rarity: "legendary", minimumMomentum: 60, equipable: true }),
  store({ id: "chest-key", name: "Chest Key", description: "Opens one additional reward chest.", kind: "chest_key", category: "chest_items", priceBp: 125, style: "key", rarity: "rare", repeatable: true, equipable: false }),
];

export const CHEST_ITEMS: EconomyItem[] = [
  chest({ id: "nova-pod", name: "Nova Pod", description: "A compact chest-exclusive pet.", kind: "pet", category: "pet_cosmetics", style: "nova-pod", rarity: "common", chestRarity: "common", equipable: true }),
  chest({ id: "aperture-frame", name: "Aperture Frame", description: "A focused chest-exclusive frame.", kind: "frame", category: "profile_customization", style: "aperture", rarity: "common", chestRarity: "common", equipable: true }),
  chest({ id: "clear-intent", name: "Clear Intent", description: "A chest-exclusive profile title.", kind: "title", category: "profile_customization", style: "clear-intent", rarity: "common", chestRarity: "common", equipable: true }),
  chest({ id: "prism-pop", name: "Prism Pop", description: "A compact completion effect.", kind: "completion_effect", category: "reward_effects", style: "prism-pop", rarity: "common", chestRarity: "common", equipable: true }),
  chest({ id: "soft-glide", name: "Soft Glide", description: "A calm workspace transition.", kind: "transition", category: "reward_effects", style: "soft-glide", rarity: "common", chestRarity: "common", equipable: true }),
  chest({ id: "lumen-bot", name: "Lumen Bot", description: "A rare responsive study pet.", kind: "pet", category: "pet_cosmetics", style: "lumen-bot", rarity: "rare", chestRarity: "rare", equipable: true }),
  chest({ id: "orbit-bud", name: "Orbit Bud", description: "A rare orbital profile pet.", kind: "pet", category: "pet_cosmetics", style: "orbit-bud", rarity: "rare", chestRarity: "rare", equipable: true }),
  chest({ id: "pulse-grid", name: "Pulse Grid", description: "A rare animated profile frame.", kind: "frame", category: "profile_customization", style: "pulse-grid", rarity: "rare", chestRarity: "rare", equipable: true }),
  chest({ id: "aurora-edge", name: "Aurora Edge", description: "A rare luminous profile frame.", kind: "frame", category: "profile_customization", style: "aurora-edge", rarity: "rare", chestRarity: "rare", equipable: true }),
  chest({ id: "deep-work", name: "Deep Work", description: "A rare chest-exclusive title.", kind: "title", category: "profile_customization", style: "deep-work", rarity: "rare", chestRarity: "rare", equipable: true }),
  chest({ id: "week-architect", name: "Week Architect", description: "A rare planning title.", kind: "title", category: "profile_customization", style: "week-architect", rarity: "rare", chestRarity: "rare", equipable: true }),
  chest({ id: "signal-rings", name: "Signal Rings", description: "A rare completion effect.", kind: "completion_effect", category: "reward_effects", style: "signal-rings", rarity: "rare", chestRarity: "rare", equipable: true }),
  chest({ id: "panel-sweep", name: "Panel Sweep", description: "A rare workspace transition.", kind: "transition", category: "reward_effects", style: "panel-sweep", rarity: "rare", chestRarity: "rare", equipable: true }),
  chest({ id: "tempo-kite", name: "Tempo Kite", description: "An epic motion-driven pet.", kind: "pet", category: "pet_cosmetics", style: "tempo-kite", rarity: "epic", chestRarity: "epic", equipable: true }),
  chest({ id: "carbon-halo", name: "Carbon Halo", description: "An epic precision frame.", kind: "frame", category: "profile_customization", style: "carbon-halo", rarity: "epic", chestRarity: "epic", equipable: true }),
  chest({ id: "steady-hand", name: "Steady Hand", description: "An epic consistency title.", kind: "title", category: "profile_customization", style: "steady-hand", rarity: "epic", chestRarity: "epic", equipable: true }),
  chest({ id: "paper-stream", name: "Paper Stream", description: "An epic completion effect.", kind: "completion_effect", category: "reward_effects", style: "paper-stream", rarity: "epic", chestRarity: "epic", equipable: true }),
  chest({ id: "quick-stack", name: "Quick Stack", description: "An epic workspace transition.", kind: "transition", category: "reward_effects", style: "quick-stack", rarity: "epic", chestRarity: "epic", equipable: true }),
  chest({ id: "vector-pet", name: "Vector Pet", description: "A legendary geometric profile pet.", kind: "pet", category: "pet_cosmetics", style: "vector-pet", rarity: "legendary", chestRarity: "legendary", equipable: true }),
  chest({ id: "founders-edge", name: "Founder's Edge", description: "A legendary profile frame.", kind: "frame", category: "limited_items", style: "founders-edge", rarity: "legendary", chestRarity: "legendary", equipable: true }),
  chest({ id: "quiet-force", name: "Quiet Force", description: "A legendary profile title.", kind: "title", category: "profile_customization", style: "quiet-force", rarity: "legendary", chestRarity: "legendary", equipable: true }),
  chest({ id: "aurora-finish", name: "Aurora Finish", description: "A legendary completion effect.", kind: "completion_effect", category: "reward_effects", style: "aurora-finish", rarity: "legendary", chestRarity: "legendary", equipable: true }),
];

export const ECONOMY_ITEMS = [...STORE_ITEMS, ...DEFAULT_ITEMS, ...CHEST_ITEMS];

export function itemLockReason(
  item: Pick<EconomyItem, "minimumTier" | "minimumMomentum">,
  tier: number,
  momentum: number,
) {
  if (item.minimumTier && tier < item.minimumTier) return `Reach Tier ${item.minimumTier}`;
  if (item.minimumMomentum && momentum < item.minimumMomentum) return `Build ${item.minimumMomentum} Momentum days`;
  return null;
}
