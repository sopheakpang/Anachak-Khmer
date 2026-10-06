import { z } from 'zod';

/** Normalized viewer event (spec: Tech architecture). Every source — TikTok, TikFinity, simulator — produces this. */
export const EventTypeSchema = z.enum(['like', 'follow', 'share', 'comment', 'gift', 'join']);

export const GameEventSchema = z
  .object({
    id: z.string().min(1),
    type: EventTypeSchema,
    user: z.object({
      id: z.string().min(1),
      name: z.string(),
      handle: z.string().optional(),
      avatarUrl: z.string().optional(),
    }),
    giftName: z.string().optional(),
    giftCoins: z.number().int().nonnegative().optional(),
    count: z.number().int().positive().max(100_000).default(1),
    comboEnd: z.boolean().optional(),
    text: z.string().max(300).optional(),
    ts: z.number().nonnegative(),
  })
  .refine((e) => e.type !== 'gift' || typeof e.giftCoins === 'number', {
    message: 'gift events need giftCoins',
    path: ['giftCoins'],
  })
  .refine((e) => e.type !== 'comment' || typeof e.text === 'string', {
    message: 'comment events need text',
    path: ['text'],
  });

export type GameEvent = z.infer<typeof GameEventSchema>;
export type EventType = z.infer<typeof EventTypeSchema>;

export const TierNameSchema = z.enum(['small', 'medium', 'large', 'huge']);
export type TierName = z.infer<typeof TierNameSchema>;

const Bilingual = z.object({ km: z.string().min(1), en: z.string().min(1) });

export const GiftMapSchema = z.object({
  tiers: z
    .array(
      z.object({
        name: TierNameSchema,
        minCoins: z.number().int().positive(),
        transport: z.enum(['workers', 'oxcart', 'elephants', 'raft']),
        screen: z.enum(['pip', 'fullscreen', 'fullscreen-banner']),
      }),
    )
    .length(4)
    .refine(
      (t) => t.every((x, i) => i === 0 || x.minCoins > t[i - 1]!.minCoins),
      'tiers must be in rising coin order',
    ),
  units: z.object({
    like: z.number().nonnegative(),
    follow: z.number().nonnegative(),
    share: z.number().nonnegative(),
    comment: z.number().nonnegative(),
    join: z.number().nonnegative(),
    giftMultiplier: z.number().positive(),
  }),
  limits: z.object({
    followOncePerStream: z.boolean(),
    shareCooldownSec: z.number().nonnegative(),
    myStoneUserCooldownSec: z.number().nonnegative(),
    myStoneGlobalCooldownSec: z.number().nonnegative(),
    guildChangesPerStream: z.number().int().nonnegative(),
    likeBatchMs: z.number().int().positive(),
    joinShowEvery: z.number().int().positive(),
    comboIdleMs: z.number().int().positive(),
  }),
  caps: z.object({
    perEventTempleShare: z.number().gt(0).max(1),
    stockpileMaxStartShare: z.number().min(0).max(1),
  }),
  queue: z.object({ max: z.number().int().positive(), drainPerTick: z.number().int().positive() }),
  guilds: z.record(z.enum(['1', '2', '3', '4']), Bilingual),
  commands: z.object({ myStone: z.array(z.string().min(1)).min(1) }),
  ranks: z
    .array(Bilingual.extend({ minUnits: z.number().int().nonnegative() }))
    .min(1)
    .refine((r) => r[0]?.minUnits === 0, 'first rank must start at 0'),
  names: z.object({ maxLength: z.number().int().positive(), fallbackKm: z.string(), fallbackEn: z.string() }),
  /** Expedition mode (D29): gifts on this list send monsters instead of helping (they still add stones). */
  chaosGifts: z.array(z.string().min(1)).default([]),
});
export type GiftMap = z.infer<typeof GiftMapSchema>;

export const TemplesSchema = z.object({
  baseTarget: z.number().int().positive(),
  temples: z
    .array(
      Bilingual.extend({
        order: z.number().int().positive(),
        id: z.string().regex(/^[a-z-]+$/),
        year: z.string(),
        king: z.string(),
        material: z.enum(['brick', 'sandstone', 'laterite']),
        size: z.number().positive(),
        check: z.enum(['sourced', 'verify']),
        kitReady: z.boolean(),
      }),
    )
    .min(1),
});
export type TemplesConfig = z.infer<typeof TemplesSchema>;

export const CameraSchema = z.object({
  loop: z
    .array(
      z.object({
        shot: z.enum(['map', 'quarry', 'river', 'hauling', 'site']),
        seconds: z.number().positive(),
      }),
    )
    .min(1),
  cut: z.object({
    seconds: z.number().positive(),
    cooldownSec: z.number().nonnegative(),
    queueMax: z.number().int(),
  }),
  pip: z.object({ seconds: z.number().positive(), myStoneSeconds: z.number().positive() }),
  idleAfterSec: z.number().positive(),
  historyCardEverySec: z.number().positive(),
});
export type CameraConfig = z.infer<typeof CameraSchema>;

