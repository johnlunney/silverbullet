import { parse } from "./parse_tree.ts";
import buildMarkdown from "./parser.ts";
import {
  collectNodesOfType,
  findNodeOfType,
  renderToText,
} from "../../plug-api/lib/tree.ts";
import { assertEquals, assertNotEquals } from "../../test_deps.ts";

const sample1 = `---
type: page
tags:
- hello
- world
---
# This is a doc

Here is a [[wiki link]] and a [[wiki link|alias]].

Supper`;

const anywhereSample1 = `
# This is a doc
---
type: section
---

* And here's an empty frontmatter block:
  ---
  bla: sup
  ---

And here comes a horizontal rule:

---

And another one:

------

And another one:

---`;

const itemSample1 = `
* Item 1
  ---
  id: 1
  ---
* Item 2
`;

const sampleInvalid1 = `---
name: Zef
# This is a doc

Supper`;

const sampleInvalid2 = `---

name: Zef
---

Sup`;

Deno.test("Test parser", () => {
  const lang = buildMarkdown([]);
  let tree = parse(lang, sample1);
  // console.log("tree", JSON.stringify(tree, null, 2));
  // Check if rendering back to text works
  assertEquals(renderToText(tree), sample1);

  // Find wiki link and wiki link alias
  const links = collectNodesOfType(tree, "WikiLink");
  assertEquals(links.length, 2);
  const nameNode = findNodeOfType(links[0], "WikiLinkPage");
  assertEquals(nameNode?.children![0].text, "wiki link");

  // Check if alias is parsed properly
  const aliasNode = findNodeOfType(links[1], "WikiLinkAlias");
  assertEquals(aliasNode?.children![0].text, "alias");

  // Find frontmatter
  let node = findNodeOfType(tree, "FrontMatter");
  assertNotEquals(node, undefined);

  // Find frontmatter anywhere
  tree = parse(lang, anywhereSample1);
  assertNotEquals(node, undefined);
  console.log("Tree", JSON.stringify(tree, null, 2));
  node = findNodeOfType(tree, "FrontMatter");
  assertNotEquals(node, undefined);

  // Find item
  tree = parse(lang, itemSample1);
  assertNotEquals(node, undefined);
  console.log("Tree", JSON.stringify(tree, null, 2));

  // Test invalid frontmatter
  tree = parse(lang, sampleInvalid1);
  node = findNodeOfType(tree, "FrontMatter");
  // console.log("Invalid node", node);
  assertEquals(node, undefined);

  tree = parse(lang, sampleInvalid2);
  node = findNodeOfType(tree, "FrontMatter");
  // console.log("Invalid node", node);
  assertEquals(node, undefined);
});

const directiveSample = `
Before
<!-- #query page -->
Body line 1

Body line 2
<!-- /query -->
End
`;

const nestedDirectiveExample = `
Before
<!-- #query page -->
1
<!-- #eval 10 * 10 -->
100
<!-- /eval -->
3
<!-- /query -->
End
`;

Deno.test("Test directive parser", () => {
  const lang = buildMarkdown([]);
  let tree = parse(lang, directiveSample);
  // console.log("tree", JSON.stringify(tree, null, 2));
  assertEquals(renderToText(tree), directiveSample);

  tree = parse(lang, nestedDirectiveExample);
  // console.log("tree", JSON.stringify(tree, null, 2));
  assertEquals(renderToText(tree), nestedDirectiveExample);

  const orderByExample = `<!-- #query page order by lastModified -->
  
  <!-- /query -->`;
  tree = parse(lang, orderByExample);
  // console.log("Tree", JSON.stringify(tree, null, 2));
});
