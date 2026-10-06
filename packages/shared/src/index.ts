export const GAME_NAME = { km: 'សាងប្រាសាទ', en: 'The Temples' } as const;

export const PORTS = { game: 5173, bridgeWs: 7420, host: 7421 } as const;

/** Internal render size of the game. Never changes; the window scales it. */
export const RENDER_SIZE = { width: 1080, height: 1920 } as const;

export * from './fonts';
export * from './schemas';
export * from './rules';
export * from './names';
export * from './config';
export * from './messages';
export * from './kit';
export * from './kingdom';
export * from './music';
