import { describe, expect, it } from "vitest";
import { cloudinaryPublicId } from "./imageStorage";

describe("cloudinaryPublicId", () => {
  it("extracts folder and name from a versioned delivery URL", () => {
    expect(
      cloudinaryPublicId(
        "https://res.cloudinary.com/demo/image/upload/v1712345678/kraeuterhexe/abc123.jpg",
      ),
    ).toBe("kraeuterhexe/abc123");
  });

  it("works without a version segment", () => {
    expect(
      cloudinaryPublicId("https://res.cloudinary.com/demo/image/upload/kraeuterhexe/x_y-z.webp"),
    ).toBe("kraeuterhexe/x_y-z");
  });

  it("refuses anything that is not a Cloudinary upload URL", () => {
    expect(cloudinaryPublicId(null)).toBeNull();
    expect(cloudinaryPublicId("/objects/uploads/123")).toBeNull();
    expect(cloudinaryPublicId("https://example.com/image/upload/a.jpg")).toBeNull();
    expect(cloudinaryPublicId("http://res.cloudinary.com/demo/image/upload/a.jpg")).toBeNull();
  });
});
