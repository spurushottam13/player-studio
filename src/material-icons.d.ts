// The `material-icons` package ships its catalog as a JSON map keyed by icon
// name (see icons.ts). Declared rather than imported through `resolveJsonModule`
// on purpose: letting TypeScript infer a literal type for 2,000+ keys costs
// minutes per typecheck, and all we need is "keys are icon names".
declare module "material-icons/_data/versions.json" {
  const versions: Record<string, number>;
  export default versions;
}

// Side-effect CSS import (the self-hosted ligature font) — no types needed.
declare module "material-icons/iconfont/filled.css";
