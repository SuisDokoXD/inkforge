import { describe, expect, it } from "vitest";
import { ZipReader } from "../zip-reader";

describe("ZipReader limits", () => {
  it("rejects archives above the configured input limit before parsing", () => {
    expect(() => new ZipReader(Buffer.alloc(11), { maxArchiveBytes: 10 })).toThrow(
      /archive is too large/,
    );
  });

  it("rejects buffers without a valid end-of-central-directory record", () => {
    expect(() => new ZipReader(Buffer.from("not a zip"))).toThrow(/EOCD not found/);
  });
});
