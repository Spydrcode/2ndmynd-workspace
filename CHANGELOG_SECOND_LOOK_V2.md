# Second Look V2 Changelog

## What changed

- Added `docs/CURRENT_STATE.md` with a traced map of the existing workspace spine.
- Added strict contracts for Second Look V2:
  - `src/lib/second_look_v2/contracts/second_look_intake_v2.ts`
  - `src/lib/second_look_v2/contracts/second_look_artifact_v2.ts`
- Added assembly layer:
  - `src/lib/second_look_v2/assembly/module_registry.ts`
  - `src/lib/second_look_v2/assembly/selector.ts`
  - `src/lib/second_look_v2/assembly/assembler.ts`
- Wired optional Second Look generation into `runAnalysisFromPack` and run persistence payloads.
- Added dedicated API route: `src/app/api/second-look/route.ts`.
- Added new guided capture UI:
  - `src/app/second-look/page.tsx`
  - `src/app/second-look/SecondLookWizard.tsx`
- Added print export route for browser PDF save:
  - `src/app/second-look/[run_id]/print/page.tsx`
- Added fixture intake:
  - `fixtures/second_look/intake_diamondback_like.json`
- Added tests for contracts, selector/assembler behavior, and doctrine language guards.

## How to run

1. `npm install`
2. `npm run dev`
3. Open `/second-look`
4. Select a source run from existing uploads/runs.
5. Complete the wizard and generate the artifact.

## Diamondback-style generation flow

1. Use a source run with quote/invoice data already ingested.
2. In the wizard, pick values including `safety_compliance` and `customer_communication`.
3. Pick pressure sources including `compliance_risk` and `tools_message_overload`.
4. Generate.
5. The selector prioritizes safety/comms modules and keeps artifact scope finite (max 6 modules, 2 paths + neither, bounded plan).
