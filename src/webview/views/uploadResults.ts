export interface UploadMappingResult {
  uid: string;
  order: number;
  values: unknown[];
}

/** Returns one mapped value per successfully uploaded file in selection order. */
export function collectUploadMappingValues(
  results: Iterable<UploadMappingResult>,
  mappingIndex: number,
): unknown[] {
  return Array.from(results)
    .sort((left, right) => left.order - right.order)
    .map((result) => result.values[mappingIndex]);
}
