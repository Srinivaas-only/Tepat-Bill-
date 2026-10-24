# RunPod

**Not used in this project.**

Tepat Bill's only AI workload is reading documents (extracting fields from invoice, order and delivery-note images). That is done by the hosted **Google Gemini API**, called server-side through the Vercel AI SDK (`src/shared/core/extract.ts`). There is no self-hosted model, no GPU workload and no RunPod endpoint, so there is no `handler.py` here.

See the *How We Use RunPod* section in the main [README](../README.md).