const Zone = z.object({
  x: z.number(),
  y: z.number(),
  w: z.number().positive(),
  h: z.number().positive(),
  keepClear: z.boolean().optional(),
});
export const LayoutSchema = z.object({
  size: z.object({ width: z.literal(1080), height: z.literal(1920) }),
  zones: z.record(z.string(), Zone),
  minTextPx: z.number().positive(),
  /** Help pop-up at the top: first shown after firstSec, then showSec out of every everySec. */
  helpPopup: z
    .object({
      firstSec: z.number().nonnegative(),
      everySec: z.number().positive(),
      showSec: z.number().positive(),
    })
    .refine((h) => h.showSec < h.everySec, 'showSec must be shorter than everySec'),
});
export type LayoutConfig = z.infer<typeof LayoutSchema>;

/** Expedition mode (Kulen Expedition tab of the spec): heroes, skills, chaos limits, camera. */
const HexColor = z.string().regex(/^#[0-9a-f]{6}$/i);
export const SkillSchema = z.object({
  km: z.string().min(1),
  en: z.string().min(1),
  key: z.enum(['Q', 'W', 'E', 'R']),
  colors: z.array(HexColor).min(1).max(3),
  cooldownSec: z.number().positive(),
  energy: z.number().nonnegative(),
  radius: z.number().nonnegative(),
  damage: z.number().nonnegative(),
  /** How far from the hero the skill can be aimed (0 = always around the hero). */
  range: z.number().nonnegative(),
  /** blast = area at the target; selfBlast = area around the hero; heal = heal/shield the hero; dashStrike = leap to the target and hit. */
  effect: z.enum(['blast', 'selfBlast', 'heal', 'dashStrike']),
});
export const HeroSchema = z.object({
  id: z.enum(['warrior', 'sage', 'rider']),
  km: z.string().min(1),
  en: z.string().min(1),
  roleKm: z.string().min(1),
  roleEn: z.string().min(1),
  speed: z.number().positive(),
  health: z.number().int().positive(),
  energy: z.number().int().positive(),
  skills: z.array(z.string()).length(4),
  /** Basic attack: click an enemy within range. */
  attack: z.object({
    range: z.number().positive(),
    damage: z.number().nonnegative(),
    cooldownSec: z.number().positive(),
    kind: z.enum(['melee', 'ranged']),
  }),
  /** Space: a quick dash in the walking direction. */
  dash: z.object({ distance: z.number().positive(), cooldownSec: z.number().positive() }),
});
export const ExpeditionSchema = z
  .object({
    expeditionsPerTemple: z.number().int().positive(),
    heroes: z.array(HeroSchema).length(3),
    skills: z.record(z.string(), SkillSchema),
    chaos: z.object({
      maxAlive: z.number().int().positive(),
      globalCooldownSec: z.number().nonnegative(),
      perViewerCooldownSec: z.number().nonnegative(),
      graceSec: z.number().nonnegative(),
    }),
    camera: z.object({
      minDistance: z.number().positive(),
      maxDistance: z.number().positive(),
      startDistance: z.number().positive(),
      pitchDeg: z.number().min(20).max(85),
      panLimit: z.number().positive(),
    }),
    world: z.object({ size: z.number().positive() }),
    trainingPosts: z.object({
      health: z.number().positive(),
      respawnSec: z.number().positive(),
      at: z.array(z.tuple([z.number(), z.number()])),
    }),
    /** The Old Quarry: cut a block from a rock face, carry it to the camp's stone pile. */
    quarry: z.object({
      reach: z.number().positive(),
      cutSec: z.number().positive(),
      carrySpeed: z.number().positive().max(1),
      deliverRadius: z.number().positive(),
      pile: z.tuple([z.number(), z.number()]),
      faces: z.array(z.tuple([z.number(), z.number()])).min(1),
    }),
  })
  .superRefine((e, ctx) => {
    for (const h of e.heroes) {
      const keys = h.skills.map((id) => e.skills[id]?.key);
      h.skills.forEach((id) => {
        if (!e.skills[id]) ctx.addIssue({ code: 'custom', message: `hero ${h.id}: unknown skill ${id}` });
      });
      if (keys.join('') !== 'QWER')
        ctx.addIssue({ code: 'custom', message: `hero ${h.id}: skills must be Q, W, E, R in order` });
    }
    const c = e.camera;
    if (!(c.minDistance <= c.startDistance && c.startDistance <= c.maxDistance))
      ctx.addIssue({ code: 'custom', message: 'camera: minDistance <= startDistance <= maxDistance' });
  });
export type ExpeditionConfig = z.infer<typeof ExpeditionSchema>;
export type HeroConfig = z.infer<typeof HeroSchema>;
export type SkillConfig = z.infer<typeof SkillSchema>;
