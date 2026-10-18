import { Router, type IRouter, type Request, type Response } from "express";
import { ScanInsectBody } from "@workspace/api-zod";
import { classifyScanSubject } from "../lib/plantIdentification";
import { requireApproved } from "../middlewares/requireApproved";
import { handlePlantScan } from "./plants";
import { handleInsectScan } from "./insects";

const router: IRouter = Router();

/**
 * Universal scan: one button for plants, mushrooms and insects.
 *
 * A cheap first AI call decides what the photo shows, then the request is
 * handed to the normal plant or insect scan. Those keep doing everything they
 * did before (cost brake, daily limit, deduplication, archive), and their
 * response is returned unchanged: the client tells the two apart by the
 * `plant` or `insect` key.
 *
 * For plants the classification doubles as the quick identification, so a
 * plant scan costs no extra AI call. Insects get the full insect identification
 * with the more capable model, exactly as on the insect page.
 */
router.post("/scan", requireApproved, async (req: Request, res: Response): Promise<void> => {
  const parsed = ScanInsectBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (!/^data:image\/[a-z0-9.+-]+;base64,.+/is.test(parsed.data.image)) {
    res.status(400).json({ error: "image muss eine Bild-Daten-URL sein." });
    return;
  }

  const startedAt = Date.now();
  let classification;
  try {
    classification = await classifyScanSubject(parsed.data.image);
  } catch (err) {
    req.log.error({ err }, "Scan subject classification failed");
    // 5xx: the client keeps the photo and retries automatically.
    res.status(502).json({ error: "AI-Erkennung fehlgeschlagen" });
    return;
  }
  req.log.info(
    { subject: classification.subject, classifyMs: Date.now() - startedAt },
    "Scan subject classified",
  );

  switch (classification.subject) {
    case "insekt":
      await handleInsectScan(req, res);
      return;
    case "pflanze":
      await handlePlantScan(req, res, { quick: classification.plant });
      return;
    case "tier":
      res.status(422).json({
        code: "TIER_ERKANNT",
        error:
          "Das sieht nach einem Tier aus. Die Tier-Erkennung kommt mit dem Tier-Modul. Bis dahin kannst du Pflanzen, Pilze und Insekten scannen.",
      });
      return;
    default:
      res.status(422).json({
        code: "KEIN_MOTIV",
        error:
          "Auf dem Foto ist weder eine Pflanze noch ein Pilz oder Insekt zu erkennen. Bitte fotografiere das Motiv möglichst nah und scharf.",
      });
  }
});

export default router;
