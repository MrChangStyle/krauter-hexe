import { Router, type IRouter } from "express";
import { ReverseGeocodeBody } from "@workspace/api-zod";
import { reverseGeocode } from "../lib/reverseGeocode";
import { requireApproved } from "../middlewares/requireApproved";

const router: IRouter = Router();

/**
 * POST /geo/reverse
 *
 * Accepts WGS-84 coordinates and returns the nearest major DACH city name.
 * Lookup is bundled (offline, no external API) so no key is required.
 * The region string is stored on the scan row; coordinates are never persisted.
 */
router.post(
  "/geo/reverse",
  requireApproved,
  async (req, res): Promise<void> => {
    const parsed = ReverseGeocodeBody.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: "lat und lon müssen gültige Koordinaten sein." });
      return;
    }

    const region = reverseGeocode(parsed.data.lat, parsed.data.lon);
    res.json({ region });
  },
);

export default router;
