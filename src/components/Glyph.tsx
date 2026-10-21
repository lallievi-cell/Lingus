import {
  Users,
  Footprints,
  Apple,
  Axe,
  UserRound,
  House,
  Hand,
  Mountain,
  TreePine,
  TriangleAlert,
  Moon,
  Rabbit,
  Sunrise,
  Archive,
  Hammer,
  Flame,
  CookingPot,
  Tent,
  Skull,
  Sparkles,
  BicepsFlexed,
  Brain,
  Infinity,
  Sprout,
  Fence,
  Fingerprint,
  UserRoundSearch,
  ArrowLeftRight,
  Gem,
  Hash,
  ScrollText,
  Map,
  Link,
  Crown,
  Landmark,
  GitBranch,
  Coins,
  Swords,
  Flag,
  Building2,
  Cog,
  Scale,
  Bird,
  Lightbulb,
  type LucideIcon,
} from 'lucide-react';

const glyphs: Record<string, LucideIcon> = {
  S_01: Users,
  V_01: Footprints,
  V_02: Apple,
  V_03: Axe,
  S_02: UserRound,
  O_01: House,
  V_04: Hand,
  O_02: Mountain,
  O_03: TreePine,
  M_01: TriangleAlert,
  C_01: Moon,
  O_04: Rabbit,
  M_02: Sunrise,
  V_05: Archive,
  V_06: Hammer,
  O_05: Flame,
  V_07: CookingPot,
  V_08: Tent,
  O_06: Skull,
  M_03: Sparkles,
  S_03: BicepsFlexed,
  S_04: Brain,
  C_02: Infinity,
  V_09: Sprout,
  V_10: Fence,
  M_04: Fingerprint,
  S_05: UserRoundSearch,
  V_11: ArrowLeftRight,
  O_07: Gem,
  O_08: Hash,
  O_09: ScrollText,
  O_10: Map,
  S_06: Link,
  S_07: Crown,
  O_11: Landmark,
  C_03: GitBranch,
  O_12: Coins,
  S_08: Swords,
  V_13: Flag,
  S_09: Building2,
  O_13: Cog,
  O_14: Scale,
  M_05: Bird,
  V_14: Lightbulb,
  V_12: Flame,
};

export function Glyph({
  id,
  size = 21,
  ...props
}: {
  id: string;
  size?: number;
  className?: string;
  strokeWidth?: number;
}) {
  const Component = glyphs[id] ?? Sparkles;
  return <Component size={size} strokeWidth={1.65} aria-hidden="true" {...props} />;
}

export function BrandMark({ size = 42 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 52 52" fill="none" aria-hidden="true">
      <path d="M26 2 49 26 26 50 3 26Z" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M26 11v29m-10-17 10 10 10-10m-10-12-7 8m7-8 7 8"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M9 26h4m26 0h4" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}
