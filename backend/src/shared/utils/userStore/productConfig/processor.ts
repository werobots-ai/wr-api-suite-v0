import type { ProductKeyConfig } from "../../../types/Products";
import {
  CV_PARSER_PRODUCT_ID,
  DOCUMENT_ANALYSIS_PRODUCT_ID,
  API_PLATFORM_PRODUCT_ID,
} from "../../../types/Products";
import type { ProductConfigInput, ProductList } from "./types";
import { buildDocumentConfig, isDocumentConfig } from "./document";
import {
  buildCvParserConfig,
  isCvParserConfig,
  isLegacyCvParser,
} from "./cvParser";
import { buildApiPlatformConfig, isApiPlatformConfig } from "./apiPlatform";

type EntryHandlers = {
  seen: Set<string>;
  normalized: ProductList;
};

type Factory = () => ProductKeyConfig;

type Entry = ProductConfigInput | null | undefined;

export function processEntries(
  entries: Entry[],
  handlers: EntryHandlers,
): void {
  for (const raw of entries) {
    processEntry(raw, handlers);
  }
}

function processEntry(entry: Entry, handlers: EntryHandlers): void {
  if (!entry || typeof entry !== "object") return;
  const productId = entry.productId as string | undefined;
  if (isLegacyCvParser(productId)) {
    addIfMissing(handlers, CV_PARSER_PRODUCT_ID, () =>
      buildCvParserConfig(entry as Parameters<typeof buildCvParserConfig>[0]),
    );
    return;
  }
  if (isDocumentConfig(productId)) {
    addIfMissing(handlers, DOCUMENT_ANALYSIS_PRODUCT_ID, () =>
      buildDocumentConfig(entry as Parameters<typeof buildDocumentConfig>[0]),
    );
    return;
  }
  if (isCvParserConfig(productId)) {
    addIfMissing(handlers, CV_PARSER_PRODUCT_ID, () =>
      buildCvParserConfig(entry as Parameters<typeof buildCvParserConfig>[0]),
    );
    return;
  }
  if (isApiPlatformConfig(productId)) {
    addIfMissing(handlers, API_PLATFORM_PRODUCT_ID, () =>
      buildApiPlatformConfig(entry as Parameters<typeof buildApiPlatformConfig>[0]),
    );
  }
}

function addIfMissing(
  handlers: EntryHandlers,
  productId: string,
  factory: Factory,
): void {
  if (handlers.seen.has(productId)) return;
  handlers.normalized.push(factory());
  handlers.seen.add(productId);
}
