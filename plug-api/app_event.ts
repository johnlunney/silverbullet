import type { ParseTree } from "$sb/lib/tree.ts";
import { TextChange } from "$sb/lib/change.ts";
import { Query } from "$sb/types.ts";

export type AppEvent =
  | "page:click"
  | "editor:complete"
  | "minieditor:complete"
  | "page:load"
  | "editor:init"
  | "editor:pageLoaded" // args: pageName, previousPage, isSynced
  | "editor:pageReloaded"
  | "editor:pageSaved"
  | "editor:modeswitch"
  | "plugs:loaded"
  | "editor:pageModified";

export type QueryProviderEvent = {
  query: Query;
  pageName: string;
};

export type ClickEvent = {
  page: string;
  pos: number;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
};

export type IndexEvent = {
  name: string;
  text: string;
};

export type IndexTreeEvent = {
  name: string;
  tree: ParseTree;
};

export type PublishEvent = {
  uri: string;
  // Page name
  name: string;
};

export type CompleteEvent = {
  pageName: string;
  linePrefix: string;
  pos: number;
  parentNodes: string[];
};

export type WidgetContent = {
  html?: string;
  script?: string;
  markdown?: string;
  url?: string;
  height?: number;
  width?: number;
};

/** PageModifiedEvent payload for "editor:pageModified". Fired when the document text changes
 */
export type PageModifiedEvent = {
  changes: TextChange[];
};
