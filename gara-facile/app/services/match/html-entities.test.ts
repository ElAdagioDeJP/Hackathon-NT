import assert from "node:assert/strict";
import { test } from "node:test";
import { decodeHtmlEntities } from "./html-entities";

test("decodes numeric entities in TED titles", () => {
  assert.equal(
    decodeHtmlEntities("Supporto all&#8217;analisi della qualit&#224;"),
    "Supporto all’analisi della qualità",
  );
});

test("decodes hex and named entities", () => {
  assert.equal(decodeHtmlEntities("A &amp; B &#x2013; &quot;C&quot;"), 'A & B – "C"');
});

test("leaves plain text and unknown entities untouched", () => {
  assert.equal(decodeHtmlEntities("Comune di Padova"), "Comune di Padova");
  assert.equal(decodeHtmlEntities("&unknown; &#0;"), "&unknown; &#0;");
});
