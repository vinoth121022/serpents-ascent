import { Bloom, EffectComposer, SMAA, Vignette } from '@react-three/postprocessing';
import type { QualityTier } from '../../store';

/**
 * Tier-gated post chain (spec §6/§10):
 *  high   → Bloom (high threshold: only emissives/highlights) + Vignette + SMAA
 *  medium → SMAA only
 *  low    → none
 */
export function Effects({ tier }: { tier: QualityTier }) {
  if (tier === 'low') return null;
  if (tier === 'medium') {
    return (
      <EffectComposer multisampling={0}>
        <SMAA />
      </EffectComposer>
    );
  }
  return (
    <EffectComposer multisampling={0}>
      <Bloom luminanceThreshold={0.9} luminanceSmoothing={0.2} intensity={0.45} mipmapBlur />
      <Vignette darkness={0.25} offset={0.25} />
      <SMAA />
    </EffectComposer>
  );
}
