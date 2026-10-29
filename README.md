# STEP to DSTV converter — experimental browser preview

This repository contains the prebuilt browser app and its dependency notices.
STEP files are processed in the visitor's browser, in a dedicated WASM worker.
No server-side conversion, file-upload service or database is used.

Supported geometry and provenance limits are in [SOURCE-NOTICE.md](SOURCE-NOTICE.md).
Output is experimental; software checks and ProCAM/machine acceptance are separate.
This is a user-maintained preview, separate from the official SolidCraft website.

## Publish with GitHub Pages

In this repository's Settings > Pages, select **Deploy from a branch**,
then **main** and **/(root)**. Save and wait for the Pages deployment to finish.
The empty `.nojekyll` file keeps the prebuilt assets unchanged.

Open the published HTTPS URL, wait for WASM ENGINE READY, load an analytic
sample, confirm its orientation, enter a grade and download a test NC1.

## Update

Build and verify the converter in the separate SolidCraftDSTV development project.
Prepare a fresh deployment bundle, then commit its site files here. The
`bundle.json` manifest records SHA-256 for each original browser asset.
Keep all notices and the pkg/ folder. Do not add customer STEP/NC1 files or
workshop reference data to this deployment repository.

Build and GitHub Pages instructions are documented in
https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site
