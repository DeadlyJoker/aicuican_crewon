# Bundled expert personas

The 331 Chinese persona files are copied unchanged from `assets/agency-agents-zh` in [MichengAI/dsh-agency-agents](https://github.com/MichengAI/dsh-agency-agents/tree/3612123844c66162e81084ec931d357398a79864), pinned to commit `3612123844c66162e81084ec931d357398a79864`. The English names and descriptions in `catalogue.json` come from the matching `assets/agency-agents` files at the same commit. No application source code from that repository is included.

The original English personas originate from [msitarzewski/agency-agents](https://github.com/msitarzewski/agency-agents). The Chinese translation and localization originate from [jnMetaCode/agency-agents-zh](https://github.com/jnMetaCode/agency-agents-zh). These persona assets retain their MIT licenses in `LICENSE.en` and `LICENSE.zh`. The attribution applies to the personas and extracted metadata. The category display names and starter questions are maintained by CrewON.

To reproduce the import, check out the pinned commit and run `node packages/bundle/agent-teams/scripts/import-experts.mjs /path/to/dsh-agency-agents`. The importer verifies the revision, copies only persona data and their licenses, and records a SHA-256 digest for each copied file. Full persona bodies load only when the user reads or activates an expert.
