# Industry Translations (Leverage Pack)

This pack increases perceived specificity without breaking the finite artifact doctrine.

## Canonical Grouping
- Source: `src/lib/intelligence/industry_groups.ts`
- Guarantees 100% coverage for all owner-led industries.
- Provides `IndustryGroup`, `IndustryKey`, `INDUSTRY_GROUP_MAP`, `getIndustryGroup`, and `getIndustryLabel`.

## Group Translation Table
- Source: `src/lib/present/pressure_translations.ts`
- Defines owner-felt language for every `IndustryGroup × PressureKey` pair.
- Keeps language specific without hand-writing per-industry narratives.

## Named Industry Overrides
- Source: `src/lib/present/pressure_translations_overrides.ts`
- 10 launch-polish industries override the group defaults.
- Required phrases (HVAC, painter, taco stand) are enforced here.

## Resolver
- Source: `src/lib/present/resolve_pressure_translation.ts`
- Resolution order: industry override -> group translation -> fallback.
- Includes `fallback_used` for internal diagnostics only.

## Tests
- `src/lib/present/__tests__/pressure_translation.test.ts`
- Confirms: required phrases, cross-group differentiation, and full coverage.
