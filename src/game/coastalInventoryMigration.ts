type RecordValue = Record<string, unknown>;
const record = (value: unknown): value is RecordValue =>
  !!value && typeof value === 'object' && !Array.isArray(value);

/** Only absent extension fields are migrated. Corruption remains visible to
 * the ordinary validator; coastal saves must already contain complete stocks. */
export function migrateCoastalInventories(value: unknown): void {
  if (
    !record(value) ||
    (record(value.mapGeneration) && value.mapGeneration.coastalRules !== undefined)
  )
    return;
  const extend = (inventory: unknown) => {
    if (!record(inventory)) return;
    for (const key of ['fish', 'cookedFish'])
      if (!Object.hasOwn(inventory, key)) inventory[key] = 0;
  };
  extend(value.resources);
  if (Array.isArray(value.cities))
    for (const city of value.cities)
      if (record(city)) {
        extend(city.resources);
        extend(city.production);
      }
  if (Array.isArray(value.caravans))
    for (const caravan of value.caravans) if (record(caravan)) extend(caravan.resources);
  if (record(value.foreignPolicy) && Array.isArray(value.foreignPolicy.raids))
    for (const raid of value.foreignPolicy.raids) if (record(raid)) extend(raid.resources);
}
