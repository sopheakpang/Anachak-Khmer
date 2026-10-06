import giftMapJson from '../../../config/gift-map.json';
import templesJson from '../../../config/temples.json';
import cameraJson from '../../../config/camera.json';
import layoutJson from '../../../config/layout.json';
import expeditionJson from '../../../config/expedition.json';
import { CameraSchema, ExpeditionSchema, GiftMapSchema, LayoutSchema, TemplesSchema } from './schemas';

/**
 * Validated configs. A bad value in config/*.json throws at start-up with the exact
 * field, instead of breaking the game mid-stream.
 */
export function loadConfigs() {
  return {
    giftMap: GiftMapSchema.parse(giftMapJson),
    temples: TemplesSchema.parse(templesJson),
    camera: CameraSchema.parse(cameraJson),
    layout: LayoutSchema.parse(layoutJson),
    expedition: ExpeditionSchema.parse(expeditionJson),
  };
}

export type Configs = ReturnType<typeof loadConfigs>;
