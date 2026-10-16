import { test } from "node:test";
import assert from "node:assert/strict";
import { AUTH_RETURN, parseAuthReturn } from "../../mobile/src/auth-url";

test("mobile auth accepts only the registered callback and extracts its code", () => {
  assert.deepEqual(parseAuthReturn(`${AUTH_RETURN}?code=one-use`), { code: "one-use", error: null });
  assert.deepEqual(parseAuthReturn(`${AUTH_RETURN}?error=access_denied`), { code: null, error: "access_denied" });
  for (const url of ["not a URL", "https://evil.example/auth/callback?code=x", "com.mytaillog.app://other/callback?code=x", "com.mytaillog.app://auth/other?code=x"]) {
    assert.equal(parseAuthReturn(url), null);
  }
});
